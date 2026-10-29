const { UserModel, GroupModel, GroupInvitationModel, GroupJoinRequestModel, ConversationModel, ConversationReadModel, MessageModel } = require('../model')
const mongoose = require('mongoose')
const crypto = require('crypto')
const { nextMessageSequence } = require('./messageSequenceService')

async function appendGroupSystemMessage(group, senderId, content, session) {
	let conversation = await ConversationModel.findOne({ type: 'group', group: group._id }).session(session)
	if (!conversation) {
		conversation = new ConversationModel({ type: 'group', group: group._id, members: group.members })
	}
	conversation.members = group.members
	const message = new MessageModel({
		conversationId: conversation._id,
		sender: senderId,
		content,
		contentType: 'system',
		sequence: await nextMessageSequence(),
	})
	await message.save({ session })
	conversation.lastMessage = message._id
	conversation.updatedAt = new Date()
	await conversation.save({ session })
	return message
}
/**
 * 根据ID获取群组
 * @param {String} groupId 群组ID
 * @returns {Object} 群组信息
 */
const getGroupById = async (groupId) => {
	const group = await GroupModel.findById(groupId)
	if (!group) {
		throw new Error('该群组不存在')
	}
	return group
}

/**
 * 创建群组
 * @param {String} ownerId 群主ID
 * @param {String} groupName 群组名称
 * @param {String} [avatar] 群头像
 * @returns {Object} 创建的群组
 */
const createGroup = async (ownerId, groupName, avatar = '') => {
	const session = await mongoose.startSession()
	session.startTransaction()

	try {
		const group = new GroupModel({
			name: groupName,
			avatar: avatar,
			owner: ownerId,
			members: [ownerId],
			admins: [ownerId],
		})

		const savedGroup = await group.save({ session })

		await UserModel.findByIdAndUpdate(
			ownerId,
			{
				$push: { groups: savedGroup._id },
			},
			{ session }
		)

		await session.commitTransaction()
		session.endSession()

		return savedGroup
	} catch (error) {
		await session.abortTransaction()
		session.endSession()
		throw new Error('创建失败: ' + error.message)
	}
}

/**
 * 加入群组 （todo: 缺少验证逻辑）
 * @param {String} groupId 群组ID
 * @param {String} operatorId 操作人ID
 * @param {String} userId 用户ID
 * @returns {Object} 更新后的群组
 */
const addGroupMember = async (groupId, operatorId, userId) => {
	const session = await mongoose.startSession()
	session.startTransaction()

	try {
		const group = await getGroupById(groupId)
		const isOperatorOwner = group.owner.toString() === operatorId
		const isOperatorAdmin = group.admins.some((id) => id.toString() === operatorId)
		if (!isOperatorOwner && !isOperatorAdmin) {
			throw new Error('您没有权限邀请成员')
		}
		const member = await UserModel.findById(userId).session(session)
		if (!member) throw new Error('用户不存在')

		// 检查用户是否已经在群组中
		if (group.members.some((id) => id.toString() === userId)) {
			throw new Error('已在群组中')
		}

		// 添加用户到成员列表
		group.members.push(userId)
		group.updatedAt = Date.now()

		await group.save({ session })

		await UserModel.findByIdAndUpdate(
			userId,
			{
				$push: { groups: group._id },
			},
			{ session }
		)

		await ConversationModel.updateOne(
			{ type: 'group', group: group._id },
			{ $addToSet: { members: userId } },
			{ session }
		)

		await session.commitTransaction()
		session.endSession()

		return group
	} catch (error) {
		await session.abortTransaction()
		session.endSession()
		throw new Error('加入失败: ' + error.message)
	}
}

const inviteGroupMember = async (groupId, operatorId, inviteeId) => {
	const group = await getGroupById(groupId)
	const canInvite = group.owner.toString() === operatorId || group.admins.some((id) => id.toString() === operatorId)
	if (!canInvite) throw new Error('您没有权限邀请成员')
	if (group.members.some((id) => id.toString() === inviteeId)) throw new Error('对方已在群组中')
	const invitee = await UserModel.findById(inviteeId).select('_id username avatar')
	if (!invitee) throw new Error('用户不存在')

	const existing = await GroupInvitationModel.findOne({ group: groupId, invitee: inviteeId, status: 'pending' })
	if (existing) throw new Error('已向对方发送过邀请')

	try {
		const invitation = await GroupInvitationModel.create({ group: groupId, inviter: operatorId, invitee: inviteeId })
		return { invitation, group, invitee }
	} catch (error) {
		if (error?.code === 11000) throw new Error('已向对方发送过邀请')
		throw error
	}
}

