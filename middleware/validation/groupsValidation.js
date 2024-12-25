const { body, query, validationResult } = require('express-validator')
const validator = require('./errorBack')

module.exports.createdValidation = validator([body('name').notEmpty().withMessage('请输入群名称')])

module.exports.groupIdValidation = validator([query('groupId').notEmpty().withMessage('群ID不能为空')])

module.exports.groupAddValidation = validator([
	body('groupId').notEmpty().withMessage('群ID不能为空'),
	body('memberId').notEmpty().withMessage('成员ID不能为空'),
])

module.exports.groupMemberRemoveValidation = validator([
	body('groupId').notEmpty().withMessage('群ID不能为空'),
	body('memberId').notEmpty().withMessage('成员ID不能为空'),
])

module.exports.setGroupAdminValidation = validator([
	body('groupId').notEmpty().withMessage('群ID不能为空'),
	body('setUser').notEmpty().withMessage('要设置为管理员的用户ID不能为空'),
])
