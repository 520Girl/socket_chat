/**
 * 数据分层缓存管理模块
 * 实现热数据与高频数据分层缓存策略
 */
const { GroupMessage, PrivateMessage } = require('./model');
const { redis } = require('./db');
const {
    REDIS_HOT_DATA_PREFIX,
    REDIS_FREQUENT_DATA_PREFIX,
    REDIS_COLD_DATA_PREFIX,
    HOT_DATA_CACHE_EXPIRY,
    FREQUENT_DATA_CACHE_EXPIRY,
    COLD_DATA_CACHE_EXPIRY,
    DATA_DOWNGRADE_INTERVAL,
    downgradeHotData
} = require('./optimization');

/**
 * 初始化数据分层管理
 * 启动定时任务，处理数据降级
 */
const initDataLayerManager = () => {
    console.log('[数据分层] 初始化数据分层管理');

    // 启动定时任务，定期检查并降级热数据
    setInterval(processDataDowngrade, DATA_DOWNGRADE_INTERVAL);

    // 启动定时任务，定期检查并降级高频数据
    // 设置为每2小时执行一次高频数据降级
    setInterval(processFrequentDataDowngrade, DATA_DOWNGRADE_INTERVAL * 2);

    // 立即执行一次数据降级处理
    processDataDowngrade();
    processFrequentDataDowngrade();

    console.log('[数据分层] 数据分层管理初始化完成，已启动定时降级任务');
};

/**
 * 处理数据降级
 * 将过期的热数据降级为高频数据
 */
const processDataDowngrade = async () => {
    try {
        console.log('[数据分层] 开始处理数据降级');

        // 获取所有热数据键
        const hotDataKeys = await redis.keys(`${REDIS_HOT_DATA_PREFIX}*`);
        console.log(`[数据分层] 发现 ${hotDataKeys.length} 个热数据键`);

        if (hotDataKeys.length === 0) return;
        // console.log(`[数据分层] 开始处理 ${hotDataKeys.length} 个热数据键`, hotDataKeys);
        // 当前时间
        const now = Date.now();
        // 热数据过期阈值（24小时前的时间戳）
        const hotDataThreshold = now - (HOT_DATA_CACHE_EXPIRY * 1000);

        // 批量处理，提高性能
        const pipeline = redis.pipeline();

        // 获取所有热数据
        for (const key of hotDataKeys) {
            // console.log(`[数据分层] 获取热数据 ${key}`)
            pipeline.get(key);
        }

        const results = await pipeline.exec();
        // console.log(`[数据分层] 获取 ${results.length} 个热数据`,results);

        // 处理每个热数据
        for (let i = 0; i < hotDataKeys.length; i++) {
            const key = hotDataKeys[i];
            const data = results[i][1];

            if (!data) continue;

            try {
                const parsedData = JSON.parse(data);

                // 检查数据是否应该降级（超过24小时）
                if (parsedData.timestamp && parsedData.timestamp < hotDataThreshold) {
                    // 将热数据降级为高频数据
                    await downgradeHotData(key, parsedData);

                    // 删除原热数据
                    await redis.del(key);

                    console.log(`[数据分层] 已将热数据 ${key} 降级为高频数据`);
                }
            } catch (parseError) {
                console.error(`[数据分层] 解析数据错误: ${key}`, parseError);
            }
        }

        console.log('[数据分层] 数据降级处理完成');
    } catch (error) {
        console.error('[数据分层] 数据降级处理错误:', error);
    }
};

/**
 * 处理高频数据降级为冷数据
 * 将过期的高频数据降级为冷数据（仅在数据库中保存）
 */
