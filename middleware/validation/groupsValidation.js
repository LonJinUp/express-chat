const { body, query, validationResult } = require('express-validator')
const validator = require('./errorBack')

module.exports.createdValidation = validator([body('name').notEmpty().withMessage('请输入群名称')])

module.exports.groupIdValidation = validator([query('groupId').notEmpty().withMessage('群ID不能为空')])

module.exports.groupAddValidation = validator([
	body('groupId').notEmpty().withMessage('群ID不能为空'),
	body('memberId').notEmpty().withMessage('成员ID不能为空'),
])

module.exports.groupInviteValidation = validator([
	body('groupId').notEmpty().withMessage('群ID不能为空'),
	body('memberId').notEmpty().withMessage('成员ID不能为空'),
])

module.exports.groupInvitationResponseValidation = validator([
	body('invitationId').notEmpty().withMessage('邀请ID不能为空'),
	body('accept').isBoolean().withMessage('处理结果格式无效'),
])

module.exports.groupMemberRemoveValidation = validator([
	body('groupId').notEmpty().withMessage('群ID不能为空'),
	body('memberId').notEmpty().withMessage('成员ID不能为空'),
])

module.exports.setGroupAdminValidation = validator([
	body('groupId').notEmpty().withMessage('群ID不能为空'),
	body('setUser').notEmpty().withMessage('要设置为管理员的用户ID不能为空'),
])

module.exports.transferOwnerValidation = validator([
	body('groupId').notEmpty().withMessage('群ID不能为空'),
	body('newOwnerId').notEmpty().withMessage('新群主ID不能为空'),
])

module.exports.updateAnnouncementValidation = validator([
	body('groupId').notEmpty().withMessage('群ID不能为空'),
	body('announcement').isString().withMessage('群公告格式无效').isLength({ max: 500 }).withMessage('群公告不能超过500字'),
])

module.exports.updateProfileValidation = validator([
	body('groupId').notEmpty().withMessage('群ID不能为空'),
	body('name').isString().withMessage('群名称格式无效').trim().isLength({ min: 1, max: 40 }).withMessage('群名称长度应为1到40字'),
	body('avatar').optional().isString().withMessage('群头像格式无效').isLength({ max: 2048 }).withMessage('群头像地址过长'),
])

module.exports.updateNicknameValidation = validator([
	body('groupId').notEmpty().withMessage('群ID不能为空'),
	body('nickname').isString().withMessage('群昵称格式无效').trim().isLength({ max: 24 }).withMessage('群昵称不能超过24字'),
])

module.exports.dissolveValidation = validator([body('groupId').notEmpty().withMessage('群ID不能为空')])

module.exports.joinSettingsValidation = validator([
	body('groupId').notEmpty().withMessage('群ID不能为空'),
	body('joinApprovalRequired').optional().isBoolean().withMessage('审核设置格式无效'),
	body('inviteLinkEnabled').optional().isBoolean().withMessage('链接开关格式无效'),
	body('expiresInDays').optional().isIn([0, 1, 7, 30]).withMessage('有效期仅支持永久、1天、7天或30天'),
])
module.exports.inviteCodeQueryValidation = validator([query('code').notEmpty().withMessage('邀请口令不能为空')])
module.exports.joinByLinkValidation = validator([
	body('code').notEmpty().withMessage('邀请口令不能为空'),
	body('message').optional().isString().isLength({ max: 120 }).withMessage('申请说明不能超过120字'),
])
module.exports.joinRequestResponseValidation = validator([
	body('groupId').notEmpty().withMessage('群ID不能为空'),
	body('requestId').notEmpty().withMessage('申请ID不能为空'),
	body('accept').isBoolean().withMessage('处理结果格式无效'),
])
