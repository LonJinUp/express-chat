const express = require('express')
const router = express.Router()
const friendController = require('../controller/friendController')
const validator = require('../middleware/validation/firendValidation')
const { authenticateToken } = require('../middleware/authMiddleware')

// 发送好友请求
router.post('/firend/send', authenticateToken, validator.friendValidation, friendController.sendFriendRequest)
// 接受好友请求
router.post('/firend/accept', authenticateToken, validator.friendValidation, friendController.acceptFriendRequest)
// 拒绝好友请求
router.post('/firend/reject', authenticateToken, validator.friendValidation, friendController.rejectFriendRequest)
// 获取好友请求列表
router.get('/firend/requests', authenticateToken, friendController.getFriendRequests)

module.exports = router