const getGroupInvitations = async (userId) => {
	return GroupInvitationModel.find({ invitee: userId, status: 'pending' })
		.populate('group', 'name avatar members')
		.populate('inviter', 'username avatar')
		.sort({ createdAt: -1 })
}

const getSentGroupInvitations = async (groupId, operatorId) => {
	const group = await getGroupById(groupId)
	const canManage = group.owner.toString() === operatorId || group.admins.some((id) => id.toString() === operatorId)
	if (!canManage) throw new Error('您没有权限查看群邀请')
	return GroupInvitationModel.find({ group: groupId, status: 'pending' })
		.select('_id invitee createdAt')
		.populate('invitee', 'username avatar')
		.sort({ createdAt: -1 })
}

const respondGroupInvitation = async (userId, invitationId, accept) => {
	const session = await mongoose.startSession()
	session.startTransaction()
	try {
		const invitation = await GroupInvitationModel.findOne({
			_id: invitationId,
			invitee: userId,
			status: 'pending',
		}).session(session)
		if (!invitation) throw new Error('邀请不存在或已处理')

		const group = await GroupModel.findById(invitation.group).session(session)
		if (!group) throw new Error('该群组已不存在')

		let systemMessage = null
		if (accept && !group.members.some((id) => id.toString() === userId)) {
			const joiningUser = await UserModel.findById(userId).select('username').session(session)
			group.members.addToSet(userId)
			group.updatedAt = Date.now()
			await group.save({ session })
			await UserModel.findByIdAndUpdate(userId, { $addToSet: { groups: group._id } }, { session })
			await ConversationModel.updateOne(
				{ type: 'group', group: group._id },
				{ $addToSet: { members: userId } },
				{ session }
			)
			systemMessage = await appendGroupSystemMessage(group, userId, `“${joiningUser?.username || '新成员'}”加入了群聊`, session)
		}

		invitation.status = accept ? 'accepted' : 'rejected'
		invitation.updatedAt = Date.now()
		await invitation.save({ session })
		await session.commitTransaction()
		return {
			accepted: Boolean(accept),
			group,
			inviterId: String(invitation.inviter),
			memberIds: group.members.map(String),
			systemMessage,
		}
	} catch (error) {
		await session.abortTransaction()
		throw error
	} finally {
		await session.endSession()
	}
}

/**
 * 退出群组
 * @param {String} groupId 群组ID
 * @param {String} userId 当前登录人ID
 * @param {String} currentUserId 要移除的用户ID
 * @returns {Object} 更新后的群组
 */
const removeGroupMember = async (groupId, operatorId, memberId) => {
	const session = await mongoose.startSession()
	session.startTransaction()

	try {
		const group = await getGroupById(groupId)
		const removedMember = await UserModel.findById(memberId).select('username').session(session)

		// 检查用户是否在群组中
		if (!group.members.some((id) => id.toString() === memberId)) {
			throw new Error('该用户不在群组中')
		}

		const isOperatorOwner = group.owner.toString() === operatorId
		const isOperatorAdmin = group.admins.some((id) => id.toString() === operatorId)
		const isMemberAdmin = group.admins.some((id) => id.toString() === memberId)
		const isUserSelf = operatorId === memberId

		// 如果是移除其他用户，且当前用户不是管理员或群主，则拒绝操作
		if (!isUserSelf && !isOperatorOwner && !isOperatorAdmin) {
			throw new Error('您没有权限移除该用户')
		}
		if (!isUserSelf && isMemberAdmin && !isOperatorOwner) {
			throw new Error('只有群主可以移除管理员')
		}

		// 群主不能被移除，也不能直接退出
		if (group.owner.toString() === memberId) {
			throw new Error('群主不能直接退出群聊，请先转让群主身份')
		}

		// 从成员列表中移除用户
		group.members.pull(memberId)
		group.admins.pull(memberId) // 如果用户是管理员，也从管理员列表移除
		group.memberNicknames.delete(memberId)
		group.updatedAt = Date.now()

		await group.save({ session })

		// 从用户的群组列表中移除该群组
		await UserModel.findByIdAndUpdate(
			memberId,
			{
				$pull: { groups: group._id },
			},
			{ session }
		)

		await ConversationModel.updateOne(
			{ type: 'group', group: group._id },
			{ $pull: { members: memberId } },
			{ session }
		)

		const isLeaving = operatorId === memberId
		const systemMessage = await appendGroupSystemMessage(
			group,
			operatorId,
			isLeaving
				? `“${removedMember?.username || '一位成员'}”退出了群聊`
				: `“${removedMember?.username || '一位成员'}”被移出了群聊`,
			session
		)

		await session.commitTransaction()
		session.endSession()

		return {
			group,
			systemMessage,
			memberIds: group.members.map(String),
			removedMemberId: String(memberId),
			isLeaving,
		}
	} catch (error) {
		await session.abortTransaction()
		session.endSession()
		throw new Error('退出群组失败: ' + error.message)
	}
}

