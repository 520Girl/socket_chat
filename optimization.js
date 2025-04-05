const { redis } = require('./db');
const { User, Group } = require('./model');
const { SocketOnGroupUnreadUpdate } = require('./constants');
/**
 * 解决用户登录后,前端意外退出，后台在线状态未更新问题
 * 知识点：pong 是客户端发送给服务端的一个心跳包，用于保持连接的活跃状态。 ping 是服务端发送给客户端的一个心跳包，用于保持连接的活跃状态。
 * 默认pingTimeout为20s，pingInterval为25s
 * 方案：
 * 1. 手动退出：前端退出时，发送请求给后台，后台更新用户状态
 * 2. 自动退出：使用socket.io的心跳机制 + redis，定时发送心跳包，后台收到心跳包后，更新用户状态
 */

// 存储用户心跳状态的Redis键前缀
const REDIS_HEARTBEAT_PREFIX = 'user:heartbeat:';
// 用户在线状态的Redis键前缀
const REDIS_ONLINE_PREFIX = 'user:online:';
// 未读消息计数的Redis键前缀
const REDIS_UNREAD_COUNT_PREFIX = 'user:unread:';
// 最后一条消息的Redis键前缀
const REDIS_LAST_MESSAGE_PREFIX = 'user:lastmsg:';
// 群组未读消息计数的Redis键前缀
const REDIS_GROUP_UNREAD_PREFIX = 'group:unread:';
// 群组最后一条消息的Redis键前缀
const REDIS_GROUP_LAST_MESSAGE_PREFIX = 'group:lastmsg:';
// 未读消息缓存过期时间（7天）
const UNREAD_CACHE_EXPIRY = 60 * 60 * 24 * 7;
// 心跳超时时间（毫秒）
const HEARTBEAT_TIMEOUT = 30000; // 30秒
// 心跳检查间隔（毫秒）
const HEARTBEAT_CHECK_INTERVAL = 15000; // 15秒

/**
 * 初始化用户心跳检测
 * @param {Object} socket - Socket.io socket对象
 */
const heartbeatStart = async (socket) => {
    if (!socket._id) {
        console.log('[Heartbeat] Socket没有关联用户ID');
        return;
    }

    const userId = socket._id;
    const socketId = socket.id;

    // 在Redis中设置用户心跳状态
    await redis.set(`${REDIS_HEARTBEAT_PREFIX}${socketId}`, userId, 'EX', Math.ceil(HEARTBEAT_TIMEOUT / 1000));
    await redis.set(`${REDIS_ONLINE_PREFIX}${userId}`, socketId, 'EX', Math.ceil(HEARTBEAT_TIMEOUT / 1000));

    // 更新用户在线状态
    console.log(`[Heartbeat] 用户sssssssssssssss ${userId} 上线，socketId: ${socketId}`);
    await User.findByIdAndUpdate(userId, { online: true, lastActive: Date.now(), socketId });

    console.log(`[Heartbeat] 用户 ${userId} 心跳检测已启动`);

    // 监听socket连接的packet事件，处理心跳包
    socket.conn.on('packet', async (packet) => {
        // packet.type 2表示ping，3表示pong
        if (packet.type === 'ping' || packet.type === 'pong') {
            try {
                // 更新Redis中的心跳时间
                await redis.set(`${REDIS_HEARTBEAT_PREFIX}${socketId}`, userId, 'EX', Math.ceil(HEARTBEAT_TIMEOUT / 1000));
                await redis.set(`${REDIS_ONLINE_PREFIX}${userId}`, socketId, 'EX', Math.ceil(HEARTBEAT_TIMEOUT / 1000));

                // 更新用户最后活跃时间
                await User.findByIdAndUpdate(userId, { lastActive: Date.now(), socketId: socket.id });

                console.log(`[Heartbeat] 用户 ${userId} 心跳包 ${packet.type === 2 ? 'ping' : 'pong'} 已处理`);
            } catch (error) {
                console.error('[Heartbeat] 处理心跳包错误:', error);
            }
        }
    });

    // 设置心跳检查定时器
    // const heartbeatInterval = setInterval(async () => {
    //     try {
    //         // 检查用户是否仍然在Redis中有效
    //         const isAlive = await redis.exists(`${REDIS_HEARTBEAT_PREFIX}${socketId}`);

    //         if (!isAlive) {
    //             console.log(`[Heartbeat] 用户 ${userId} 心跳超时，标记为离线`);
    //             clearInterval(heartbeatInterval);

    //             // 更新用户状态为离线
    //             await User.findByIdAndUpdate(userId, { online: false, lastActive: Date.now() });

    //             // 清理Redis中的数据
    //             await redis.del(`${REDIS_ONLINE_PREFIX}${userId}`);
    //         }
    //     } catch (error) {
    //         console.error('[Heartbeat] 心跳检查错误:', error);
    //     }
    // }, HEARTBEAT_CHECK_INTERVAL);

    // 当socket断开连接时清除定时器
    // socket.on('disconnect', async () => {
    //     // clearInterval(heartbeatInterval);

    //     // 更新用户状态为离线
    //     await User.findByIdAndUpdate(userId, { online: false, lastActive: Date.now() });

    //     // 清理Redis中的数据
    //     await redis.del(`${REDIS_HEARTBEAT_PREFIX}${socketId}`);
    //     await redis.del(`${REDIS_ONLINE_PREFIX}${userId}`);

    //     console.log(`[Heartbeat] 用户 ${userId} 断开连接，心跳检测已停止`);
    // });
};