const processFrequentDataDowngrade = async () => {
    try {
        console.log('[数据分层] 开始处理高频数据降级');

        // 获取所有高频数据键
        const freqDataKeys = await redis.keys(`${REDIS_FREQUENT_DATA_PREFIX}*`);
        console.log(`[数据分层] 发现 ${freqDataKeys.length} 个高频数据键`);

        if (freqDataKeys.length === 0) return;

        // 当前时间
        const now = Date.now();
        // 高频数据过期阈值（7天前的时间戳）
        const freqDataThreshold = now - (FREQUENT_DATA_CACHE_EXPIRY * 1000);

        // 批量处理，提高性能
        const pipeline = redis.pipeline();

        // 获取所有高频数据
        for (const key of freqDataKeys) {
            pipeline.get(key);
        }

        const results = await pipeline.exec();

        // 处理每个高频数据
        for (let i = 0; i < freqDataKeys.length; i++) {
            const key = freqDataKeys[i];
            const data = results[i][1];

            if (!data) continue;

            try {
                const parsedData = JSON.parse(data);

                // 检查数据是否应该降级（超过7天）
                if (parsedData.timestamp && parsedData.timestamp < freqDataThreshold) {
                    // 将高频数据降级为冷数据（如果需要临时缓存）
                    // 使用optimization.js中导出的downgradeFrequentData函数
                    const { downgradeFrequentData } = require('./optimization');
                    await downgradeFrequentData(key, parsedData);

                    // 删除原高频数据
                    await redis.del(key);

                    console.log(`[数据分层] 已将高频数据 ${key} 降级为冷数据`);
                }
            } catch (parseError) {
                console.error(`[数据分层] 解析数据错误: ${key}`, parseError);
            }
        }

        console.log('[数据分层] 高频数据降级处理完成');
    } catch (error) {
        console.error('[数据分层] 高频数据降级处理错误:', error);
    }
};

/**
 * 提升数据优先级
 * 当访问高频或冷数据时，提升其优先级
 * @param {String} key - 完整的Redis键
 * @param {Object} data - 数据对象
 */
const upgradeDataPriority = async (key, data) => {
    try {
        // 检查键是否为高频数据
        if (key.startsWith(REDIS_FREQUENT_DATA_PREFIX)) {
            // 提取基础键名
            const baseKey = key.replace(REDIS_FREQUENT_DATA_PREFIX, '');
            // 构造热数据键名
            const hotDataKey = `${REDIS_HOT_DATA_PREFIX}${baseKey}`;

            // 更新时间戳
            data.timestamp = Date.now();

            // 将数据提升为热数据
            await redis.set(hotDataKey, JSON.stringify(data), 'EX', HOT_DATA_CACHE_EXPIRY);

            // 提取消息ID并更新热数据列表
            await updateHotDataList(baseKey, data);

            console.log(`[数据分层] 已将高频数据 ${key} 提升为热数据`);
        }
        // 处理冷数据的情况
        else if (key.startsWith(REDIS_COLD_DATA_PREFIX)) {
            // 提取基础键名
            const baseKey = key.replace(REDIS_COLD_DATA_PREFIX, '');
            // 构造热数据键名
            const hotDataKey = `${REDIS_HOT_DATA_PREFIX}${baseKey}`;

            // 更新时间戳
            data.timestamp = Date.now();

            // 将数据提升为热数据
            await redis.set(hotDataKey, JSON.stringify(data), 'EX', HOT_DATA_CACHE_EXPIRY);

            // 提取消息ID并更新热数据列表
            await updateHotDataList(baseKey, data);

            console.log(`[数据分层] 已将冷数据 ${key} 提升为热数据`);
        }
    } catch (error) {
        console.error('[数据分层] 提升数据优先级错误:', error);
    }
};

/**
 * 更新热数据列表
 * 当数据从高频或冷数据提升为热数据时，确保消息ID也添加到热数据列表中
 * 使用Sorted Set替代List，按时间戳排序，确保分页数据一致性
 * @param {String} baseKey - 基础键名（不包含数据层前缀）
 * @param {Object} data - 数据对象
 */