/**
 * 设置群组管理员
 * @param {String} groupId 群组ID
 * @param {String} ownerId 群主ID
 * @param {String} userId 要设置为管理员的用户ID
 * @returns {Object} 更新后的群组
 */
const setGroupAdmin = async (groupId, ownerId, userId) => {
	const group = await getGroupById(groupId)

	// 验证操作权限和用户有效性
	if (group.owner.toString() !== ownerId) throw new Error('您不是群主，无法设置')
	if (!group.members.some((id) => id.toString() === userId)) throw new Error('该用户不在群组中')
	if (group.admins.some((id) => id.toString() === userId)) throw new Error('该用户已是管理员')

	// 更新管理员列表并保存
	group.admins.push(userId)
	group.updatedAt = Date.now()
	try {
		await group.save()
		return group
	} catch (error) {
		throw new Error(`设置管理员失败: ${error.message}`)
	}
}

/**
 * 取消管理员权限
 * @param {String} groupId 群组ID
 * @param {String} ownerId 群主ID
 * @param {String} userId 要取消管理员的用户ID
 * @returns {Object} 更新后的群组信息
 */
const cancelGroupAdmin = async (groupId, ownerId, userId) => {
	const group = await getGroupById(groupId)

	// 验证操作人是否是群主
	if (group.owner.toString() !== ownerId) throw new Error('您不是群主，无法取消管理员权限')
	// 验证用户是否在群组中
	if (!group.members.some((id) => id.toString() === userId)) throw new Error('该用户不在群组中')
	// 验证用户是否是管理员
	if (!group.admins.some((id) => id.toString() === userId)) throw new Error('该用户不是管理员')
	if (group.owner.toString() === userId) throw new Error('不能取消群主的管理员身份')

	// 移除管理员身份
	group.admins = group.admins.filter((adminId) => adminId.toString() !== userId)
	group.updatedAt = Date.now()

	try {
		await group.save()
		return group
	} catch (error) {
		throw new Error(`取消管理员失败: ${error.message}`)
	}
}

/**
 * 获取群组信息
 * @param {String} groupId 群组ID
 * @returns {Object} 群组信息
 */
const getGroupInfo = async (groupId, userId) => {
	const group = await GroupModel.findById(groupId)
		.populate('members', 'username avatar')
		.populate('admins', 'username avatar')
		.populate('owner', 'username avatar')
	if (!group) {
		throw new Error('没有找到该群组')
	}
	if (userId && !group.members.some((member) => String(member._id || member) === String(userId))) {
		throw new Error('你不是该群组成员')
	}
	return group
}

/**
 * 获取用户加入的群组
 * @param {String} userId
 * @returns {Array} 群组列表
 */
const getUserGroups = async (userId) => {
	console.log(userId, '==userId')
	const user = await UserModel.findById(userId).populate(
		'groups',
		'name avatar announcement owner members admins createdAt updatedAt'
	)
	if (!user) {
		throw new Error('用户不存在')
	}
	return user.groups
}

const transferGroupOwner = async (groupId, ownerId, newOwnerId) => {
	const group = await getGroupById(groupId)
	if (group.owner.toString() !== ownerId) throw new Error('只有群主可以转让群主身份')
	if (ownerId === newOwnerId) throw new Error('你已经是群主')
	if (!group.members.some((id) => id.toString() === newOwnerId)) throw new Error('新群主必须是群成员')
	group.owner = newOwnerId
	group.admins = [...new Set([...group.admins.map(String), ownerId, newOwnerId])]
	group.updatedAt = Date.now()
	await group.save()
	return { group, memberIds: group.members.map(String) }
}