/**
 * 获取在线用户列表
 * @returns {Promise<Array>} 在线用户ID列表
 */
const getOnlineUsers = async () => {
    try {
        // // 获取所有在线用户的键
        // const keys = await redis.keys(`${REDIS_ONLINE_PREFIX}*`);

        // // 提取用户ID
        // const userIds = keys.map(key => key.replace(REDIS_ONLINE_PREFIX, ''));

        // return userIds;
        // 查询在线用户并选择需要的字段
        const users = await User.find({ online: true })
            .select('name img socketId online')
            .lean();
        return users;
    } catch (error) {
        console.error('[Heartbeat] 获取在线用户列表错误:', error);
        return [];
    }
};

/**
 * socket 事件处理时间监控中间件
 * 
 * */
const socketMiddlewareTimer = (io) => {
    // 添加事件处理时间监控中间件
    io.use((socket, next) => {
        const originalEmit = socket.emit;
        socket.emit = function () {
            const startTime = Date.now();
            const result = originalEmit.apply(socket, arguments);
            const endTime = Date.now();
            console.log(`Socket事件 ${arguments[0]} 处理时间: ${endTime - startTime}ms`);
            return result;
        };

        const originalOn = socket.on;
        socket.on = function (eventName, callback) {
            if (typeof callback === 'function') {
                return originalOn.call(socket, eventName, async (...args) => {
                    const startTime = Date.now();
                    try {
                        await callback.apply(this, args);
                    } finally {
                        const endTime = Date.now();
                        console.log(`Socket事件 ${eventName} 处理时间: ${endTime - startTime}ms`);
                    }
                });
            }
            return originalOn.apply(socket, arguments);
        };
        next();
    });
}

/**
 * 增加私聊未读消息计数
 * @param {String} userId - 接收者用户ID
 * @param {String} senderId - 发送者用户ID
 * @param {Object} messageData - 消息数据
 * @returns {Promise<Number>} 更新后的未读消息数
 */
const incrementUnreadCount = async (userId, senderId, messageData) => {
    try {
        // 用户未读消息计数键
        const unreadKey = `${REDIS_UNREAD_COUNT_PREFIX}${userId}:${senderId}`;
        // 用户最后一条消息键
        const lastMsgKey = `${REDIS_LAST_MESSAGE_PREFIX}${userId}:${senderId}`;

        // 原子操作：增加未读计数并设置过期时间
        const pipeline = redis.pipeline();
        pipeline.incr(unreadKey);
        pipeline.expire(unreadKey, UNREAD_CACHE_EXPIRY);

        // 存储最后一条消息
        pipeline.set(lastMsgKey, JSON.stringify(messageData), 'EX', UNREAD_CACHE_EXPIRY);

        const results = await pipeline.exec();
        console.log('[未读消息] 增加未读计数结果:', results); //[ [ null, 2 ], [ null, 1 ], [ null, 'OK' ] ]
        // 返回更新后的未读计数
        return results[0][1];
    } catch (error) {
        console.error('[未读消息] 增加未读计数错误:', error);
        return 0;
    }
};

