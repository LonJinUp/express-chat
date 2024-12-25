const express = require('express')
const router = express.Router()
const userController = require('../controller/userController')
const validator = require('../middleware/validation/userValidation')
const { authenticateToken } = require('../middleware/authMiddleware')

//注册
router.post('/auth/register', validator.registerValidation, userController.register)
// 登录
router.post('/auth/login', validator.loginValidation, userController.login)
// 获取用户信息
router.get('/user/userinfo', authenticateToken, userController.getUserInfo)
// 获取好友列表
router.get('/user/getFriendList', authenticateToken, userController.getFriendList)
// 设置用户在线状态
router.get('/user/setUserStatus', authenticateToken, userController.setUserStatus)

module.exports = router