const updateHotDataList = async (baseKey, data) => {
    try {
        // 提取消息ID
        const msgId = data._id || (baseKey.split(':').pop());
        if (!msgId) return;

        // 提取基础列表键名（移除最后的:msgId部分）
        const keyParts = baseKey.split(':');
        // 如果键的格式是 message:history:userId:chatId:msgId 或 group:message:history:userId:chatId:msgId
        // 则需要移除最后的msgId部分
        if (keyParts.length > 3) {
            keyParts.pop(); // 移除最后的msgId部分
            const listBaseKey = keyParts.join(':');
            const hotListKey = `${REDIS_HOT_DATA_PREFIX}${listBaseKey}:zset`;

            // 获取消息的时间戳作为分数，确保按时间排序
            const score = data.timestamp || data.sentAt || Date.now();

            // 将消息ID添加到热数据有序集合中，使用时间戳作为分数
            await redis.zadd(hotListKey, score, msgId);

            // 确保有序集合不会无限增长
            await redis.zremrangebyrank(hotListKey, 0, -101); // 保留最近100条消息
            console.log(`[数据分层] 已将消息ID ${msgId} 添加到热数据有序集合 ${hotListKey}，分数: ${score}`);
        }
    } catch (error) {
        console.error('[数据分层] 更新热数据列表错误:', error);
    }
};

/**
 * 定期同步Redis和MongoDB数据
 * 确保数据一致性
 */
const syncRedisWithMongoDB = async () => {
    // 这里可以实现定期将Redis中的数据与MongoDB同步的逻辑
    // 例如：检查Redis中的已读状态与MongoDB是否一致
    console.log('[数据分层] 同步Redis和MongoDB数据');

    // 具体实现根据业务需求添加
};

/**
 * 存储消息到适当的数据层
 * 根据消息时间戳决定存储到哪个数据层
 * @param {String} baseKey - 基础键名（不包含数据层前缀）
 * @param {Object} data - 要存储的数据
 * @returns {Promise<void>}
 */
const storeMessageToDataLayer = async (baseKey, data) => {
    try {
        // 确保数据有时间戳
        if (!data.timestamp) {
            data.timestamp = Date.now();
        }

        // 使用getDataLayerByTimestamp函数确定数据应该存储在哪一层
        const { getDataLayerByTimestamp } = require('./optimization');
        const dataLayerPrefix = getDataLayerByTimestamp(data.timestamp);

        // 构造完整的键名
        const fullKey = `${dataLayerPrefix}${baseKey}`;

        // 根据数据层设置不同的过期时间
        let expiry;
        if (dataLayerPrefix === REDIS_HOT_DATA_PREFIX) {
            expiry = HOT_DATA_CACHE_EXPIRY;
        } else if (dataLayerPrefix === REDIS_FREQUENT_DATA_PREFIX) {
            expiry = FREQUENT_DATA_CACHE_EXPIRY;
        } else {
            expiry = COLD_DATA_CACHE_EXPIRY;
        }

        // 存储数据
        await redis.set(fullKey, JSON.stringify(data), 'EX', expiry);

        console.log(`[数据分层] 已将消息存储到${dataLayerPrefix === REDIS_HOT_DATA_PREFIX ? '热数据' :
            dataLayerPrefix === REDIS_FREQUENT_DATA_PREFIX ? '高频数据' : '冷数据'}层: ${fullKey}`);

    } catch (error) {
        console.error('[数据分层] 存储消息到数据层错误:', error);
    }
};

/**
 * 获取消息历史记录
 * 按照数据分层策略从不同的缓存层获取消息历史
 * 使用Sorted Set替代List，确保分页数据一致性
 * 支持从发送者和接收者两个视角查询完整聊天记录
 * @param {String} userId - 用户ID
 * @param {String} chatId - 聊天ID（可能是用户ID或群组ID）
 * @param {Boolean} isGroup - 是否为群组消息
 * @param {Number} limit - 获取消息数量限制
 * @param {Number} page - 页码，从1开始
 * @returns {Promise<Object>} 包含消息历史记录数组和总数的对象
 */
