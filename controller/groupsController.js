const groupService = require('../services/groupsService')
const realtimeService = require('../services/realtimeService')

/**
 * 创建群组
 * @param {Object} req
 * @param {Object} res
 */
exports.createGroup = async (req, res) => {
	try {
		const { name, avatar = '' } = req.body
		const { id: ownerId } = req.user
		const group = await groupService.createGroup(ownerId, name, avatar)
		res.handleSuccess(group)
	} catch (error) {
		res.handleError(error.message)
	}
}

/**
 * 获取群组信息
 * @param {Object} req
 * @param {Object} res
 */
exports.getGroupInfo = async (req, res) => {
	try {
		const groupId = req.query.groupId
		const group = await groupService.getGroupInfo(groupId)
		res.handleSuccess(group)
	} catch (error) {
		res.handleError(error.message)
	}
}

/**
 * 添加群组成员
 * @param {Object} req
 * @param {Object} res
 */
exports.addGroupMember = async (req, res) => {
	try {
		const { id: userId } = req.user
		const { groupId, memberId } = req.body
		const group = await groupService.addGroupMember(groupId, userId, memberId)
		res.handleSuccess(group)
	} catch (error) {
		res.handleError(error.message)
	}
}

/**
 * 移除群组成员
 * @param {Object} req
 * @param {Object} res
 */
exports.removeGroupMember = async (req, res) => {
	try {
		const { id: userId } = req.user
		const { groupId, memberId } = req.body
		const group = await groupService.removeGroupMember(groupId, userId, memberId)
		res.handleSuccess(group)
	} catch (error) {
		res.handleError(error.message)
	}
}

/**
 * 获取用户加入的群组
 * @param {Object} req
 * @param {Object} res
 */
exports.getUserGroups = async (req, res) => {
	try {
		const { id: userId } = req.user
		const groups = await groupService.getUserGroups(userId)
		res.handleSuccess(groups)
	} catch (error) {
		res.handleError(error.message)
	}
}

/**
 * 设置管理员
 * @param {Object} req
 * @param {Object} res
 */
exports.setGroupAdmin = async (req, res) => {
	try {
		const { id: userId } = req.user
		const { groupId, setUser } = req.body
		const groups = await groupService.setGroupAdmin(groupId, userId, setUser)
		res.handleSuccess(groups)
	} catch (error) {
		res.handleError(error.message)
	}
}

/**
 * 取消管理员
 * @param {Object} req
 * @param {Object} res
 */
exports.cancelGroupAdmin = async (req, res) => {
	try {
		const { id: userId } = req.user
		const { groupId, setUser } = req.body
		const group = await groupService.cancelGroupAdmin(groupId, userId, setUser)
		res.handleSuccess(group)
	} catch (error) {
		res.handleError(error.message)
	}
}

exports.transferGroupOwner = async (req, res) => {
	try {
		const result = await groupService.transferGroupOwner(req.body.groupId, req.user.id, req.body.newOwnerId)
		realtimeService.pushToUsers(result.memberIds, 'group_updated', { groupId: req.body.groupId, action: 'owner_transferred' })
		res.handleSuccess(result.group, '群主已转让')
	} catch (error) { res.handleError(error.message) }
}

exports.updateGroupAnnouncement = async (req, res) => {
	try {
		const result = await groupService.updateGroupAnnouncement(req.body.groupId, req.user.id, req.body.announcement)
		realtimeService.pushToUsers(result.memberIds, 'group_updated', { groupId: req.body.groupId, action: 'announcement_updated' })
		res.handleSuccess(result.group, '群公告已更新')
	} catch (error) { res.handleError(error.message) }
}

exports.dissolveGroup = async (req, res) => {
	try {
		const result = await groupService.dissolveGroup(req.body.groupId, req.user.id)
		realtimeService.pushToUsers(result.memberIds, 'group_dissolved', { groupId: req.body.groupId })
		res.handleSuccess(null, '群聊已解散')
	} catch (error) { res.handleError(error.message) }
}
