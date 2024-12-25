const express = require('express')
const router = express.Router()
const conversationController = require('../controller/conversationController')
const validator = require('../middleware/validation/firendValidation')
const { authenticateToken } = require('../middleware/authMiddleware')

// 获取最近会话列表
router.get('/conversation/getUserConversationList', authenticateToken, conversationController.getUserConversationList)

// 标记会话为已读
router.post('/conversation/markAsRead', authenticateToken, conversationController.markAsRead)

// 根据会话类型和ID查找历史会话ID
router.get('/conversation/getConversationId', authenticateToken, conversationController.findConversationByTypeAndId)

module.exports = router
