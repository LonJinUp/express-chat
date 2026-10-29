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
router.post('/group/invite', authenticateToken, validator.groupInviteValidation, groupsController.inviteGroupMember)
router.get('/group/invitations', authenticateToken, groupsController.getGroupInvitations)
router.get('/group/invitations/sent', authenticateToken, validator.groupIdValidation, groupsController.getSentGroupInvitations)
router.post('/group/invitation/respond', authenticateToken, validator.groupInvitationResponseValidation, groupsController.respondGroupInvitation)
router.get('/group/invite-link', authenticateToken, validator.groupIdValidation, groupsController.getInviteLink)
router.put('/group/join-settings', authenticateToken, validator.joinSettingsValidation, groupsController.updateJoinSettings)
router.get('/group/invite-preview', authenticateToken, validator.inviteCodeQueryValidation, groupsController.getInvitePreview)
router.post('/group/join-by-link', authenticateToken, validator.joinByLinkValidation, groupsController.joinByInviteLink)
router.get('/group/join-requests', authenticateToken, validator.groupIdValidation, groupsController.getJoinRequests)
router.get('/group/managed-join-requests', authenticateToken, groupsController.getManagedJoinRequests)
router.post('/group/join-request/respond', authenticateToken, validator.joinRequestResponseValidation, groupsController.respondJoinRequest)
//移除群组成员
router.post(
	'/group/removeMember',
	authenticateToken,
	validator.groupMemberRemoveValidation,
	groupsController.removeGroupMember
)
//获取当前用户已加入的群组
router.get('/group/joined', authenticateToken, groupsController.getUserGroups)
// 设置管理员
router.post(
	'/group/setGroupAdmin',
	authenticateToken,
	validator.setGroupAdminValidation,
	groupsController.setGroupAdmin
)
// 取消管理员
router.post(
	'/group/cancelGroupAdmin',
	authenticateToken,
	validator.setGroupAdminValidation,
	groupsController.cancelGroupAdmin
)
router.post('/group/transferOwner', authenticateToken, validator.transferOwnerValidation, groupsController.transferGroupOwner)
router.post('/group/announcement', authenticateToken, validator.updateAnnouncementValidation, groupsController.updateGroupAnnouncement)
router.put('/group/profile', authenticateToken, validator.updateProfileValidation, groupsController.updateGroupProfile)
router.put('/group/nickname', authenticateToken, validator.updateNicknameValidation, groupsController.updateMemberNickname)
router.post('/group/dissolve', authenticateToken, validator.dissolveValidation, groupsController.dissolveGroup)

module.exports = router
