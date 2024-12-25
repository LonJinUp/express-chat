const { body, validationResult } = require('express-validator')
const validator = require('./errorBack')

module.exports.friendValidation = validator([
	body('friendId').notEmpty().withMessage('请传入friendId'),
])
