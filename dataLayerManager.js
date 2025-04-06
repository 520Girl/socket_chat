/**
 * 数据分层缓存管理模块
 * 实现热数据与高频数据分层缓存策略
 */

const { redis } = require('./db');
const {
    REDIS_HOT_DATA_PREFIX,
    REDIS_FREQUENT_DATA_PREFIX,
    REDIS_COLD_DATA_PREFIX,
    HOT_DATA_CACHE_EXPIRY,
    FREQUENT_DATA_CACHE_EXPIRY,
    COLD_DATA_CACHE_EXPIRY,
    downgradeHotData
} = require('./optimization');

// 数据降级检查间隔（毫秒）
const DATA_DOWNGRADE_INTERVAL = 3600000; // 1小时

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
        
        // 当前时间
        const now = Date.now();
        // 热数据过期阈值（24小时前的时间戳）
        const hotDataThreshold = now - (HOT_DATA_CACHE_EXPIRY * 1000);
        
        // 批量处理，提高性能
        const pipeline = redis.pipeline();
        
        // 获取所有热数据
        for (const key of hotDataKeys) {
            pipeline.get(key);
        }
        
        const results = await pipeline.exec();
        
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
            
            console.log(`[数据分层] 已将冷数据 ${key} 提升为热数据`);
        }
    } catch (error) {
        console.error('[数据分层] 提升数据优先级错误:', error);
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
 * @param {String} userId - 用户ID
 * @param {String} chatId - 聊天ID（可能是用户ID或群组ID）
 * @param {Boolean} isGroup - 是否为群组消息
 * @param {Number} limit - 获取消息数量限制
 * @returns {Promise<Array>} 消息历史记录数组
 */
const getMessageHistory = async (userId, chatId, isGroup = false, limit = 20) => {
    try {
        // 构造消息历史列表键名
        const baseKey = isGroup 
            ? `group:message:history:${userId}:${chatId}` 
            : `message:history:${userId}:${chatId}`;
        
        // 首先尝试从热数据层获取消息ID列表
        const hotListKey = `${REDIS_HOT_DATA_PREFIX}${baseKey}:list`;
        let messageIds = await redis.lrange(hotListKey, 0, limit - 1);
        
        // 如果热数据层消息不足，尝试从高频数据层获取
        if (messageIds.length < limit) {
            const freqListKey = `${REDIS_FREQUENT_DATA_PREFIX}${baseKey}:list`;
            const freqMessageIds = await redis.lrange(freqListKey, 0, limit - messageIds.length - 1);
            messageIds = [...messageIds, ...freqMessageIds];
        }
        
        // 如果仍然不足，可以从冷数据层或数据库获取（这里简化处理）
        
        // 没有消息记录，返回空数组
        if (messageIds.length === 0) {
            return [];
        }
        
        // 批量获取消息内容
        const pipeline = redis.pipeline();
        
        // 按照消息ID从各层获取消息内容
        for (const msgId of messageIds) {
            // 尝试从热数据层获取
            const hotKey = `${REDIS_HOT_DATA_PREFIX}${baseKey}:${msgId}`;
            pipeline.get(hotKey);
            
            // 检查高频数据层
            const freqKey = `${REDIS_FREQUENT_DATA_PREFIX}${baseKey}:${msgId}`;
            pipeline.exists(freqKey);
            
            // 检查冷数据层
            const coldKey = `${REDIS_COLD_DATA_PREFIX}${baseKey}:${msgId}`;
            pipeline.exists(coldKey);
        }
        
        const results = await pipeline.exec();
        const messages = [];
        
        // 处理每条消息的查询结果
        for (let i = 0; i < messageIds.length; i++) {
            const msgId = messageIds[i];
            const baseIndex = i * 3; // 每个消息ID有3个查询操作
            
            let messageData = null;
            
            // 检查热数据层结果
            if (results[baseIndex][1]) {
                messageData = JSON.parse(results[baseIndex][1]);
            }
            // 检查高频数据层
            else if (results[baseIndex + 1][1] === 1) {
                const freqKey = `${REDIS_FREQUENT_DATA_PREFIX}${baseKey}:${msgId}`;
                const data = await redis.get(freqKey);
                if (data) {
                    messageData = JSON.parse(data);
                    // 提升数据优先级
                    await upgradeDataPriority(freqKey, messageData);
                }
            }
            // 检查冷数据层
            else if (results[baseIndex + 2][1] === 1) {
                const coldKey = `${REDIS_COLD_DATA_PREFIX}${baseKey}:${msgId}`;
                const data = await redis.get(coldKey);
                if (data) {
                    messageData = JSON.parse(data);
                    // 提升数据优先级
                    await upgradeDataPriority(coldKey, messageData);
                }
            }
            
            if (messageData) {
                messages.push(messageData);
            }
        }
        
        // 按时间戳排序
        messages.sort((a, b) => a.timestamp - b.timestamp);
        
        return messages;
    } catch (error) {
        console.error('[数据分层] 获取消息历史记录错误:', error);
        return [];
    }
};

module.exports = {
    initDataLayerManager,
    processDataDowngrade,
    processFrequentDataDowngrade,
    upgradeDataPriority,
    syncRedisWithMongoDB,
    storeMessageToDataLayer,
    getMessageHistory
};