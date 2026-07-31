const express = require('express')
const router = express.Router()
const userController = require('../controller/userController')
const validator = require('../middleware/validation/userValidation')
const { authenticateToken } = require('../middleware/authMiddleware')
const { authLoginLimiter, authRegisterLimiter } = require('../middleware/rateLimitAuth')

//注册
router.post(
	'/auth/register',
	authRegisterLimiter,
	validator.registerValidation,
	userController.register
)
// 登录
router.post('/auth/login', authLoginLimiter, validator.loginValidation, userController.login)
router.post('/auth/logout', authenticateToken, userController.logout)
router.get('/auth/sessions', authenticateToken, userController.getSessions)
router.delete('/auth/sessions/:sessionId', authenticateToken, userController.revokeSession)
router.post('/auth/sessions/revoke-others', authenticateToken, userController.revokeOtherSessions)
router.put('/auth/password', authenticateToken, validator.changePasswordValidation, userController.changePassword)
router.get('/user/notification-settings', authenticateToken, userController.getNotificationSettings)
router.put('/user/notification-settings', authenticateToken, validator.notificationSettingsValidation, userController.updateNotificationSettings)
// 获取用户信息
router.get('/user/userinfo', authenticateToken, userController.getUserInfo)
// 更新用户资料
router.put(
	'/user/profile',
	authenticateToken,
	validator.updateProfileValidation,
	userController.updateProfile
)
// 获取好友列表
router.get('/user/getFriendList', authenticateToken, userController.getFriendList)
// 设置用户在线状态
router.get('/user/setUserStatus', authenticateToken, userController.setUserStatus)

module.exports = router
