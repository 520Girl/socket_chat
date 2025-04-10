const { redis } = require('./db');
const { User, Group, PrivateMessage } = require('./model');
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
// 热数据前缀（24小时内的消息）
const REDIS_HOT_DATA_PREFIX = 'hot:';
// 高频数据前缀（7天内的消息）
const REDIS_FREQUENT_DATA_PREFIX = 'freq:';
// 冷数据前缀（7天以上的消息）
const REDIS_COLD_DATA_PREFIX = 'cold:';

// 热数据缓存过期时间（24小时）
const HOT_DATA_CACHE_EXPIRY = 60 * 60 * 24;
// 高频数据缓存过期时间（7天）
const FREQUENT_DATA_CACHE_EXPIRY = 60 * 60 * 24 * 7;
// 冷数据临时缓存过期时间（1小时）
const COLD_DATA_CACHE_EXPIRY = 60 * 60;
// 未读消息缓存过期时间（7天）
// const UNREAD_CACHE_EXPIRY = 60 * 60 * 24 * 7;
// 心跳超时时间（毫秒）
const HEARTBEAT_TIMEOUT = 30000; // 30秒
// 心跳检查间隔（毫秒）
const HEARTBEAT_CHECK_INTERVAL = 15000; // 15秒
// 数据降级检查间隔（毫秒）
const DATA_DOWNGRADE_INTERVAL = 3600000; // 1小时

/**
 * 初始化用户心跳检测
 * @param {Object} socket - Socket.io socket对象
 */
const heartbeatStart = async (socket) => {
    if (!socket.data._id) {
        console.log('[Heartbeat] Socket没有关联用户ID');
        return;
    }

    const userId = socket.data._id;
    const socketId = socket.id;

    // 在Redis中设置用户心跳状态
    await redis.set(`${REDIS_HEARTBEAT_PREFIX}${socketId}`, userId, 'EX', Math.ceil(HEARTBEAT_TIMEOUT / 1000));
    await redis.set(`${REDIS_ONLINE_PREFIX}${userId}`, socketId, 'EX', Math.ceil(HEARTBEAT_TIMEOUT / 1000));

    // 更新用户在线状态
    console.log(`[Heartbeat] 用户 ${userId} 上线，心跳检测已启动,socketId: ${socketId}`);
    // await User.findByIdAndUpdate(userId, { online: true, lastActive: Date.now(), socketId });

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
        const keys = await redis.keys(`${REDIS_ONLINE_PREFIX}*`);

        // // 提取用户ID
        const userIds = keys.map(key => key.replace(REDIS_ONLINE_PREFIX, ''));

        console.log(`[Heartbeat] 获取在线用户列表: ${userIds}`)
        // 查询在线用户并选择需要的字段
        const users = await User.find({ _id: { $in: userIds } })
            .select('name img socketId online')
            .lean();
        return users;
    } catch (error) {
        console.error('[Heartbeat] 获取在线用户列表错误:', error);
        return [];
    }
};
/**
 * 获取指定用户ID的在线状态
 * @param {Object} id
 */
