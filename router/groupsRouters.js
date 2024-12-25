const express = require('express')
const router = express.Router()
const groupsController = require('../controller/groupsController')
const validator = require('../middleware/validation/groupsValidation')
const { authenticateToken } = require('../middleware/authMiddleware')

// 创建群组
router.post('/group/create', authenticateToken, validator.createdValidation, groupsController.createGroup)
//获取群组信息
router.get('/group/info', authenticateToken, validator.groupIdValidation, groupsController.getGroupInfo)
//添加群组成员
router.post('/group/addMember', authenticateToken, validator.groupAddValidation, groupsController.addGroupMember)
//移除群组成员
router.post(
	'/group/removeMember',
	authenticateToken,
	validator.groupMemberRemoveValidation,
	groupsController.removeGroupMember
)
//获取当前用户已加入的群组
router.get('/group/joined', authenticateToken, groupsController.getUserGroups)
//设置管理员
router.get('/group/setGroupAdmin', authenticateToken, validator.setGroupAdminValidation, groupsController.setGroupAdmin)

module.exports = router
