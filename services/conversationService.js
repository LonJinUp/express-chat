const { ConversationModel, GroupModel, ConversationReadModel, MessageModel } = require('../model')

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
	const readStatusMap = new Map(readStatuses.map((status) => [status.conversation.toString(), status]))

	// 转换数据格式
	const formattedConversations = await Promise.all(rawConversations.map(async (conv) => {
		let name = ''
		let membersList = []
		const readState = readStatusMap.get(conv._id.toString())
		const readAt = readState?.readAt || new Date(0)
		const isCleared = Boolean(
			readState?.clearedAt && conv.lastMessage?.createdAt <= readState.clearedAt
		)
		const isDeletedForUser = conv.lastMessage?.deletedFor?.some((id) => String(id) === String(userId))
		const visibleLastMessage = isCleared || isDeletedForUser ? null : conv.lastMessage
		let formattedLastMessage = visibleLastMessage
		if (visibleLastMessage) {
			const messageObject = visibleLastMessage.toObject()
			if (visibleLastMessage.recalledAt) {
				formattedLastMessage = { ...messageObject, content: '[消息已撤回]' }
			} else if (visibleLastMessage.encrypted) {
				formattedLastMessage = { ...messageObject, content: '🔒 加密消息' }
			} else if (visibleLastMessage.contentType === 'image') {
				formattedLastMessage = { ...messageObject, content: '[图片]' }
			} else if (visibleLastMessage.contentType === 'file') {
				formattedLastMessage = { ...messageObject, content: '[文件]' }
			} else if (visibleLastMessage.contentType === 'audio') {
				formattedLastMessage = { ...messageObject, content: '[语音]' }
			}
		}
		const unreadAfter = readState?.clearedAt && readState.clearedAt > readAt ? readState.clearedAt : readAt
		const unreadCount = await MessageModel.countDocuments({
			conversationId: conv._id,
			sender: { $ne: userId },
			createdAt: { $gt: unreadAfter },
			recalledAt: null,
			deletedFor: { $ne: userId },
		})
		const isUnread = unreadCount > 0

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
			groupId: conv.type === 'group' ? conv.group?._id : undefined,
			members: membersList,
			lastMessage: formattedLastMessage || {},
			updatedAt: conv.updatedAt,
			type: conv.type,
			isUnread,
			unreadCount,
			readAt,
			pinnedAt: readState?.pinnedAt || null,
			isPinned: Boolean(readState?.pinnedAt),
			muted: Boolean(readState?.muted),
		}
	}))

	// 置顶会话优先，同一分组内按更新时间排序
	formattedConversations.sort((a, b) => {
		if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
		return new Date(b.updatedAt) - new Date(a.updatedAt)
	})

	// 分页
	const total = formattedConversations.length
	const totalUnread = formattedConversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0)
	const paginatedConversations = formattedConversations.slice(skip, skip + limitNumber)

	return {
		total,
		totalUnread,
		page: pageNumber,
		limit: limitNumber,
		list: paginatedConversations,
	}
}

// 添加新的辅助函数
const markConversationAsRead = async (conversationId, userId) => {
	const conversation = await ConversationModel.findById(conversationId).select('members')
	if (!conversation || !conversation.members.some((id) => id.toString() === userId)) throw new Error('当前成员不是该会话成员')
	const readAt = new Date()
	await ConversationReadModel.findOneAndUpdate(
		{ conversation: conversationId, user: userId },
		{ readAt },
		{ upsert: true }
	)
	return { readAt, recipientIds: conversation.members.map(String).filter((id) => id !== String(userId)) }
}

const getConversationReadStatus = async (conversationId, userId) => {
	const conversation = await ConversationModel.findById(conversationId).select('members type')
	if (!conversation || !conversation.members.some((id) => id.toString() === userId)) throw new Error('当前成员不是该会话成员')
	const states = await ConversationReadModel.find({ conversation: conversationId, user: { $in: conversation.members } }).select('user readAt')
	return { conversationId, type: conversation.type, members: states.map((state) => ({ userId: state.user, readAt: state.readAt })) }
}

/**
 * 清空当前用户看到的会话记录，不影响其他成员的数据
 */
const clearConversationHistory = async (conversationId, userId) => {
	const conversation = await ConversationModel.findById(conversationId)
	if (!conversation) throw new Error('当前会话不存在')
	if (!conversation.members.some((id) => id.toString() === userId)) {
		throw new Error('当前成员不是该会话成员')
	}
	const now = new Date()
	await ConversationReadModel.findOneAndUpdate(
		{ conversation: conversationId, user: userId },
		{ readAt: now, clearedAt: now },
		{ upsert: true }
	)
}

const updateConversationPreferences = async ({ conversationId, pinned, muted }, userId) => {
	if (!conversationId) throw new Error('缺少会话ID')
	const conversation = await ConversationModel.findById(conversationId).select('members')
	if (!conversation) throw new Error('当前会话不存在')
	if (!conversation.members.some((id) => id.toString() === userId)) {
		throw new Error('当前成员不是该会话成员')
	}

	const changes = {}
	if (typeof pinned === 'boolean') changes.pinnedAt = pinned ? new Date() : null
	if (typeof muted === 'boolean') changes.muted = muted
	if (!Object.keys(changes).length) throw new Error('没有可更新的会话设置')

	const state = await ConversationReadModel.findOneAndUpdate(
		{ conversation: conversationId, user: userId },
		{ $set: changes, $setOnInsert: { readAt: new Date(0) } },
		{ upsert: true, new: true }
	)
	return {
		conversationId,
		pinnedAt: state.pinnedAt,
		isPinned: Boolean(state.pinnedAt),
		muted: Boolean(state.muted),
	}
}

/**
 * 根据会话类型和ID查找历史会话
 * @param {String} type - 会话类型（'private' 或 'group'）
 * @param {String} id - 私聊用户的ID或群聊的ID
 * @returns {String|null} - 返回会话ID或null如果没有找到
 * @throws {Error} - 如果查询过程中发生错误，则抛出错误
 */
const findConversationByTypeAndId = async (type, id, userId) => {
	try {
		let query = { type }

		if (type === 'private') {
			query.members = { $all: [id, userId] }
		} else if (type === 'group') {
			query.group = id
			query.members = userId
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
	getConversationReadStatus,
	clearConversationHistory,
	updateConversationPreferences,
	findConversationByTypeAndId,
}