/**
 * 增加群组未读消息计数
 * @param {String} groupId - 群组ID
 * @param {String} userId - 用户ID
 * @param {Object} messageData - 消息数据
 * @returns {Promise<Object>} 包含每个成员ID和其未读消息计数的对象
 */
const incrementGroupUnreadCount = async (groupId, userId, messageData) => {
    try {
        // 获取群组所有成员
        const group = await Group.findById(groupId).select('members name');
        if (!group) return {};

        const pipeline = redis.pipeline();
        const memberIds = [];

        // 为群组中除发送者外的所有成员增加未读计数
        for (const member of group.members) {
            const memberId = member.user.toString();
            // 跳过消息发送者自己
            if (memberId === userId) continue;

            memberIds.push(memberId);

            // 用户的群组未读消息计数键
            const unreadKey = `${REDIS_GROUP_UNREAD_PREFIX}${memberId}:${groupId}`;
            // 群组最后一条消息键
            const lastMsgKey = `${REDIS_GROUP_LAST_MESSAGE_PREFIX}${memberId}:${groupId}`;

            // 增加未读计数并设置过期时间
            pipeline.incr(unreadKey);
            pipeline.expire(unreadKey, UNREAD_CACHE_EXPIRY);
            //将群的name 存入数据
            messageData.groupName = group.name;

            // 存储最后一条消息
            pipeline.set(lastMsgKey, JSON.stringify(messageData), 'EX', UNREAD_CACHE_EXPIRY);
        }

        const results = await pipeline.exec();
        //[
        //   [ null, 2 ],
        //   [ null, 1 ],
        //   [ null, 'OK' ],
        //   [ null, 3 ],
        //   [ null, 1 ],
        //   [ null, 'OK' ]
        // ]
        // console.log('[未读消息] 增加群组未读计数结果:', results);

        // 返回每个成员的未读计数
        const unreadCounts = {};
        let resultIndex = 0;
        for (const memberId of memberIds) {
            // 每个成员有3个操作：incr, expire, set，所以取第一个操作的结果
            unreadCounts[memberId] = results[resultIndex][1];
            resultIndex += 3; // 跳过expire和set操作的结果
        }

        return unreadCounts;
    } catch (error) {
        console.error('[未读消息] 增加群组未读计数错误:', error);
        return {};
    }
};

/**
 * 获取用户所有未读消息计数
 * @param {String} userId - 用户ID
 * @returns {Promise<Object>} 未读消息计数和最后一条消息
 */
const getUserUnreadMessages = async (userId) => {
    try {
        // 获取所有私聊未读消息键
        const privateUnreadKeys = await redis.keys(`${REDIS_UNREAD_COUNT_PREFIX}${userId}:*`);
        //[
        //   'user:unread:67ed6790398dd9e6a9876e1f:67ed6eef2cb648c8bea90cea',
        //   'user:unread:67ed6790398dd9e6a9876e1f:67ed6f8b2cb648c8bea90d9f'
        // ]
        // 获取所有群组未读消息键
        const groupUnreadKeys = await redis.keys(`${REDIS_GROUP_UNREAD_PREFIX}${userId}:*`);

        const result = {
            private: [],
            group: []
        };

        // 处理私聊未读消息
        if (privateUnreadKeys.length > 0) {
            const pipeline = redis.pipeline();

            // 获取所有未读计数
            for (const key of privateUnreadKeys) {
                pipeline.get(key);
                // 获取对应的最后一条消息
                const senderId = key.split(':')[3];
                // 正确构造最后一条消息的键名
                const lastMsgKey = `${REDIS_LAST_MESSAGE_PREFIX}${userId}:${senderId}`;
                pipeline.get(lastMsgKey);
            }

            const responses = await pipeline.exec();
            // 处理结果
            for (let i = 0; i < privateUnreadKeys.length; i++) {
                const key = privateUnreadKeys[i];
                const senderId = key.split(':')[3];
                const count = parseInt(responses[i * 2][1] || '0');
                const lastMessage = responses[i * 2 + 1][1] ? JSON.parse(responses[i * 2 + 1][1]) : null;

                result.private.push({
                    userId,
                    unreadCount: count,
                    lastMessage:{
                        ...lastMessage,
                        senderId
                    },
                });
            }
        }

        // 处理群组未读消息
        if (groupUnreadKeys.length > 0) {
            const pipeline = redis.pipeline();

            // 获取所有未读计数
            for (const key of groupUnreadKeys) {
                pipeline.get(key);
                // 获取对应的最后一条消息
                const groupId = key.split(':')[3];
                pipeline.get(`${REDIS_GROUP_LAST_MESSAGE_PREFIX}${userId}:${groupId}`);
            }

            const responses = await pipeline.exec();

            // 处理结果
            for (let i = 0; i < groupUnreadKeys.length; i++) {
                const key = groupUnreadKeys[i];
                const groupId = key.split(':')[3];
                const count = parseInt(responses[i * 2][1] || '0');
                const lastMessage = responses[i * 2 + 1][1] ? JSON.parse(responses[i * 2 + 1][1]) : null;

                result.group.push({
                    userId,
                    groupId,
                    unreadCount: count,
                    lastMessage
                });
            }
        }

        return result;
    } catch (error) {
        console.error('[未读消息] 获取未读消息错误:', error);
        return { private: [], group: [] };
    }
};

