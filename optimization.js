const { redis } = require('./db');
const { User } = require('./model');

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
                await User.findByIdAndUpdate(userId, { lastActive: Date.now(),socketId:socket.id });

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
const socketMiddlewareTimer = (io)=>{
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

module.exports = {
    heartbeatStart,
    getOnlineUsers,
    socketMiddlewareTimer,
    REDIS_HEARTBEAT_PREFIX,
    REDIS_ONLINE_PREFIX,
}