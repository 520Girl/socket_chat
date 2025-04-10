/**
 * 消息删除管理模块
 * 实现消息软删除功能，支持单条消息的删除和恢复
 */
const { GroupMessage, PrivateMessage } = require('./model');
const { redis } = require('./db');
const {
    REDIS_HOT_DATA_PREFIX,
    REDIS_FREQUENT_DATA_PREFIX,
    REDIS_COLD_DATA_PREFIX
} = require('./optimization');

/**
 * 删除私聊消息
 * 实现软删除，只标记不物理删除
 * @param {String} messageId - 消息ID
 * @param {String} userId - 执行删除操作的用户ID
 * @param {Boolean} forBoth - 是否对双方都删除，默认只对当前用户删除
 * @returns {Promise<Object>} 删除结果
 */
const deletePrivateMessage = async (messageId, userId, forBoth = false) => {
    try {
        // 查找消息并验证权限
        const message = await PrivateMessage.findById(messageId);
        if (!message) {
            return { success: false, message: '消息不存在' };
        }

        // 验证用户是否有权限删除此消息
        const isSender = message.sender.toString() === userId;
        const isReceiver = message.receiver.toString() === userId;

        if (!isSender && !isReceiver) {
            return { success: false, message: '无权删除此消息' };
        }

        // 更新消息状态为已删除
        message.isDeleted = true;
        message.deletedAt = new Date();
        message.deletedBy = userId;
        await message.save();

        // 从Redis缓存中移除消息
        await removeMessageFromRedisCache(messageId, message.sender.toString(), message.receiver.toString(), false);

        // 如果需要对双方都删除，且当前用户是发送者
        if (forBoth && isSender) {
            // 这里可以添加额外的逻辑，例如通知接收者消息已被撤回
            // 或者在接收者的视图中也标记消息为已删除
        }

        return { success: true, message: '消息已删除' };
    } catch (error) {
        console.error('[消息删除] 删除私聊消息错误:', error);
        return { success: false, message: '删除消息失败' };
    }
};

/**
 * 删除群聊消息
 * 实现软删除，只标记不物理删除
 * @param {String} messageId - 消息ID
 * @param {String} userId - 执行删除操作的用户ID
 * @param {Boolean} isAdmin - 是否是管理员操作，管理员可以删除任何消息
 * @returns {Promise<Object>} 删除结果
 */
const deleteGroupMessage = async (messageId, userId, isAdmin = false) => {
    try {
        // 查找消息
        const message = await GroupMessage.findById(messageId);
        if (!message) {
            return { success: false, message: '消息不存在' };
        }

        // 验证用户是否有权限删除此消息
        const isSender = message.sender.toString() === userId;

        if (!isSender && !isAdmin) {
            return { success: false, message: '无权删除此消息' };
        }

        // 更新消息状态为已删除
        message.isDeleted = true;
        message.deletedAt = new Date();
        message.deletedBy = userId;
        await message.save();

        // 从Redis缓存中移除消息
        await removeMessageFromRedisCache(messageId, userId, message.group.toString(), true);

        return { success: true, message: '消息已删除' };
    } catch (error) {
        console.error('[消息删除] 删除群聊消息错误:', error);
        return { success: false, message: '删除消息失败' };
    }
};

/**
 * 从Redis缓存中移除消息
 * @param {String} messageId - 消息ID
 * @param {String} senderId - 发送者ID
 * @param {String} targetId - 目标ID（接收者ID或群组ID）
 * @param {Boolean} isGroup - 是否为群组消息
 * @returns {Promise<void>}
 */