const getOnlineStatus = async (id) => {
    try {
        const keys = await redis.keys(`${REDIS_ONLINE_PREFIX}${id}`);
        return keys.length > 0;
    } catch (error) {
        console.error('[getOnlineStatus] 获取在线状态错误:', error);

    }
}

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
const incrementUnreadCount = async (userId, senderId, messageData, historyMsg) => {
    try {
        // 用户未读消息计数键
        const unreadKey = `${REDIS_UNREAD_COUNT_PREFIX}${userId}:${senderId}`;
        // 用户最后一条消息键 - 基础键名
        const lastMsgBaseKey = `${REDIS_LAST_MESSAGE_PREFIX}${userId}:${senderId}`;
        // 消息历史记录键 - 基础键名（接收者视角）
        const receiverMsgHistoryBaseKey = `user:message:history:${userId}:${senderId}`;
        // 消息历史记录键 - 基础键名（发送者视角）
        const senderMsgHistoryBaseKey = `user:message:history:${senderId}:${userId}`;

        // 添加时间戳，用于数据分层和降级处理
        historyMsg.timestamp = Date.now();
        // 使用MongoDB生成的ID作为唯一标识，而不是手动生成msgId
        const messageId = messageData.id;

        // 当前时间
        const now = Date.now();
        // 热数据时间阈值（24小时内）
        const hotDataThreshold = now - (HOT_DATA_CACHE_EXPIRY * 1000);
        // 高频数据时间阈值（7天内）
        const freqDataThreshold = now - (FREQUENT_DATA_CACHE_EXPIRY * 1000);

        //! 3. 原子操作：增加未读计数并设置过期时间 不过期
        const pipeline = redis.pipeline();
        pipeline.incr(unreadKey);
        // pipeline.expire(unreadKey, UNREAD_CACHE_EXPIRY);

        //! 1. 存储最后一条消息作为热数据 不过期
        const lastMsgHotDataKey = `${lastMsgBaseKey}`;
        pipeline.set(lastMsgHotDataKey, JSON.stringify(messageData));


        //! 2. 存储消息到消息历史记录 过期 - 同时为接收者和发送者创建索引
        // 接收者视角 - 消息历史记录键
        const receiverMsgHistoryKey = `${REDIS_HOT_DATA_PREFIX}${receiverMsgHistoryBaseKey}:${messageId}`;
        pipeline.set(receiverMsgHistoryKey, JSON.stringify(historyMsg), 'EX', HOT_DATA_CACHE_EXPIRY);

        // 发送者视角 - 消息历史记录键
        const senderMsgHistoryKey = `${REDIS_HOT_DATA_PREFIX}${senderMsgHistoryBaseKey}:${messageId}`;
        pipeline.set(senderMsgHistoryKey, JSON.stringify(historyMsg), 'EX', HOT_DATA_CACHE_EXPIRY);

        // 3. 将消息ID添加到消息历史有序集合中，用于后续查询
        // 使用有序集合替代列表，按时间戳排序，确保分页数据一致性
        const score = historyMsg.timestamp || Date.now();

        // 接收者视角 - 有序集合
        const receiverZSetKey = `${REDIS_HOT_DATA_PREFIX}${receiverMsgHistoryBaseKey}:zset`;
        pipeline.zadd(receiverZSetKey, score, messageId);
        pipeline.expire(receiverZSetKey, HOT_DATA_CACHE_EXPIRY);

        // 发送者视角 - 有序集合
        const senderZSetKey = `${REDIS_HOT_DATA_PREFIX}${senderMsgHistoryBaseKey}:zset`;
        pipeline.zadd(senderZSetKey, score, messageId);
        pipeline.expire(senderZSetKey, HOT_DATA_CACHE_EXPIRY);

        const results = await pipeline.exec();
        console.log('[未读消息] 增加未读计数结果:', results);

        // 返回更新后的未读计数
        return results[0][1];
    } catch (error) {
        console.error('[未读消息] 增加未读计数错误:', error);
        return 0;
    }
};

/**
 * 数据降级处理函数 - 将热数据降级为高频数据
 * @param {String} key - Redis键
 * @param {Object} data - 要存储的数据
 * @returns {Promise<void>}
 */
const downgradeHotData = async (key, data) => {
    try {
        // 从热数据键名中提取基础键名
        const baseKey = key.replace(REDIS_HOT_DATA_PREFIX, '');
        // 构造高频数据键名
        const freqDataKey = `${REDIS_FREQUENT_DATA_PREFIX}${baseKey}`;

        // 存储到高频数据层，设置较长的过期时间
        await redis.set(freqDataKey, JSON.stringify(data), 'EX', FREQUENT_DATA_CACHE_EXPIRY);

        console.log(`[数据降级] 热数据 ${key} 已降级为高频数据`);
    } catch (error) {
        console.error('[数据降级] 热数据降级错误:', error);
    }
};

/**
 * 数据降级处理函数 - 将高频数据降级为冷数据
 * @param {String} key - Redis键
 * @param {Object} data - 要存储的数据
 * @returns {Promise<void>}
 */
const downgradeFrequentData = async (key, data) => {
    try {
        // 从高频数据键名中提取基础键名
        const baseKey = key.replace(REDIS_FREQUENT_DATA_PREFIX, '');
        // 构造冷数据键名
        const coldDataKey = `${REDIS_COLD_DATA_PREFIX}${baseKey}`;

        // 存储到冷数据层，设置较短的过期时间
        // 冷数据主要存储在MongoDB中，Redis中只作为临时缓存
        await redis.set(coldDataKey, JSON.stringify(data), 'EX', COLD_DATA_CACHE_EXPIRY);

        console.log(`[数据降级] 高频数据 ${key} 已降级为冷数据`);

        // 这里可以添加将数据持久化到MongoDB的逻辑
        // 例如：更新消息记录的访问频率、最后访问时间等
    } catch (error) {
        console.error('[数据降级] 高频数据降级错误:', error);
    }
};

