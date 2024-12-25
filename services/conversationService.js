const { ConversationModel, GroupModel, ConversationReadModel } = require('../model')

/**
 * 查询当前用户的最近聊天会话
 * @param {String} userId - 当前用户ID
 * @param {String} type - 会话类型，单聊（private）或群聊（group）
 * @param {Number} page - 页码
 * @param {Number} limit - 每页记录数
 * @returns {Object} - 包含会话总数、当前页码和会话列表的对象
 */
const getUserConversations = async (userId, type, page = 1, limit = 10) => {
	const pageNumber = Math.max(parseInt(page, 10), 1)
	const limitNumber = Math.max(parseInt(limit, 10), 1)
	const skip = (pageNumber - 1) * limitNumber

	let rawConversations = []

	if (!type) {
		// 获取所有会话并合并
		const privateConversations = await ConversationModel.find({ members: userId, type: 'private' })
			.sort({ updatedAt: -1 })
			.populate('members', 'username')
			.populate('lastMessage')
			.exec()

		const userGroups = await GroupModel.find({ members: userId }).select('_id')
		let groupConversations = []

		if (userGroups.length > 0) {
			groupConversations = await ConversationModel.find({
				type: 'group',
				group: { $in: userGroups.map((group) => group._id) },
			})
				.sort({ updatedAt: -1 })
				.populate('members', 'username')
				.populate('lastMessage')
				.populate('group', 'name')
				.exec()
		}

		rawConversations = [...privateConversations, ...groupConversations]
	} else {
		// 根据type获取特定类型的会话
		const query = { members: userId, type }
		rawConversations = await ConversationModel.find(query)
			.sort({ updatedAt: -1 })
			.populate('members', 'username')
			.populate('lastMessage')
			.populate('group', 'name')
			.exec()
	}

	// 获取所有会话的已读状态
	const readStatuses = await ConversationReadModel.find({
		user: userId,
	})
	console.log('Read statuses:', readStatuses)

	const readStatusMap = new Map(readStatuses.map((status) => [status.conversation.toString(), status.readAt]))

	// 转换数据格式
	const formattedConversations = rawConversations.map((conv) => {
		let name = ''
		let membersList = []
		const readAt = readStatusMap.get(conv._id.toString()) || new Date(0)
		const isUnread =
			conv.lastMessage &&
			conv.lastMessage.createdAt > readAt &&
			conv.lastMessage.sender.toString() !== userId.toString()

		if (conv.type === 'group') {
			name = conv.group?.name || '未命名群组'
			membersList = []
		} else {
			const otherMember = conv.members.find((member) => member._id.toString() !== userId)
			name = otherMember?.username || '未知用户'
			membersList = [
				{
					_id: otherMember?._id,
					username: otherMember?.username,
				},
			]
		}

		return {
			_id: conv._id,
			name,
			members: membersList,
			lastMessage: conv.lastMessage || {},
			updatedAt: conv.updatedAt,
			type: conv.type,
			isUnread,
			readAt,
		}
	})

	// 按更新时间排序
	formattedConversations.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))

	// 分页
	const total = formattedConversations.length
	const paginatedConversations = formattedConversations.slice(skip, skip + limitNumber)

	return {
		total,
		page: pageNumber,
		limit: limitNumber,
		list: paginatedConversations,
	}
}

// 添加新的辅助函数
const markConversationAsRead = async (conversationId, userId) => {
	await ConversationReadModel.findOneAndUpdate(
		{ conversation: conversationId, user: userId },
		{ readAt: new Date() },
		{ upsert: true }
	)
}

/**
 * 根据会话类型和ID查找历史会话
 * @param {String} type - 会话类型（'private' 或 'group'）
 * @param {String} id - 私聊用户的ID或群聊的ID
 * @returns {String|null} - 返回会话ID或null如果没有找到
 * @throws {Error} - 如果查询过程中发生错误，则抛出错误
 */
const findConversationByTypeAndId = async (type, id) => {
	try {
		let query = { type }

		if (type === 'private') {
			query.members = { $in: [id] }
		} else if (type === 'group') {
			query.group = id
		} else {
			throw new Error('无效的会话类型')
		}

		const conversation = await ConversationModel.findOne(query)

		return conversation ? conversation._id : null
	} catch (error) {
		console.error('Error finding conversation:', error)
		throw error
	}
}

module.exports = {
	getUserConversations,
	markConversationAsRead,
	findConversationByTypeAndId,
}
