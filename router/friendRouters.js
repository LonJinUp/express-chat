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
// 删除好友
router.post('/firend/remove', authenticateToken, validator.friendValidation, friendController.removeFriend)
// 获取好友请求列表
router.get('/firend/requests', authenticateToken, friendController.getFriendRequests)
router.get('/firend/blocked', authenticateToken, friendController.getBlockedUsers)
router.post('/firend/block', authenticateToken, validator.friendValidation, friendController.blockUser)
router.post('/firend/unblock', authenticateToken, validator.friendValidation, friendController.unblockUser)

module.exports = router
