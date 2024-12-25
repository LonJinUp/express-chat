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