/**
 * 标记私聊消息为已读
 * @param {String} userId - 接收者用户ID
 * @param {String} senderId - 发送者用户ID
 * @returns {Promise<void>}
 */
const markPrivateMessagesAsRead = async (userId, senderId) => {
    try {
        // 删除Redis中的未读计数
        const unreadKey = `${REDIS_UNREAD_COUNT_PREFIX}${userId}:${senderId}`;
        await redis.del(unreadKey);

        // 更新数据库中的消息状态
        await PrivateMessage.updateMany(
            {
                sender: senderId,
                receiver: userId,
                isRead: false
            },
            { isRead: true }
        );
    } catch (error) {
        console.error('[未读消息] 标记私聊消息已读错误:', error);
    }
};

/**
 * 标记群组消息为已读
 * @param {String} userId - 用户ID
 * @param {String} groupId - 群组ID
 * @returns {Promise<void>}
 */
const markGroupMessagesAsRead = async (userId, groupId) => {
    try {
        // 删除Redis中的未读计数
        const unreadKey = `${REDIS_GROUP_UNREAD_PREFIX}${userId}:${groupId}`;
        await redis.del(unreadKey);
    } catch (error) {
        console.error('[未读消息] 标记群组消息已读错误:', error);
    }
};

// 广播群组未读消息更新的函数
const broadcastGroupUnreadUpdate = async (io, socket, groupId, senderId, messageData) => {
    try {
        const group = await Group.findById(groupId).select('members');
        if (!group) return;

        for (const member of group.members) {
            const memberId = member.user.toString();

            // 跳过消息发送者自己
            if (memberId === senderId) continue;

            // 获取该成员的未读消息计数
            const unreadKey = `${REDIS_GROUP_UNREAD_PREFIX}${memberId}:${groupId}`;
            const unreadCount = await redis.get(unreadKey) || 0;

            // 获取该成员的在线状态和socket信息
            const memberUser = await User.findById(memberId).select('socketId online');
            // console.log(`memberUser: ${memberUser}`);
            // 使用io.to()替代socket.to()，避免影响连接状态
            if (memberUser && memberUser.online && memberUser.socketId) {
                io.to(memberUser.socketId).emit(SocketOnGroupUnreadUpdate, {
                    groupId,
                    unreadCount: unreadCount,
                    lastMessage: messageData.content
                });
            }
        }
    } catch (error) {
        console.error('广播群组未读消息更新错误:', error);
    }
};

module.exports = {
    heartbeatStart,
    getOnlineUsers,
    socketMiddlewareTimer,
    REDIS_HEARTBEAT_PREFIX,
    REDIS_ONLINE_PREFIX,
    REDIS_UNREAD_COUNT_PREFIX,
    REDIS_GROUP_UNREAD_PREFIX,
    incrementUnreadCount,
    incrementGroupUnreadCount,
    getUserUnreadMessages,
    markPrivateMessagesAsRead,
    markGroupMessagesAsRead,
    broadcastGroupUnreadUpdate
}