const getMessageHistory = async (userId, chatId, isGroup = false, limit = 20, page = 1) => {
    try {
        // 计算分页偏移量
        const offset = (page - 1) * limit;
        // mongodb 查询条件
        const collection = isGroup ? GroupMessage : PrivateMessage;
        const query = isGroup
            ? { group: chatId }
            : {
                $or: [
                    { sender: userId, receiver: chatId },
                    { sender: chatId, receiver: userId }
                ]
            };
        const total = await collection.countDocuments(query);

        // 构造消息历史列表键名 - 双向索引，同时支持发送者和接收者视角
        // 对于私聊，我们需要两个键：一个是当前用户视角，一个是对方视角
        let baseKeys = [];
        if (isGroup) {
            baseKeys.push(`group:message:history:${userId}:${chatId}`);
        } else {
            // 为私聊创建双向索引，确保无论从哪个用户视角都能查询到完整聊天记录
            baseKeys.push(`user:message:history:${userId}:${chatId}`);
            // 添加对方视角的键，确保发送者也能查询到自己发送的消息
            baseKeys.push(`user:message:history:${chatId}:${userId}`);
        }

        // 使用主键（当前用户视角）检查缓存
        const primaryBaseKey = baseKeys[0];
        const hotZSetKey = `${REDIS_HOT_DATA_PREFIX}${primaryBaseKey}:zset`;
        const freqZSetKey = `${REDIS_FREQUENT_DATA_PREFIX}${primaryBaseKey}:zset`;
        console.log(`Hot zset key: ${hotZSetKey}`);

        // 检查Redis中是否有缓存的消息ID
        const hasHotData = await redis.exists(hotZSetKey);
        const hasFreqData = await redis.exists(freqZSetKey);

        let messageIds = [];

        // 如果Redis中没有缓存数据，或者请求的是非第一页，直接从MongoDB获取
        // 这样可以确保分页数据的一致性，避免缓存导致的数据重复或缺失
        if ((!hasHotData && !hasFreqData) || page > 1) {
            // 从MongoDB获取消息，按时间戳排序
            const messages = await collection.find(query)
                .sort({ sentAt: -1 })
                .skip(offset)
                .limit(limit)
                .lean();

            if (messages.length === 0) {
                return { messages: [], total };
            }

            // 将消息缓存到Redis - 为所有视角创建缓存
            const pipeline = redis.pipeline();

            for (const msg of messages) {
                // 使用消息时间戳作为分数
                const score = new Date(msg.sentAt).getTime();

                // 为每个视角缓存消息
                for (const baseKey of baseKeys) {
                    // 缓存消息内容
                    const msgKey = `${REDIS_HOT_DATA_PREFIX}${primaryBaseKey}:${msg._id}`;
                    pipeline.set(msgKey, JSON.stringify(msg), 'EX', HOT_DATA_CACHE_EXPIRY);

                    // 将消息ID添加到有序集合
                    const zsetKey = `${REDIS_HOT_DATA_PREFIX}${baseKey}:zset`;
                    pipeline.zadd(zsetKey, score, msg._id.toString());
                    pipeline.expire(zsetKey, HOT_DATA_CACHE_EXPIRY);
                }

                messageIds.push(msg._id.toString());
            }

            await pipeline.exec();
            console.log(`[数据分层] 已从MongoDB获取并缓存${messages.length}条消息`);

            return { messages, total };
        }

        // 如果Redis中有缓存数据，且请求的是第一页，从缓存获取
        // 首先尝试从热数据层获取消息ID
        if (hasHotData) {
            // 使用ZREVRANGE获取有序集合中的元素，按分数从高到低排序（最新消息优先）
            const hotMessageIds = await redis.zrevrange(hotZSetKey, offset, offset + limit - 1);
            console.log(`Hot message ids: ${hotMessageIds}`);
            messageIds = hotMessageIds;
        }

        // 如果热数据层消息不足，尝试从高频数据层获取
        if (messageIds.length < limit && hasFreqData) {
            const freqOffset = messageIds.length > 0 ? 0 : offset;
            const freqLimit = limit - messageIds.length;
            const freqMessageIds = await redis.zrevrange(freqZSetKey, freqOffset, freqOffset + freqLimit - 1);
            messageIds = [...messageIds, ...freqMessageIds];
        }

        // 如果缓存中的消息仍然不足，从MongoDB获取补充
        if (messageIds.length < limit) {
            // 计算需要从MongoDB获取的消息数量
            const remainingLimit = limit - messageIds.length;
            const mongoOffset = messageIds.length > 0 ? 0 : offset;

            // 从MongoDB获取消息
            const mongoMessages = await collection.find(query)
                .sort({ sentAt: -1 })
                .skip(mongoOffset)
                .limit(remainingLimit)
                .lean();

            // 将MongoDB获取的消息缓存到Redis
            if (mongoMessages.length > 0) {
                const pipeline = redis.pipeline();

                for (const msg of mongoMessages) {
                    // 使用消息时间戳作为分数
                    const score = new Date(msg.sentAt).getTime();
                    // 缓存消息内容
                    const msgKey = `${REDIS_HOT_DATA_PREFIX}${primaryBaseKey}:${msg._id}`;
                    pipeline.set(msgKey, JSON.stringify(msg), 'EX', HOT_DATA_CACHE_EXPIRY);

                    // 将消息ID添加到有序集合
                    pipeline.zadd(hotZSetKey, score, msg._id.toString());

                    messageIds.push(msg._id.toString());
                }

                await pipeline.exec();
                console.log(`[数据分层] 已从MongoDB补充并缓存${mongoMessages.length}条消息`);
            }
        }

        // 没有消息记录，返回空数组
        if (messageIds.length === 0) {
            return { messages: [], total };
        }

        // 批量获取消息内容
        const pipeline = redis.pipeline();
        const messages = [];

        // 按照消息ID从各层获取消息内容
        for (const msgId of messageIds) {
            // 尝试从热数据层获取
            const hotKey = `${REDIS_HOT_DATA_PREFIX}${primaryBaseKey}:${msgId}`;
            const freqKey = `${REDIS_FREQUENT_DATA_PREFIX}${primaryBaseKey}:${msgId}`;
            const coldKey = `${REDIS_COLD_DATA_PREFIX}${primaryBaseKey}:${msgId}`;

            // 按优先级依次检查各数据层
            const hotData = await redis.get(hotKey);
            if (hotData) {
                messages.push(JSON.parse(hotData));
                continue;
            }

            const freqData = await redis.get(freqKey);
            if (freqData) {
                const messageData = JSON.parse(freqData);
                messages.push(messageData);
                // 提升数据优先级
                await upgradeDataPriority(freqKey, messageData);
                continue;
            }

            const coldData = await redis.get(coldKey);
            if (coldData) {
                const messageData = JSON.parse(coldData);
                messages.push(messageData);
                // 提升数据优先级
                await upgradeDataPriority(coldKey, messageData);
                continue;
            }

            // 如果Redis中没有找到消息，尝试从MongoDB获取
            const mongoMsg = await collection.findOne({ _id: msgId }).lean();
            if (mongoMsg) {
                messages.push(mongoMsg);
                // 缓存到热数据层
                await redis.set(hotKey, JSON.stringify(mongoMsg), 'EX', HOT_DATA_CACHE_EXPIRY);
                // 添加到有序集合
                const score = new Date(mongoMsg.sentAt).getTime();
                await redis.zadd(hotZSetKey, score, msgId);
            }
        }

        // 按时间戳排序（降序，最新的消息在前面）
        messages.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
        
        // 过滤已删除的消息，替换为提示文本
        const filteredMessages = filterDeletedMessages(messages, userId);

        return { messages: filteredMessages, total };
    } catch (error) {
        console.error('[数据分层] 获取消息历史记录错误:', error);
        return { messages: [], total: 0 };
    }
};

// 导入消息删除模块
const { filterDeletedMessages } = require('./messageDelete');

module.exports = {
    initDataLayerManager,
    processDataDowngrade,
    processFrequentDataDowngrade,
    upgradeDataPriority,
    syncRedisWithMongoDB,
    storeMessageToDataLayer,
    getMessageHistory
};