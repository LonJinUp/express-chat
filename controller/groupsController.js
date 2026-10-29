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
		const group = await groupService.getGroupInfo(groupId, req.user.id)
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

exports.inviteGroupMember = async (req, res) => {
	try {
		const result = await groupService.inviteGroupMember(req.body.groupId, req.user.id, req.body.memberId)
		realtimeService.pushToUser(req.body.memberId, 'group_invitation_received', {
			invitationId: result.invitation._id,
			group: { _id: result.group._id, name: result.group.name, avatar: result.group.avatar },
			inviter: { _id: req.user.id },
		})
		res.handleSuccess(result.invitation, '邀请已发送')
	} catch (error) { res.handleError(error.message) }
}

exports.getGroupInvitations = async (req, res) => {
	try {
		const invitations = await groupService.getGroupInvitations(req.user.id)
		res.handleSuccess(invitations.filter((item) => item.group))
	} catch (error) { res.handleError(error.message) }
}

exports.getSentGroupInvitations = async (req, res) => {
	try {
		const invitations = await groupService.getSentGroupInvitations(req.query.groupId, req.user.id)
		res.handleSuccess(invitations)
	} catch (error) { res.handleError(error.message) }
}

exports.respondGroupInvitation = async (req, res) => {
	try {
		const result = await groupService.respondGroupInvitation(req.user.id, req.body.invitationId, req.body.accept)
		realtimeService.pushToUser(result.inviterId, 'group_invitation_responded', {
			groupId: result.group._id,
			userId: req.user.id,
			accepted: result.accepted,
		})
		if (result.accepted) {
			realtimeService.pushToUsers(result.memberIds, 'group_updated', {
				groupId: result.group._id,
				action: 'member_joined',
				userId: req.user.id,
			})
			if (result.systemMessage) {
				realtimeService.pushToUsers(result.memberIds, 'group_message', {
					...result.systemMessage.toObject(),
					conversationType: 'group',
					groupId: result.group._id,
					groupName: result.group.name,
				})
			}
		}
		res.handleSuccess({ accepted: result.accepted, group: result.group }, result.accepted ? '已加入群聊' : '已拒绝邀请')
	} catch (error) { res.handleError(error.message) }
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
		const result = await groupService.removeGroupMember(groupId, userId, memberId)
		realtimeService.pushToUsers(result.memberIds, 'group_updated', {
			groupId,
			action: result.isLeaving ? 'member_left' : 'member_removed',
			userId: memberId,
		})
		if (result.systemMessage) {
			realtimeService.pushToUsers(result.memberIds, 'group_message', {
				...result.systemMessage.toObject(),
				conversationType: 'group',
				groupId,
				groupName: result.group.name,
			})
		}
		realtimeService.pushToUser(result.removedMemberId, 'group_member_removed', {
			groupId,
			byUserId: userId,
			leftVoluntarily: result.isLeaving,
		})
		res.handleSuccess(result.group)
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

exports.updateGroupProfile = async (req, res) => {
	try {
		const result = await groupService.updateGroupProfile(req.body.groupId, req.user.id, {
			name: req.body.name,
			avatar: req.body.avatar,
		})
		realtimeService.pushToUsers(result.memberIds, 'group_updated', { groupId: req.body.groupId, action: 'profile_updated' })
		res.handleSuccess(result.group, '群资料已更新')
	} catch (error) { res.handleError(error.message) }
}

exports.updateMemberNickname = async (req, res) => {
	try {
		const result = await groupService.updateMemberNickname(req.body.groupId, req.user.id, req.body.nickname)
		realtimeService.pushToUsers(result.memberIds, 'group_updated', {
			groupId: req.body.groupId,
			action: 'nickname_updated',
			userId: req.user.id,
			nickname: result.nickname,
		})
		res.handleSuccess({ nickname: result.nickname }, '群昵称已更新')
	} catch (error) { res.handleError(error.message) }
}

exports.getInviteLink = async (req, res) => {
	try {
		const result = await groupService.getInviteLink(req.query.groupId, req.user.id, req.query.regenerate === 'true')
		res.handleSuccess(result)
	} catch (error) { res.handleError(error.message) }
}

exports.updateJoinSettings = async (req, res) => {
	try {
		const result = await groupService.updateJoinSettings(req.body.groupId, req.user.id, {
			joinApprovalRequired: req.body.joinApprovalRequired,
			inviteLinkEnabled: req.body.inviteLinkEnabled,
			expiresInDays: req.body.expiresInDays,
		})
		realtimeService.pushToUsers(result.memberIds, 'group_updated', { groupId: req.body.groupId, action: 'join_settings_updated' })
		res.handleSuccess(result.group, '入群设置已更新')
	} catch (error) { res.handleError(error.message) }
}

exports.getInvitePreview = async (req, res) => {
	try { res.handleSuccess(await groupService.getInvitePreview(req.query.code, req.user.id)) }
	catch (error) { res.handleError(error.message) }
}

exports.joinByInviteLink = async (req, res) => {
	try {
		const result = await groupService.joinGroupByInviteCode(req.body.code, req.user.id, req.body.message)
		if (result.pending) {
			const managerIds = [...new Set([String(result.group.owner), ...result.group.admins.map(String)])]
			realtimeService.pushToUsers(managerIds, 'group_join_request_received', { groupId: result.group._id, requestId: result.request._id })
		}
		if (result.joined && !result.alreadyJoined) {
			realtimeService.pushToUsers(result.memberIds, 'group_updated', { groupId: result.group._id, action: 'member_joined', userId: req.user.id })
			if (result.systemMessage) realtimeService.pushToUsers(result.memberIds, 'group_message', { ...result.systemMessage.toObject(), conversationType: 'group', groupId: result.group._id, groupName: result.group.name })
		}
		res.handleSuccess({ joined: result.joined, pending: Boolean(result.pending), alreadyJoined: Boolean(result.alreadyJoined), group: result.group }, result.pending ? '入群申请已提交' : '已加入群聊')
	} catch (error) { res.handleError(error.message) }
}

exports.getJoinRequests = async (req, res) => {
	try { res.handleSuccess(await groupService.getJoinRequests(req.query.groupId, req.user.id)) }
	catch (error) { res.handleError(error.message) }
}

exports.getManagedJoinRequests = async (req, res) => {
	try { res.handleSuccess(await groupService.getManagedJoinRequests(req.user.id)) }
	catch (error) { res.handleError(error.message) }
}

exports.respondJoinRequest = async (req, res) => {
	try {
		const result = await groupService.respondJoinRequest(req.body.groupId, req.body.requestId, req.user.id, req.body.accept)
		realtimeService.pushToUser(result.applicantId, 'group_join_request_responded', { groupId: result.group._id, accepted: result.accepted })
		if (result.accepted) {
			realtimeService.pushToUsers(result.memberIds, 'group_updated', { groupId: result.group._id, action: 'member_joined', userId: result.applicantId })
			if (result.systemMessage) realtimeService.pushToUsers(result.memberIds, 'group_message', { ...result.systemMessage.toObject(), conversationType: 'group', groupId: result.group._id, groupName: result.group.name })
		}
		res.handleSuccess({ accepted: result.accepted }, result.accepted ? '已同意入群' : '已拒绝申请')
	} catch (error) { res.handleError(error.message) }
}

exports.dissolveGroup = async (req, res) => {
	try {
		const result = await groupService.dissolveGroup(req.body.groupId, req.user.id)
		realtimeService.pushToUsers(result.memberIds, 'group_dissolved', { groupId: req.body.groupId })
		res.handleSuccess(null, '群聊已解散')
	} catch (error) { res.handleError(error.message) }
}
