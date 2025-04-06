const socketio = require('socket.io');
const mongoose = require('mongoose');
const { redis } = require('./db');
const {
    SocketEmitGroupMsg, SocketEmitGroupJoin,
    SocketOnGroupMsg, SocketOnGroupWelcomeJoin,
    SocketEmitGroupLeave, SocketOnGroupLeave,
    SocketEmitPrivate, SocketOnPrivate,
    SocketEmitUserConnect, SocketOnUserConnect,
    GetEmitOnlineUsers, OnlineUsersList,
    SocketHeartBeat, SocketEmitTempLeaveGroup,
    SocketOnTempLeaveGroup, SocketEmitGetUnreadCount,
    SocketEmitMarkPrivateRead, SocketEmitMarkGroupRead,
    SocketOnUnreadCountUpdate, SocketOnGroupUnreadUpdate
} = require('./constants');
const { User, PrivateMessage, Group, GroupMessage } = require('./model');
const {
    heartbeatStart, getOnlineUsers, socketMiddlewareTimer,
    REDIS_HEARTBEAT_PREFIX, REDIS_ONLINE_PREFIX, REDIS_GROUP_UNREAD_PREFIX,
    incrementUnreadCount, incrementGroupUnreadCount,
    getUserUnreadMessages, markPrivateMessagesAsRead, markGroupMessagesAsRead,
    broadcastGroupUnreadUpdate
} = require('./optimization');
const { getMessageHistory } = require('./dataLayerManager');
module.exports = (httpServer, core) => {
    const io = socketio(httpServer, core);

    socketMiddlewareTimer(io);


    io.on('connection', (socket) => {
        console.log('创建了一个socket连接');

        //! 用户连接时记录用户信息
        // 这个方案预留了可以登录用户创建 用户的功能
        socket.on(SocketEmitUserConnect, async ({ name, img, _id }) => {
            try {
                let user = await User.findById(_id);
                socket._id = _id;
                if (!user) {
                    user = await User.create({
                        name,
                        img,
                        online: true,
                        socketId: socket.id
                    })
                }
                // 启动心跳检测 并处理用户信息
                await heartbeatStart(socket);

                //获取所有在线用户
                const onlineUsers = await getOnlineUsers();

                // 广播最新的用户列表 
                //该方法会把所有用户都收到包括自己
                io.emit(OnlineUsersList, {
                    userList: onlineUsers,
                    onlineUsersNum: onlineUsers.length
                });
            } catch (e) {
                console.error('用户的功能错误:', e);
            }
        })

        //!一对一聊天
        socket.on(SocketEmitPrivate, async ({ toUid, msg }) => {
            try {
                console.log('发送消息:', toUid, msg, socket.id);
                //查询发送者和接收者（使用一次查询）
                const [sender, receiver] = await Promise.all([
                    User.findOne({ socketId: socket.id }),
                    User.findById(toUid)
                ]);

                if (!sender || !receiver) return;

                // 存储私聊消息到数据库
                const message = await PrivateMessage.create({
                    sender: sender._id,
                    receiver: receiver._id,
                    content: msg,
                    type: 'text'
                });

                // 准备消息数据
                const messageData = {
                    id: message._id,
                    content: msg,
                    type: 'text',
                    sentAt: message.sentAt,
                    senderName: sender.name,
                    senderImg: sender.img,
                };

                // 如果接收者在线，发送消息
                if (receiver.online && receiver.socketId) {
                    socket.to(receiver.socketId).emit(SocketOnPrivate, {
                        from: sender._id,
                        // to: receiver._id,
                        name: sender.name,
                        img: sender.img,
                        msg,
                        sentAt: message.sentAt
                    });
                }

                // 无论接收者是否在线，都增加未读消息计数 //2
                const unreadCount = await incrementUnreadCount(receiver._id.toString(), sender._id.toString(), messageData);

                // 如果接收者在线，发送未读消息计数更新
                if (receiver.online && receiver.socketId) {
                    io.to(receiver.socketId).emit(SocketOnUnreadCountUpdate, {
                        senderId: sender._id,
                        unreadCount,
                        lastMessage: messageData.content
                    });
                }

                console.log(`私聊消息: ${sender.name} -> ${receiver.name}: ${msg} (未读: ${unreadCount})`);
            } catch (e) {
                console.error('发送私聊消息错误:', e);
            }
        })

        //!群组聊天
        //todo 监听群消息
        socket.on(SocketEmitGroupMsg, async ({ groupId, senderId, content }) => {
            try {
                // 并行处理消息存储和用户查询
                const [message, sender] = await Promise.all([
                    GroupMessage.create({
                        group: groupId,
                        sender: senderId,
                        content
                    }),
                    User.findById(senderId).select('name img')
                ]);

                // 准备消息数据
                const messageData = {
                    id: message._id,
                    content,
                    type: message.type || 'text',
                    sentAt: message.sentAt,
                    senderName: sender.name,
                    senderImg: sender.img,
                    groupId
                };

                // 增加群组未读消息计数
                await incrementGroupUnreadCount(groupId, senderId, messageData);

                console.log(`群消息: ${sender.name} -> ${groupId}: ${content}`);
                // 广播给群组内所有成员
                socket.to(`group-${groupId}`).emit(SocketOnGroupMsg, {
                    content,
                    sendAt: message.sentAt,
                    img: sender.img,
                    sender: {
                        _id: senderId,
                        name: sender.name
                    }
                });

                // 调用抽取出来的广播未读消息更新函数
                await broadcastGroupUnreadUpdate(io,socket, groupId, senderId, messageData);

            } catch (e) {
                console.error('群消息发送错误:', e);
            }
        });

        //todo 加入群组
        socket.on(SocketEmitGroupJoin, async ({ groupId, userId }) => {
            try {
                socket.join(`group-${groupId}`);
                // 可以在这里更新群组成员状态
                socket.broadcast.to(`group-${groupId}`).emit(SocketOnGroupWelcomeJoin, userId);

            } catch (e) {
                console.error('加入群组错误:', e);
            }
        });

        //todo 暂时离开群组
        socket.on(SocketEmitTempLeaveGroup, async ({ groupId, userId }) => {
            try {
                // 仅离开socket房间
                socket.leave(`group-${groupId}`);
                //需要携带当前用户的信息
                const user = await User.findById(userId).select('name');
                if (!user) return;

                // 可选：通知其他成员用户暂时离开
                socket.to(`group-${groupId}`).emit(SocketOnTempLeaveGroup, {
                    userId,
                    name: user.name || '',
                    groupId
                });
            } catch (e) {
                console.error('临时离开群组错误:', e);
            }
        });

        //todo 完全离开群组（移除成员身份）
        socket.on(SocketEmitGroupLeave, async ({ groupId, userId }) => {
            try {
                // 1. 从群组成员列表中移除
                await Group.updateOne(
                    { _id: groupId },
                    { $pull: { members: { user: userId } } }
                );

                // 2. 离开socket房间
                socket.leave(`group-${groupId}`);

                // 3. 通知群组其他成员
                io.to(`group-${groupId}`).emit(SocketOnGroupLeave, {
                    userId,
                    groupId
                });

                // 4. 更新用户自己的群组列表
                await User.updateOne(
                    { _id: userId },
                    { $pull: { groups: groupId } }
                );

            } catch (e) {
                console.error('完全离开群组错误:', e);
            }
        });

        //! 断开连接需要更新用户信息  disconnect 是在断开连接后触发
        // 用户退出状态
        // 获取未读消息计数
        socket.on(SocketEmitGetUnreadCount, async () => {
            try {
                if (!socket._id) return;

                // 获取用户所有未读消息
                const unreadMessages = await getUserUnreadMessages(socket._id);

                // 发送未读消息计数给用户
                socket.emit(SocketOnUnreadCount, unreadMessages);

                console.log(`[未读消息] 用户 ${socket._id} 获取未读消息计数`);
            } catch (error) {
                console.error('[未读消息] 获取未读消息计数错误:', error);
            }
        });

        // 标记私聊消息为已读
        socket.on(SocketEmitMarkPrivateRead, async ({ senderId }) => {
            try {
                if (!socket._id || !senderId) return;

                await markPrivateMessagesAsRead(socket._id, senderId);

                console.log(`[未读消息] 用户 ${socket._id} 标记来自 ${senderId} 的私聊消息为已读`);
            } catch (error) {
                console.error('[未读消息] 标记私聊消息已读错误:', error);
            }
        });

        // 标记群组消息为已读
        socket.on(SocketEmitMarkGroupRead, async ({ groupId }) => {
            try {
                if (!socket._id || !groupId) return;

                await markGroupMessagesAsRead(socket._id, groupId);

                console.log(`[未读消息] 用户 ${socket._id} 标记群组 ${groupId} 的消息为已读`);
            } catch (error) {
                console.error('[未读消息] 标记群组消息已读错误:', error);
            }
        });

        socket.on('disconnect', async () => {
            try {
                console.log('用户断开连接:', socket.id);
                // 查找用户并更新状态
                const user = await User.findOneAndUpdate(
                    { socketId: socket.id },
                    { online: false, socketId: '', lastActive: Date.now() },
                    { new: true }
                )
                // 清理Redis中的数据
                await redis.del(`${REDIS_HEARTBEAT_PREFIX}${socket.id}`);
                await redis.del(`${REDIS_ONLINE_PREFIX}${socket._id}`);

                console.log(`[Heartbeat] 用户 ${socket._id} 断开连接，心跳检测已停止`);

                if (user) {
                    // 获取所有在线用户的键
                    const keys = await redis.keys(`${REDIS_ONLINE_PREFIX}*`);

                    // 提取用户ID
                    const userIds = keys.map(key => key.replace(REDIS_ONLINE_PREFIX, ''));
                    // 广播用户离开事件
                    io.emit(SocketOnGroupLeave, {
                        name: user.name,
                        onlineUsersNum: userIds.length
                    });

                    // 获取所有在线用户
                    const onlineUsers = await User.find({ online: true });

                    // 推送更新后的在线列表
                    io.emit(OnlineUsersList, {
                        userList: onlineUsers,
                        onlineUsersNum: userIds.length
                    });
                }
            } catch (err) {
                console.error('用户断开连接错误:', err);
            }
        })
        //! 监听客户端离开事件 disconnecting 是在断开连接前触发
        socket.on('disconnecting', async () => {
            try {
                // heartbeats.delete(socket.id);
            } catch (error) {
                console.error('用户断开连接错误:', error);
            }
        });

        // 监听引擎的 ping/pong（通过 socket.io.engine）
        //! 优化方案 - 使用Redis实现心跳机制
        // socket.on('EmitGroupUnreadUpdate', async ({groupId, senderId, content}) => {
        //     console.log('EmitGroupUnreadUpdate', groupId, senderId, content)
        //     await broadcastGroupUnreadUpdate(socket, groupId, senderId, {content:content}) 
        // })
        
        // 获取消息历史记录
        socket.on('GetMessageHistory', async ({ chatId, isGroup, limit }) => {
            try {
                if (!socket._id) return;
                
                // 使用数据分层缓存策略获取消息历史
                const messages = await getMessageHistory(socket._id, chatId, isGroup, limit || 20);
                
                // 发送消息历史给客户端
                socket.emit('MessageHistory', {
                    chatId,
                    isGroup,
                    messages
                });
                
                console.log(`[消息历史] 用户 ${socket._id} 获取${isGroup ? '群组' : '私聊'}消息历史: ${chatId}, 共 ${messages.length} 条`);
            } catch (error) {
                console.error('[消息历史] 获取消息历史错误:', error);
                socket.emit('MessageHistoryError', { error: '获取消息历史失败' });
            }
        });
    })
}