/**
 * 根据消息时间戳确定数据层级
 * @param {Number} timestamp - 消息时间戳
 * @returns {String} 数据层级前缀
 */
const getDataLayerByTimestamp = (timestamp) => {
    const now = Date.now();
    // 热数据时间阈值（24小时内）
    const hotDataThreshold = now - (HOT_DATA_CACHE_EXPIRY * 1000);
    // 高频数据时间阈值（7天内）
    const freqDataThreshold = now - (FREQUENT_DATA_CACHE_EXPIRY * 1000);

    if (timestamp >= hotDataThreshold) {
        return REDIS_HOT_DATA_PREFIX;
    } else if (timestamp >= freqDataThreshold) {
        return REDIS_FREQUENT_DATA_PREFIX;
    } else {
        return REDIS_COLD_DATA_PREFIX;
    }
};

/**
 * 增加群组未读消息计数
 * @param {String} groupId - 群组ID
 * @param {String} userId - 用户ID - 发送者用户ID
 * @param {Object} messageData - 消息数据
 * @returns {Promise<Object>} 包含每个成员ID和其未读消息计数的对象
 */
const incrementGroupUnreadCount = async (groupId, userId, messageData, historyMsg) => {
    try {
        // 获取群组所有成员
        const group = await Group.findById(groupId).select('members name avatar').lean();
        // console.log('群组信息:', group);
        if (!group) return {};

        const pipeline = redis.pipeline();
        const memberIds = [];

        // 添加时间戳，用于数据分层和降级处理
        historyMsg.timestamp = Date.now();
        // 使用MongoDB生成的ID作为唯一标识
        const messageId = messageData.id;
        //最后一条消息需要添加群组信息
        messageData.groupName = group.name
        messageData.groupImg = group.avatar

        // 当前时间
        const now = Date.now();
        // 热数据时间阈值（24小时内）
        const hotDataThreshold = now - (HOT_DATA_CACHE_EXPIRY * 1000);
        // 高频数据时间阈值（7天内）
        const freqDataThreshold = now - (FREQUENT_DATA_CACHE_EXPIRY * 1000);

        // 为发送者创建消息历史记录，确保发送者也能查询到自己发送的消息
        const senderMsgHistoryBaseKey = `group:message:history:${userId}:${groupId}`;
        const senderMsgHistoryKey = `${REDIS_HOT_DATA_PREFIX}${senderMsgHistoryBaseKey}:${messageId}`;
        pipeline.set(senderMsgHistoryKey, JSON.stringify(historyMsg), 'EX', HOT_DATA_CACHE_EXPIRY);

        // 将消息ID添加到发送者的消息历史有序集合中
        const senderZSetKey = `${REDIS_HOT_DATA_PREFIX}${senderMsgHistoryBaseKey}:zset`;
        const score = historyMsg.timestamp || Date.now();
        pipeline.zadd(senderZSetKey, score, messageId);
        pipeline.expire(senderZSetKey, HOT_DATA_CACHE_EXPIRY);

        // 为群组中除发送者外的所有成员增加未读计数
        for (const member of group.members) {
            const memberId = member.user.toString();
            // 跳过消息发送者自己
            if (memberId === userId.toString()) continue;

            memberIds.push(memberId);

            // 用户的群组未读消息计数键
            const unreadKey = `${REDIS_GROUP_UNREAD_PREFIX}${memberId}:${groupId}`;
            // 群组最后一条消息键 - 基础键名
            const lastMsgBaseKey = `${REDIS_GROUP_LAST_MESSAGE_PREFIX}${memberId}:${groupId}`;
            // 消息历史记录键 - 基础键名
            const msgHistoryBaseKey = `group:message:history:${memberId}:${groupId}`;

            //!4. 增加未读计数并设置过期时间
            pipeline.incr(unreadKey);
            // pipeline.expire(unreadKey, UNREAD_CACHE_EXPIRY);

            //! 1. 存储最后一条消息作为热数据
            const lastMsgHotDataKey = `${lastMsgBaseKey}`;
            pipeline.set(lastMsgHotDataKey, JSON.stringify(messageData));

            //! 2. 存储消息到消息历史记录
            // 消息历史记录键 - 按照数据分层策略存储
            const msgHistoryKey = `${REDIS_HOT_DATA_PREFIX}${msgHistoryBaseKey}:${messageId}`;
            pipeline.set(msgHistoryKey, JSON.stringify(historyMsg), 'EX', HOT_DATA_CACHE_EXPIRY);

            // 3. 将消息ID添加到消息历史有序集合中，用于后续查询
            const memberZSetKey = `${REDIS_HOT_DATA_PREFIX}${msgHistoryBaseKey}:zset`;
            pipeline.zadd(memberZSetKey, score, messageId);
            pipeline.expire(memberZSetKey, HOT_DATA_CACHE_EXPIRY);
        }

        const results = await pipeline.exec();
        //[
        //   [ null, 2 ],
        //   [ null, 1 ],
        //   [ null, 'OK' ],
        //   [ null, 'OK' ],
        //   [ null, 1 ],
        //   [ null, 1 ],
        //   [ null, 'OK' ],
        //   [ null, 3 ],
        //   [ null, 1 ],
        //   [ null, 'OK' ]
        // ]
        // console.log('[未读消息] 增加群组未读计数结果:', results);

        // 返回每个成员的未读计数
        // const unreadCounts = {};
        // let resultIndex = 0;
        // for (const memberId of memberIds) {
        //     // 每个成员现在有6个操作：incr, expire, set(最后消息), set(历史消息), lpush, ltrim
        //     unreadCounts[memberId] = results[resultIndex][1];
        //     resultIndex += 6; // 跳过其他操作的结果
        // }

        return group;
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

                // 按照数据分层策略查询消息
                // 1. 先尝试从热数据层获取
                // const hotDataKey = `${REDIS_LAST_MESSAGE_PREFIX}${userId}:${senderId}`;
                // pipeline.get(hotDataKey);

                // // 2. 如果热数据不存在，再尝试从高频数据层获取
                // const freqDataKey = `${REDIS_LAST_MESSAGE_PREFIX}${userId}:${senderId}`;
                // pipeline.exists(freqDataKey);

                // 取消最后一条消息高频热评的查询
                const lastKey = `${REDIS_LAST_MESSAGE_PREFIX}${userId}:${senderId}`
                pipeline.get(lastKey);
            }

            const responses = await pipeline.exec();
            // 处理结果
            for (let i = 0; i < privateUnreadKeys.length; i++) {
                const key = privateUnreadKeys[i];
                const senderId = key.split(':')[3];
                const count = parseInt(responses[i * 2][1] || '0');
                // 检查热数据是否存在
                let lastMessage = null;
                if (responses[i * 2 + 1][1]) {
                    // 从热数据获取消息
                    lastMessage = JSON.parse(responses[i * 2 + 1][1]);
                }
                // 如果Redis中没有数据，可以从数据库中查询（这里省略实现）
                result.private.push({
                    userId,
                    unreadCount: count,
                    lastMessage: lastMessage ? {
                        ...lastMessage,
                        senderId
                    } : null,
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

                // 按照数据分层策略查询消息
                // 1. 先尝试从热数据层获取
                // const hotDataKey = `${REDIS_GROUP_LAST_MESSAGE_PREFIX}${userId}:${groupId}`;
                // pipeline.get(hotDataKey);

                // // 2. 如果热数据不存在，再尝试从高频数据层获取
                // const freqDataKey = `${REDIS_GROUP_LAST_MESSAGE_PREFIX}${userId}:${groupId}`;
                // pipeline.exists(freqDataKey);
                // 取消最后一条消息高频热评的查询
                const lastKey = `${REDIS_GROUP_LAST_MESSAGE_PREFIX}${userId}:${groupId}`
                pipeline.get(lastKey);
            }

            const responses = await pipeline.exec();
            // 处理结果
            for (let i = 0; i < groupUnreadKeys.length; i++) {
                const key = groupUnreadKeys[i];
                const groupId = key.split(':')[3];
                const count = parseInt(responses[i * 2][1] || '0');

                // 检查热数据是否存在
                let lastMessage = null;
                if (responses[i * 2 + 1][1]) {
                    // 从热数据获取消息
                    lastMessage = JSON.parse(responses[i * 2 + 1][1]);
                }
                result.group.push({
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

        // 清理各层缓存中的最后一条消息数据
        const hotDataKey = `${REDIS_HOT_DATA_PREFIX}${REDIS_LAST_MESSAGE_PREFIX}${userId}:${senderId}`;
        const freqDataKey = `${REDIS_FREQUENT_DATA_PREFIX}${REDIS_LAST_MESSAGE_PREFIX}${userId}:${senderId}`;

        // 使用管道批量处理删除操作
        const pipeline = redis.pipeline();
        pipeline.del(unreadKey);
        pipeline.del(hotDataKey);
        pipeline.del(freqDataKey);
        await pipeline.exec();

        // 异步更新数据库中的消息状态
        await PrivateMessage.updateMany(
            {
                sender: senderId,
                receiver: userId,
                isRead: false
            },
            { isRead: true }
        );

        console.log(`[未读消息] 用户 ${userId} 已将来自 ${senderId} 的私聊消息标记为已读`);
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

        // 清理各层缓存中的最后一条消息数据
        const hotDataKey = `${REDIS_HOT_DATA_PREFIX}${REDIS_GROUP_LAST_MESSAGE_PREFIX}${userId}:${groupId}`;
        const freqDataKey = `${REDIS_FREQUENT_DATA_PREFIX}${REDIS_GROUP_LAST_MESSAGE_PREFIX}${userId}:${groupId}`;

        // 使用管道批量处理删除操作
        const pipeline = redis.pipeline();
        pipeline.del(unreadKey);
        pipeline.del(hotDataKey);
        pipeline.del(freqDataKey);
        await pipeline.exec();

        // 可以在这里添加更新数据库中群组消息已读状态的代码
        // 例如：更新GroupMessage集合中的isRead字段

        console.log(`[未读消息] 用户 ${userId} 已将群组 ${groupId} 的消息标记为已读`);
    } catch (error) {
        console.error('[未读消息] 标记群组消息已读错误:', error);
    }
};

// 广播群组未读消息更新的函数
const broadcastGroupUnreadUpdate = async (io, socket, groupInfo, senderId, messageData) => {
    try {
        if (!groupInfo) return;
        const groupId = groupInfo._id;

        // 使用管道批量处理Redis操作，提高性能
        const pipeline = redis.pipeline();
        const members = [];

        for (const member of groupInfo.members) {
            const memberId = member.user.toString();


            // 跳过消息发送者自己
            // if (memberId === senderId.toString()) continue;
            console.log(`[未读消息] 用户 ${memberId} 接收到群组 ${groupId} 的消息,${senderId.toString()}`)
            members.push(memberId);
            // 获取该成员的未读消息计数
            const unreadKey = `${REDIS_GROUP_UNREAD_PREFIX}${memberId}:${groupId}`;
            pipeline.get(unreadKey);
        }

        // 执行所有Redis查询
        const results = await pipeline.exec();

        // 并行查询所有成员的用户信息
        const memberUsers = await User.find({
            _id: { $in: members }
        }).select('_id socketId online').lean();

        // 创建用户ID到用户信息的映射，提高查找效率
        const userMap = {};
        memberUsers.forEach(user => {
            userMap[user._id.toString()] = user;
        });

        // 为每个在线成员发送未读消息更新
        for (let i = 0; i < members.length; i++) {
            const memberId = members[i];
            const unreadCount = parseInt(results[i][1] || '0');
            const user = userMap[memberId];

            if (user && user.online && user.socketId) {
                // 使用io.to()替代socket.to()，避免影响连接状态
                io.to(user.socketId).emit(SocketOnGroupUnreadUpdate, {
                    groupId,
                    unreadCount: unreadCount,
                    groupName: groupInfo.name,
                    groupImg: groupInfo.avatar,
                    ...messageData
                });

                console.log(`[未读消息] 已向用户 ${memberId} 推送群组 ${groupId} 的未读消息更新`);
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
    REDIS_HOT_DATA_PREFIX,
    REDIS_FREQUENT_DATA_PREFIX,
    REDIS_COLD_DATA_PREFIX,
    HOT_DATA_CACHE_EXPIRY,
    FREQUENT_DATA_CACHE_EXPIRY,
    COLD_DATA_CACHE_EXPIRY,
    DATA_DOWNGRADE_INTERVAL,
    incrementUnreadCount,
    incrementGroupUnreadCount,
    getUserUnreadMessages,
    markPrivateMessagesAsRead,
    markGroupMessagesAsRead,
    broadcastGroupUnreadUpdate,
    downgradeHotData,
    downgradeFrequentData,
    getDataLayerByTimestamp,
    getOnlineStatus
}