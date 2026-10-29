const express = require('express')
const router = express.Router()
const messageController = require('../controller/messageController')
const { authenticateToken } = require('../middleware/authMiddleware')

// 获取会话聊天记录
router.get('/message/getConversationMessageList', authenticateToken, messageController.getConversationMessageList)
router.get('/message/sync', authenticateToken, messageController.syncMessages)
router.get('/message/search', authenticateToken, messageController.searchMessages)
router.post('/message/recall', authenticateToken, messageController.recallMessage)
router.post('/message/deleteForMe', authenticateToken, messageController.deleteMessageForMe)
router.post('/message/deleteBatchForMe', authenticateToken, messageController.deleteMessagesForMe)
router.post('/message/reaction', authenticateToken, messageController.reactToMessage)
router.get('/message/pinned', authenticateToken, messageController.getConversationPinnedMessage)
router.post('/message/pin', authenticateToken, messageController.pinMessage)
router.put('/message/edit', authenticateToken, messageController.editMessage)
router.post('/message/favorite', authenticateToken, messageController.favoriteMessage)
router.get('/message/favorites', authenticateToken, messageController.messageFavorites)

module.exports = router
