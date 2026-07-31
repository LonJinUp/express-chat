const express = require('express')
const router = express.Router()
const messageController = require('../controller/messageController')
const { authenticateToken } = require('../middleware/authMiddleware')

// 获取会话聊天记录
router.get('/message/getConversationMessageList', authenticateToken, messageController.getConversationMessageList)
router.post('/message/recall', authenticateToken, messageController.recallMessage)
router.post('/message/deleteForMe', authenticateToken, messageController.deleteMessageForMe)
router.post('/message/reaction', authenticateToken, messageController.reactToMessage)

module.exports = router
