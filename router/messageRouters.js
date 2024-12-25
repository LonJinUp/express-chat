const express = require('express')
const router = express.Router()
const messageController = require('../controller/messageController')
const { authenticateToken } = require('../middleware/authMiddleware')

// 获取会话聊天记录
router.get('/message/getConversationMessageList', authenticateToken, messageController.getConversationMessageList)

module.exports = router
