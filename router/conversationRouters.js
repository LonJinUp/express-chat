const express = require('express')
const router = express.Router()
const conversationController = require('../controller/conversationController')
const validator = require('../middleware/validation/firendValidation')
const { authenticateToken } = require('../middleware/authMiddleware')

// 获取最近会话列表
router.get('/conversation/getUserConversationList', authenticateToken, conversationController.getUserConversationList)

// 标记会话为已读
router.post('/conversation/markAsRead', authenticateToken, conversationController.markAsRead)
router.get('/conversation/readStatus', authenticateToken, conversationController.getConversationReadStatus)
// 清空当前用户的聊天记录
router.post('/conversation/clear', authenticateToken, conversationController.clearConversationHistory)
// 更新置顶、消息免打扰等当前用户独立的会话偏好
router.post('/conversation/preferences', authenticateToken, conversationController.updateConversationPreferences)

// 根据会话类型和ID查找历史会话ID
router.get('/conversation/getConversationId', authenticateToken, conversationController.findConversationByTypeAndId)

module.exports = router
