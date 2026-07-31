const { body, validationResult } = require('express-validator')
const validator = require('./errorBack')

module.exports.registerValidation = validator([
	body('username').notEmpty().withMessage('请输入用户名'),
	body('email').isEmail().withMessage('请输入email'),
	body('password').isLength({ min: 6 }).withMessage('请输入密码，最少6位'),
])

module.exports.loginValidation = validator([
	body('username').notEmpty().withMessage('请输入用户名'),
	body('password').isLength({ min: 6 }).withMessage('请输入密码，最少6位'),
])

module.exports.updateProfileValidation = validator([
	body('username')
		.optional()
		.trim()
		.isLength({ min: 1, max: 30 })
		.withMessage('用户名长度应为1至30位'),
	body('email').optional().trim().isEmail().withMessage('请输入正确的邮箱'),
	body('avatar')
		.optional()
		.isString()
		.isLength({ max: 2048 })
		.withMessage('头像地址不能超过2048位'),
])

module.exports.changePasswordValidation = validator([
	body('currentPassword').isString().isLength({ min: 6, max: 128 }).withMessage('请输入当前密码'),
	body('newPassword').isString().isLength({ min: 8, max: 128 }).withMessage('新密码至少需要8位'),
])

module.exports.notificationSettingsValidation = validator([
	body('messageSound').optional().isBoolean().withMessage('消息提示音设置无效'),
	body('friendRequestSound').optional().isBoolean().withMessage('好友申请提示音设置无效'),
	body('showMessagePreview').optional().isBoolean().withMessage('消息预览设置无效'),
])
