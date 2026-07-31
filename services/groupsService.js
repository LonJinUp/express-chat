const { UserModel, GroupModel, ConversationModel, ConversationReadModel, MessageModel } = require('../model')
const mongoose = require('mongoose')
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

		await session.commitTransaction()
		session.endSession()

		return group
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
const getGroupInfo = async (groupId) => {
	const group = await GroupModel.findById(groupId)
		.populate('members', 'username avatar')
		.populate('admins', 'username avatar')
		.populate('owner', 'username avatar')
	if (!group) {
		throw new Error('没有找到该群组')
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
	await GroupModel.deleteOne({ _id: group._id })
	return { memberIds }
}

module.exports = {
	createGroup,
	addGroupMember,
	removeGroupMember,
	setGroupAdmin,
	cancelGroupAdmin,
	getGroupInfo,
	getUserGroups,
	transferGroupOwner,
	updateGroupAnnouncement,
	dissolveGroup,
}