const updateGroupAnnouncement = async (groupId, operatorId, announcement) => {
	const group = await getGroupById(groupId)
	const canManage = group.owner.toString() === operatorId || group.admins.some((id) => id.toString() === operatorId)
	if (!canManage) throw new Error('只有群主或管理员可以修改群公告')
	group.announcement = String(announcement || '').trim()
	group.updatedAt = Date.now()
	await group.save()
	return { group, memberIds: group.members.map(String) }
}

const updateGroupProfile = async (groupId, operatorId, profile) => {
	const group = await getGroupById(groupId)
	const canManage = group.owner.toString() === operatorId || group.admins.some((id) => id.toString() === operatorId)
	if (!canManage) throw new Error('只有群主或管理员可以修改群资料')
	if (profile.name !== undefined) group.name = String(profile.name).trim()
	if (profile.avatar !== undefined) group.avatar = String(profile.avatar).trim()
	group.updatedAt = Date.now()
	await group.save()
	return { group, memberIds: group.members.map(String) }
}

const updateMemberNickname = async (groupId, userId, nickname) => {
	const group = await getGroupById(groupId)
	if (!group.members.some((id) => id.toString() === userId)) throw new Error('你不是该群组成员')
	const value = String(nickname || '').trim()
	if (value) group.memberNicknames.set(userId, value)
	else group.memberNicknames.delete(userId)
	group.updatedAt = Date.now()
	await group.save()
	return { group, memberIds: group.members.map(String), nickname: value }
}

const canManageGroup = (group, userId) => group.owner.toString() === String(userId)
	|| group.admins.some((id) => id.toString() === String(userId))

const ensureInviteCode = async (group) => {
	if (!group.inviteCode) {
		group.inviteCode = crypto.randomBytes(18).toString('base64url')
		await group.save()
	}
	return group.inviteCode
}

const getInviteLink = async (groupId, userId, regenerate = false) => {
	const group = await getGroupById(groupId)
	if (!canManageGroup(group, userId)) throw new Error('只有群主或管理员可以管理邀请链接')
	if (regenerate) {
		group.inviteCode = crypto.randomBytes(18).toString('base64url')
		group.updatedAt = Date.now()
		await group.save()
	}
	return {
		code: await ensureInviteCode(group),
		joinApprovalRequired: group.joinApprovalRequired,
		inviteLinkEnabled: group.inviteLinkEnabled !== false,
		inviteCodeExpiresAt: group.inviteCodeExpiresAt,
	}
}

const updateJoinSettings = async (groupId, userId, settings) => {
	const group = await getGroupById(groupId)
	if (!canManageGroup(group, userId)) throw new Error('只有群主或管理员可以修改入群方式')
	if (settings.joinApprovalRequired !== undefined) group.joinApprovalRequired = Boolean(settings.joinApprovalRequired)
	if (settings.inviteLinkEnabled !== undefined) group.inviteLinkEnabled = Boolean(settings.inviteLinkEnabled)
	if (settings.expiresInDays !== undefined) {
		const days = Number(settings.expiresInDays)
		group.inviteCodeExpiresAt = days > 0 ? new Date(Date.now() + days * 86400000) : null
	}
	group.updatedAt = Date.now()
	await group.save()
	return { group, memberIds: group.members.map(String) }
}

const assertInviteLinkAvailable = (group) => {
	if (group.inviteLinkEnabled === false) throw new Error('该邀请链接已暂停使用')
	if (group.inviteCodeExpiresAt && new Date(group.inviteCodeExpiresAt).getTime() <= Date.now()) throw new Error('该邀请链接已过期')
}

const getInvitePreview = async (code, userId) => {
	const group = await GroupModel.findOne({ inviteCode: code }).populate('owner', 'username avatar')
	if (!group) throw new Error('邀请链接无效或已失效')
	assertInviteLinkAvailable(group)
	return {
		group: { _id: group._id, name: group.name, avatar: group.avatar, owner: group.owner, memberCount: group.members.length },
		joined: group.members.some((id) => id.toString() === String(userId)),
		joinApprovalRequired: group.joinApprovalRequired,
	}
}

