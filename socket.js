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
    SocketOnTempLeaveGroup
} = require('./constants');
const { User, PrivateMessage, Group, GroupMessage } = require('./model');
const { heartbeatStart,getOnlineUsers,socketMiddlewareTimer,REDIS_HEARTBEAT_PREFIX, REDIS_ONLINE_PREFIX } = require('./optimization');
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
                    onlineUsersNum:onlineUsers.length
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
                await PrivateMessage.create({
                    sender: sender._id,
                    receiver: receiver._id,
                    content: msg,
                    type: 'text'
                });

                console.log(`私聊消息: ${sender.name} -> ${receiver.name}: ${msg}`);
                // 发送私聊消息
                socket.to(receiver.socketId).emit(SocketOnPrivate, {
                    from: sender._id,
                    to: receiver._id,
                    name: sender.name,
                    img: sender.img,
                    msg
                });
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

                // 广播给群组内所有成员
                socket.to(`group-${groupId}`).emit(SocketOnGroupMsg,  { 
                    content,
                    sendAt: message.sentAt,
                    img:sender.img
                    });

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
                socket.to(`group-${groupId}`).emit(SocketOnGroupLeave, {
                    userId,
                    groupId
                });

                // 4. 可选：更新用户自己的群组列表
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
                        onlineUsersNum:userIds.length
                    });

                    // 获取所有在线用户
                    const onlineUsers = await User.find({ online: true });

                    // 推送更新后的在线列表
                    io.emit(OnlineUsersList, {
                        userList: onlineUsers,
                        onlineUsersNum:userIds.length
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

    })
}