const removeMessageFromRedisCache = async (messageId, senderId, targetId, isGroup = false) => {
    try {
        // 构造基础键名
        let baseKeys = [];
        if (isGroup) {
            baseKeys.push(`group:message:history:${senderId}:${targetId}`);
        } else {
            // 为私聊创建双向索引，确保无论从哪个用户视角都能查询到完整聊天记录
            baseKeys.push(`user:message:history:${senderId}:${targetId}`);
            baseKeys.push(`user:message:history:${targetId}:${senderId}`);
        }

        const pipeline = redis.pipeline();

        // 从各个数据层移除消息
        for (const baseKey of baseKeys) {
            // 热数据层
            const hotMsgKey = `${REDIS_HOT_DATA_PREFIX}${baseKey}:${messageId}`;
            pipeline.del(hotMsgKey);

            // 从热数据有序集合中移除
            const hotZSetKey = `${REDIS_HOT_DATA_PREFIX}${baseKey}:zset`;
            pipeline.zrem(hotZSetKey, messageId);

            // 高频数据层
            const freqMsgKey = `${REDIS_FREQUENT_DATA_PREFIX}${baseKey}:${messageId}`;
            pipeline.del(freqMsgKey);

            // 从高频数据有序集合中移除
            const freqZSetKey = `${REDIS_FREQUENT_DATA_PREFIX}${baseKey}:zset`;
            pipeline.zrem(freqZSetKey, messageId);

            // 冷数据层
            const coldMsgKey = `${REDIS_COLD_DATA_PREFIX}${baseKey}:${messageId}`;
            pipeline.del(coldMsgKey);
        }

        await pipeline.exec();
        console.log(`[消息删除] 已从Redis缓存中移除消息 ${messageId}`);
    } catch (error) {
        console.error('[消息删除] 从Redis缓存中移除消息错误:', error);
    }
};

/**
 * 恢复已删除的消息
 * 仅管理员可操作
 * @param {String} messageId - 消息ID
 * @param {Boolean} isGroup - 是否为群组消息
 * @returns {Promise<Object>} 恢复结果
 */
const restoreDeletedMessage = async (messageId, isGroup = false) => {
    try {
        const MessageModel = isGroup ? GroupMessage : PrivateMessage;
        
        // 查找消息
        const message = await MessageModel.findById(messageId);
        if (!message) {
            return { success: false, message: '消息不存在' };
        }

        if (!message.isDeleted) {
            return { success: false, message: '消息未被删除，无需恢复' };
        }

        // 恢复消息
        message.isDeleted = false;
        message.deletedAt = null;
        message.deletedBy = null;
        await message.save();

        return { success: true, message: '消息已恢复' };
    } catch (error) {
        console.error('[消息删除] 恢复已删除消息错误:', error);
        return { success: false, message: '恢复消息失败' };
    }
};

/**
 * 获取消息历史时过滤已删除消息
 * 在查询结果中过滤掉已删除的消息
 * @param {Array} messages - 消息数组
 * @param {String} userId - 当前用户ID
 * @returns {Array} 过滤后的消息数组
 */
const filterDeletedMessages = (messages, userId) => {
    if (!messages || !Array.isArray(messages)) return [];
    
    return messages.map(msg => {
        // 如果消息已删除，替换内容
        if (msg.isDeleted) {
            // 创建消息的副本，避免修改原对象
            const msgCopy = { ...msg };
            
            // 如果是发送者删除的，显示「消息已撤回」
            if (msg.deletedBy && msg.deletedBy.toString() === msg.sender.toString()) {
                msgCopy.content = '消息已撤回';
            } 
            // 如果是管理员删除的，显示「消息已被管理员删除」
            else if (msg.deletedBy && msg.deletedBy.toString() !== msg.sender.toString()) {
                msgCopy.content = '消息已被管理员删除';
            }
            // 其他情况
            else {
                msgCopy.content = '消息已删除';
            }
            
            // 清除媒体内容
            msgCopy.mediaUrl = null;
            msgCopy.mediaDuration = null;
            msgCopy.thumbnailUrl = null;
            msgCopy.locationData = null;
            
            return msgCopy;
        }
        
        return msg;
    });
};

module.exports = {
    deletePrivateMessage,
    deleteGroupMessage,
    restoreDeletedMessage,
    filterDeletedMessages,
    removeMessageFromRedisCache
};