const joinGroupByInviteCode = async (code, userId, message = '') => {
	const group = await GroupModel.findOne({ inviteCode: code })
	if (!group) throw new Error('邀请链接无效或已失效')
	assertInviteLinkAvailable(group)
	if (group.members.some((id) => id.toString() === String(userId))) return { joined: true, group, alreadyJoined: true }
	const user = await UserModel.findById(userId).select('username')
	if (!user) throw new Error('用户不存在')
	if (group.joinApprovalRequired) {
		const pending = await GroupJoinRequestModel.findOne({ group: group._id, applicant: userId, status: 'pending' })
		if (pending) return { joined: false, pending: true, group, request: pending }
		const request = await GroupJoinRequestModel.create({ group: group._id, applicant: userId, message: String(message || '').trim() })
		return { joined: false, pending: true, group, request }
	}
	group.members.addToSet(userId)
	group.updatedAt = Date.now()
	await group.save()
	await UserModel.findByIdAndUpdate(userId, { $addToSet: { groups: group._id } })
	await ConversationModel.updateOne({ type: 'group', group: group._id }, { $addToSet: { members: userId } })
	const systemMessage = await appendGroupSystemMessage(group, userId, `“${user.username || '新成员'}”通过邀请链接加入了群聊`)
	return { joined: true, group, memberIds: group.members.map(String), systemMessage }
}

const getJoinRequests = async (groupId, userId) => {
	const group = await getGroupById(groupId)
	if (!canManageGroup(group, userId)) throw new Error('只有群主或管理员可以查看入群申请')
	return GroupJoinRequestModel.find({ group: groupId, status: 'pending' }).populate('applicant', 'username avatar').sort({ createdAt: -1 })
}

const getManagedJoinRequests = async (userId) => {
	const groups = await GroupModel.find({ $or: [{ owner: userId }, { admins: userId }] }).select('_id')
	if (!groups.length) return []
	return GroupJoinRequestModel.find({ group: { $in: groups.map(item => item._id) }, status: 'pending' })
		.populate('group', 'name avatar')
		.populate('applicant', 'username avatar')
		.sort({ createdAt: -1 })
}

const respondJoinRequest = async (groupId, requestId, userId, accept) => {
	const group = await getGroupById(groupId)
	if (!canManageGroup(group, userId)) throw new Error('只有群主或管理员可以处理入群申请')
	const request = await GroupJoinRequestModel.findOne({ _id: requestId, group: groupId, status: 'pending' }).populate('applicant', 'username')
	if (!request) throw new Error('申请不存在或已处理')
	let systemMessage = null
	if (accept && !group.members.some((id) => id.toString() === String(request.applicant._id))) {
		group.members.addToSet(request.applicant._id)
		group.updatedAt = Date.now()
		await group.save()
		await UserModel.findByIdAndUpdate(request.applicant._id, { $addToSet: { groups: group._id } })
		await ConversationModel.updateOne({ type: 'group', group: group._id }, { $addToSet: { members: request.applicant._id } })
		systemMessage = await appendGroupSystemMessage(group, userId, `“${request.applicant.username || '新成员'}”加入了群聊`)
	}
	request.status = accept ? 'accepted' : 'rejected'
	await request.save()
	return { accepted: Boolean(accept), group, applicantId: String(request.applicant._id), memberIds: group.members.map(String), systemMessage }
}

const dissolveGroup = async (groupId, ownerId) => {
	const group = await getGroupById(groupId)
	if (group.owner.toString() !== ownerId) throw new Error('只有群主可以解散群聊')
	const memberIds = group.members.map(String)
	const conversations = await ConversationModel.find({ type: 'group', group: group._id }).select('_id')
	const conversationIds = conversations.map((item) => item._id)
	await UserModel.updateMany({ _id: { $in: group.members } }, { $pull: { groups: group._id } })
	await MessageModel.deleteMany({ conversationId: { $in: conversationIds } })
	await ConversationReadModel.deleteMany({ conversation: { $in: conversationIds } })
	await ConversationModel.deleteMany({ _id: { $in: conversationIds } })
	await GroupInvitationModel.deleteMany({ group: group._id })
	await GroupModel.deleteOne({ _id: group._id })
	return { memberIds }
}

module.exports = {
	createGroup,
	addGroupMember,
	inviteGroupMember,
	getGroupInvitations,
	getSentGroupInvitations,
	respondGroupInvitation,
	removeGroupMember,
	setGroupAdmin,
	cancelGroupAdmin,
	getGroupInfo,
	getUserGroups,
	transferGroupOwner,
	updateGroupAnnouncement,
	updateGroupProfile,
	updateMemberNickname,
	dissolveGroup,
	getInviteLink,
	updateJoinSettings,
	getInvitePreview,
	joinGroupByInviteCode,
	getJoinRequests,
	getManagedJoinRequests,
	respondJoinRequest,
}
