/**
 * 消息删除路由模块
 * 提供消息删除相关的API接口
 */
const express = require('express');
const router = express.Router();
const { deletePrivateMessage, deleteGroupMessage, restoreDeletedMessage } = require('./messageDelete');

/**
 * 删除私聊消息
 * POST /api/message/private/delete
 * @param {String} messageId - 消息ID
 * @param {String} userId - 用户ID
 * @param {Boolean} forBoth - 是否对双方都删除，默认false
 */
router.post('/private/delete', async (req, res) => {
    try {
        const { messageId, userId, forBoth = false } = req.body;
        
        if (!messageId || !userId) {
            return res.status(400).json({ success: false, message: '参数不完整' });
        }
        
        const result = await deletePrivateMessage(messageId, userId, forBoth);
        return res.json(result);
    } catch (error) {
        console.error('[API] 删除私聊消息错误:', error);
        return res.status(500).json({ success: false, message: '服务器错误' });
    }
});

/**
 * 删除群聊消息
 * POST /api/message/group/delete
 * @param {String} messageId - 消息ID
 * @param {String} userId - 用户ID
 * @param {Boolean} isAdmin - 是否是管理员操作，默认false
 */
router.post('/group/delete', async (req, res) => {
    try {
        const { messageId, userId, isAdmin = false } = req.body;
        
        if (!messageId || !userId) {
            return res.status(400).json({ success: false, message: '参数不完整' });
        }
        
        const result = await deleteGroupMessage(messageId, userId, isAdmin);
        return res.json(result);
    } catch (error) {
        console.error('[API] 删除群聊消息错误:', error);
        return res.status(500).json({ success: false, message: '服务器错误' });
    }
});

/**
 * 恢复已删除的消息（仅管理员可操作）
 * POST /api/message/restore
 * @param {String} messageId - 消息ID
 * @param {Boolean} isGroup - 是否为群组消息
 */
router.post('/restore', async (req, res) => {
    try {
        const { messageId, isGroup = false } = req.body;
        
        if (!messageId) {
            return res.status(400).json({ success: false, message: '参数不完整' });
        }
        
        // 这里可以添加管理员权限验证
        // if (!isAdmin(req.user)) {
        //     return res.status(403).json({ success: false, message: '无权操作' });
        // }
        
        const result = await restoreDeletedMessage(messageId, isGroup);
        return res.json(result);
    } catch (error) {
        console.error('[API] 恢复已删除消息错误:', error);
        return res.status(500).json({ success: false, message: '服务器错误' });
    }
});

module.exports = router;