const mongoose = require('mongoose')
const { ConversationModel, MessageModel, MessageFavoriteModel, GroupModel, UserModel, ConversationReadModel } = require('../model/index')
const { nextMessageSequence, currentMessageSequence } = require('./messageSequenceService')

function idListHasUserId(list, userId) {
	if (userId == null || !list || !list.length) return false
	const uid = String(userId)
	return list.some((item) => String(item?._id || item) === uid)
}

/**
 * 将客户端传入的对方标识解析为 User._id（支持 MongoDB _id 或 userId 字符串）
 */
async function resolveRecipientObjectId(recipientId) {
	if (recipientId == null || recipientId === '') {
		throw new Error('无效的接收者')
	}
	const s = String(recipientId).trim()
	if (mongoose.Types.ObjectId.isValid(s)) {
		const byId = await UserModel.findById(s).select('_id')
		if (byId) return byId._id
	}
	const byUserId = await UserModel.findOne({ userId: s }).select('_id')
	if (byUserId) return byUserId._id
	throw new Error('无效的接收者')
}

/**
 * 校验双方是否为好友（基于 User.friends）
 */
async function assertUsersAreFriends(senderId, recipientOid) {
	if (String(senderId) === recipientOid.toString()) {
		throw new Error('不能给自己发消息')
	}
	const [sender, blockedByRecipient] = await Promise.all([
		UserModel.findById(senderId).select('friends blockedUsers'),
		UserModel.exists({ _id: recipientOid, blockedUsers: senderId }),
	])
	if (!sender) {
		throw new Error('用户不存在')
	}
	const ok = sender.friends.some((fid) => fid.equals(recipientOid))
	if (!ok) {
		throw new Error('仅可向好友发送私聊消息')
	}
	if (sender.blockedUsers?.some((id) => id.equals(recipientOid)) || blockedByRecipient) {
		throw new Error('当前无法向该用户发送消息')
	}
}

async function validateReplyTarget(replyTo, conversationId, session) {
	if (!replyTo) return null
	if (!mongoose.Types.ObjectId.isValid(replyTo)) throw new Error('引用消息不存在')
	const query = MessageModel.findById(replyTo).select('_id conversationId recalledAt')
	if (session) query.session(session)
	const target = await query
	if (!target || String(target.conversationId) !== String(conversationId)) throw new Error('引用消息不属于当前会话')
	if (target.recalledAt) throw new Error('不能引用已撤回的消息')
	return target._id
}

/**
 * 创建&&保存私聊消息
 * @param {String} senderId - 发送者ID
 * @param {String} recipientId - 接收者ID
 * @param {String} content - 消息内容
 * @param {String} contentType - 消息类型（例如 'text', 'image', 'file'）
 * @returns {Object} message - 保存后的消息对象
 * @throws {Error} - 如果在事务过程中发生错误，则抛出错误
 */
const createAndSaveMessage = async (senderId, recipientId, content, contentType, encryption = {}, clientMessageId = '', replyTo = '') => {
	const recipientOid = await resolveRecipientObjectId(recipientId)
	await assertUsersAreFriends(senderId, recipientOid)
	const peerId = recipientOid.toString()
	if (clientMessageId) {
		const existing = await MessageModel.findOne({ sender: senderId, clientMessageId })
		if (existing) {
			const conversation = await ConversationModel.findById(existing.conversationId).select('type members')
			if (conversation?.type !== 'private' || !idListHasUserId(conversation.members, peerId)) {
				throw new Error('客户端消息编号冲突')
			}
			return { message: existing, recipientPeerId: peerId }
		}
	}

	// 创建一个新的 MongoDB 会话
	const session = await mongoose.startSession()
	session.startTransaction()

	try {
		// 查找是否已有包含这两个成员的私聊会话
		let conversation = await ConversationModel.findOne({
			type: 'private',
			members: { $all: [senderId, peerId] },
		}).session(session) // 在会话内查找

		// 如果没有找到会话，则创建一个新的私聊会话
		if (!conversation) {
			conversation = new ConversationModel({
				type: 'private',
				members: [senderId, peerId],
			})
			// 在事务中保存新会话
			await conversation.save({ session })
		}
		const replyTargetId = await validateReplyTarget(replyTo, conversation._id, session)
		const requiresEncryption = conversation.encryptionMode === 'e2ee'
		if (requiresEncryption && String(process.env.E2EE_ENABLED || 'false').toLowerCase() !== 'true') {
			throw new Error('服务器已关闭端到端加密，当前会话暂不可发送')
		}
		if (requiresEncryption && (!encryption.encrypted || !encryption.nonce)) {
			throw new Error('当前会话要求发送端到端加密消息')
		}
		if (!requiresEncryption && encryption.encrypted) {
			throw new Error('当前会话尚未开启端到端加密')
		}

		// 创建一个新的消息
		const message = new MessageModel({
			conversationId: conversation._id,
			sender: senderId,
			content: content,
			contentType: contentType,
			clientMessageId,
			sequence: await nextMessageSequence(),
			replyTo: replyTargetId,
			encrypted: requiresEncryption,
			nonce: requiresEncryption ? encryption.nonce : '',
			encryptionAlgorithm: requiresEncryption ? 'nacl-box-v1' : '',
		})
		// 在当前事务中保存消息
		await message.save({ session })

		// 更新会话的最后一条消息和更新时间
		conversation.lastMessage = message._id
		conversation.updatedAt = new Date()
		// 在当前事务中保存会话
		await conversation.save({ session })

		// 提交事务
		await session.commitTransaction()
		session.endSession()

		return { message, recipientPeerId: peerId }
	} catch (error) {
		// 如果在事务过程中发生错误，则回滚事务
		await session.abortTransaction()
		session.endSession()
		console.error('Transaction failed:', error)
		throw error
	}
}

/**
 * 创建&&保存群聊消息
 * @param {String} senderId - 发送者ID
 * @param {String} groupId - 群组ID
 * @param {String} content - 消息内容
 * @param {String} contentType - 消息类型（例如 'text', 'image', 'file'）
 * @returns {Object} message - 保存后的消息对象
 * @throws {Error} - 如果在事务过程中发生错误，则抛出错误
 */
const createAndSaveGroupMessage = async (senderId, groupId, content, contentType, clientMessageId = '', replyTo = '', mentions = []) => {
	if (clientMessageId) {
		const existing = await MessageModel.findOne({ sender: senderId, clientMessageId })
		if (existing) {
			const conversation = await ConversationModel.findById(existing.conversationId).select('type group')
			if (conversation?.type !== 'group' || String(conversation.group) !== String(groupId)) {
				throw new Error('客户端消息编号冲突')
			}
			return existing
		}
	}
	const session = await mongoose.startSession()
	session.startTransaction()

	try {
		// 查找是否已有该群组的群聊会话
		let conversation = await ConversationModel.findOne({
			type: 'group',
			group: groupId,
		}).session(session)

		// 如果没有找到会话，则创建一个新的群聊会话
		if (!conversation) {
			conversation = new ConversationModel({
				type: 'group',
				group: groupId,
				members: [senderId], // 群聊成员可以根据群组信息填充
			})
			await conversation.save({ session })
		}

		// 检查发送者是否为该群组的成员
		const group = await GroupModel.findById(groupId).session(session)

		if (!group) {
			throw new Error('群组不存在')
		}

		if (!idListHasUserId(group.members, senderId)) {
			throw new Error('发送者不是该群组的成员')
		}
		const validMentions = contentType === 'text'
			? mentions.filter((id) => String(id) !== String(senderId) && idListHasUserId(group.members, id))
			: []
		// 群组成员是群聊权限的唯一来源，同时修复历史会话中未同步的成员列表
		conversation.members = group.members
		const replyTargetId = await validateReplyTarget(replyTo, conversation._id, session)

		// 创建新的消息
		const message = new MessageModel({
			conversationId: conversation._id,
			sender: senderId,
			content: content,
			contentType: contentType,
			clientMessageId,
			sequence: await nextMessageSequence(),
			replyTo: replyTargetId,
			mentions: validMentions,
		})
		// 在事务中保存消息
		await message.save({ session })

		// 更新会话的最后一条消息和更新时间
		conversation.lastMessage = message._id
		conversation.updatedAt = new Date()
		await conversation.save({ session })

		// 提交事务
		await session.commitTransaction()
		session.endSession()

		return message
	} catch (error) {
		// 回滚事务
		await session.abortTransaction()
		session.endSession()
		console.error('Transaction failed:', error)
		throw error
	}
}
/**
 * 获取会话中的聊天记录
 * @param {String} userId 用户ID
 * @param {String} conversationId 会话ID
 * @param {Number} limit 消息数量
 * @param {String} lastId 上一次请求返回的最后一条ID
 */
const getMessageList = async (userId, conversationId, limit, lastId) => {
	try {
		//查询当前用户是否在会话成员列表中
		const conversation = await ConversationModel.findById(conversationId)
		if (!conversation) {
			throw new Error('当前会话不存在')
		}
		if (conversation.type === 'group') {
			// 检查是否为该群组的成员
			const group = await GroupModel.findById(conversation.group)
			if (!group) {
				throw new Error('群组不存在')
			}
			if (!idListHasUserId(group.members, userId)) {
				throw new Error('当前成员不是该会话成员')
			}
		} else if (!idListHasUserId(conversation.members, userId)) {
			throw new Error('当前成员不是该会话成员')
		}

		// 构建消息查询条件
		const query = { conversationId, deletedFor: { $ne: userId } }
		const readState = await ConversationReadModel.findOne({ conversation: conversationId, user: userId })
		if (readState?.clearedAt) query.createdAt = { $gt: readState.clearedAt }

		if (lastId) {
			if (!mongoose.Types.ObjectId.isValid(lastId)) {
				throw new Error('无效的消息游标')
			}
			query._id = { $lt: new mongoose.Types.ObjectId(lastId) }
		}

		// 查询消息记录 按照消息ID倒序排列，获取最新的消息
		const messages = await MessageModel.find(query)
			.populate('sender', 'username userId avatar') 
			.populate({ path: 'replyTo', select: 'content contentType encrypted nonce encryptionAlgorithm recalledAt sender' })
			.sort({ _id: -1 })
			.limit(parseInt(limit))

		// 为每条消息添加 isMe 字段，判断是否是当前用户发送的消息
		const processedMessages = messages.map((message) => {
			const messageObj = message.toObject()
			messageObj.isMe = message.sender._id.toString() === userId
			// 送达记录仅对消息发送者可见，群成员之间不互相暴露设备送达行为。
			if (!messageObj.isMe) delete messageObj.deliveries
			if (messageObj.recalledAt) {
				messageObj.content = ''
				messageObj.contentType = 'text'
				messageObj.encrypted = false
				messageObj.nonce = ''
			}
			return messageObj
		})

		return {
			data: processedMessages.reverse(),
			nextLastId: processedMessages.length > 0 ? processedMessages[0]._id : null,
		}
	} catch (error) {
		console.error('Error getting messages:', error)
		throw error
	}
}

/**
 * 按全局消息序号补拉断线期间的可见消息。afterSequence 缺失时只建立当前基线，
 * 避免升级后的客户端首次连接把全部历史记录当成新消息。
 */
async function syncMessages(userId, afterSequence, requestedLimit = 200) {
	const limit = Math.min(500, Math.max(1, parseInt(requestedLimit || 200, 10)))
	if (afterSequence == null || afterSequence === '') {
		return { messages: [], cursor: String(await currentMessageSequence()), hasMore: false, initialized: true }
	}
	const cursor = Number(afterSequence)
	if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error('无效的同步游标')
	const [privateConversations, joinedGroups] = await Promise.all([
		ConversationModel.find({ type: 'private', members: userId }).select('_id type').lean(),
		GroupModel.find({ members: userId }).select('_id name').lean(),
	])
	const groupIds = joinedGroups.map(group => group._id)
	const groupConversations = groupIds.length
		? await ConversationModel.find({ type: 'group', group: { $in: groupIds } }).select('_id type group').lean()
		: []
	const conversations = [...privateConversations, ...groupConversations]
	const conversationIds = conversations.map(item => item._id)

	if (!conversationIds.length) {
		return { messages: [], cursor: String(cursor), hasMore: false, initialized: false }
	}

	const baseQuery = {
		conversationId: { $in: conversationIds },
		sequence: { $gt: 0 },
		deletedFor: { $ne: userId },
	}
	baseQuery.sequence.$gt = cursor
	const candidates = await MessageModel.find(baseQuery)
		.populate('sender', 'username userId avatar')
		.populate({ path: 'replyTo', select: 'content contentType encrypted nonce encryptionAlgorithm recalledAt sender' })
		.sort({ sequence: 1 })
		.limit(limit)

	const readStates = await ConversationReadModel.find({ user: userId, conversation: { $in: conversationIds } })
		.select('conversation clearedAt').lean()
	const clearedAtByConversation = new Map(readStates.map(item => [String(item.conversation), item.clearedAt]))
	const conversationById = new Map(conversations.map(item => [String(item._id), item]))
	const groupNameById = new Map(joinedGroups.map(item => [String(item._id), item.name]))

	const messages = candidates
		.filter(message => {
			const clearedAt = clearedAtByConversation.get(String(message.conversationId))
			return !clearedAt || new Date(message.createdAt) > new Date(clearedAt)
		})
		.map(message => {
			const item = message.toObject()
			const conversation = conversationById.get(String(message.conversationId))
			item.isMe = String(message.sender?._id || message.sender) === String(userId)
			if (!item.isMe) delete item.deliveries
			item.conversationType = conversation?.type || 'private'
			if (conversation?.type === 'group') {
				item.groupId = String(conversation.group)
				item.groupName = groupNameById.get(String(conversation.group)) || ''
			}
			if (item.recalledAt) {
				item.content = ''
				item.contentType = 'text'
				item.encrypted = false
				item.nonce = ''
			}
			return item
		})
	const nextCursor = candidates.length ? candidates[candidates.length - 1].sequence : cursor
	return {
		messages,
		cursor: String(nextCursor),
		hasMore: candidates.length === limit,
		initialized: false,
	}
}

async function acknowledgeDeliveredMessages(userId, messageIds) {
	const ids = [...new Set((Array.isArray(messageIds) ? messageIds : [])
		.filter(id => mongoose.Types.ObjectId.isValid(id)).map(String))].slice(0, 100)
	if (!ids.length) return []
	const messages = await MessageModel.find({
		_id: { $in: ids },
		sender: { $ne: userId },
	}).select('_id sender conversationId clientMessageId deliveries').lean()
	if (!messages.length) return { notifications: [], acknowledgedIds: ids }

	const conversationIds = [...new Set(messages.map(item => String(item.conversationId)))]
	const conversations = await ConversationModel.find({ _id: { $in: conversationIds } })
		.select('_id type members group').lean()
	const joinedGroupIds = new Set((await GroupModel.find({
		_id: { $in: conversations.filter(item => item.type === 'group').map(item => item.group) },
		members: userId,
	}).select('_id').lean()).map(item => String(item._id)))
	const allowedConversationIds = new Set(conversations.filter(item =>
		item.type === 'group'
			? joinedGroupIds.has(String(item.group))
			: idListHasUserId(item.members, userId)
	).map(item => String(item._id)))
	const allowed = messages.filter(item => allowedConversationIds.has(String(item.conversationId)))
	if (!allowed.length) return { notifications: [], acknowledgedIds: ids }

	const deliveredAt = new Date()
	const pending = allowed.filter(item => !(item.deliveries || []).some(delivery => String(delivery.user) === String(userId)))
	if (pending.length) {
	await MessageModel.updateMany(
		{ _id: { $in: pending.map(item => item._id) }, 'deliveries.user': { $ne: userId } },
		{ $push: { deliveries: { user: userId, deliveredAt } } }
	)
	}
	const bySender = new Map()
	pending.forEach(item => {
		const senderId = String(item.sender)
		const entries = bySender.get(senderId) || []
		entries.push({ messageId: String(item._id), clientMessageId: item.clientMessageId || '' })
		bySender.set(senderId, entries)
	})
	return {
		notifications: [...bySender.entries()].map(([senderId, entries]) => ({ senderId, entries, deliveredAt })),
		acknowledgedIds: ids,
	}
}

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function searchConversationMessages(userId, conversationId, options = {}) {
	if (!mongoose.Types.ObjectId.isValid(conversationId)) throw new Error('无效的会话ID')
	const conversation = await ConversationModel.findById(conversationId)
	if (!conversation) throw new Error('当前会话不存在')
	let allowed = idListHasUserId(conversation.members, userId)
	if (conversation.type === 'group') {
		const group = await GroupModel.findById(conversation.group).select('members')
		allowed = idListHasUserId(group?.members, userId)
	}
	if (!allowed) throw new Error('当前成员不是该会话成员')

	const limit = Math.min(50, Math.max(1, parseInt(options.limit || 30, 10)))
	const keyword = String(options.keyword || '').trim().slice(0, 100)
	const resourceType = String(options.resourceType || 'all')
	if (!['all', 'text', 'image', 'file', 'audio', 'video', 'link'].includes(resourceType)) throw new Error('消息类型无效')

	const query = { conversationId, deletedFor: { $ne: userId }, recalledAt: null }
	const readState = await ConversationReadModel.findOne({ conversation: conversationId, user: userId })
	if (readState?.clearedAt) query.createdAt = { $gt: readState.clearedAt }
	if (options.lastId) {
		if (!mongoose.Types.ObjectId.isValid(options.lastId)) throw new Error('无效的消息游标')
		query._id = { $lt: new mongoose.Types.ObjectId(options.lastId) }
	}
	if (resourceType === 'link') {
		query.contentType = 'text'
		query.encrypted = false
		query.content = /https?:\/\/[^\s]+/i
	} else if (resourceType !== 'all') {
		query.contentType = resourceType
	}
	if (keyword) {
		query.encrypted = false
		query.content = { $regex: escapeRegExp(keyword), $options: 'i' }
	}

	const messages = await MessageModel.find(query)
		.populate('sender', 'username userId avatar')
		.sort({ _id: -1 })
		.limit(limit)
		.lean()
	return {
		list: messages,
		nextLastId: messages.length === limit ? messages[messages.length - 1]._id : null,
	}
}

async function conversationRecipients(conversation) {
	if (conversation.type === 'group') {
		const group = await GroupModel.findById(conversation.group).select('members')
		return (group?.members || []).map(String)
	}
	return conversation.members.map(String)
}

const recallMessage = async (userId, messageId) => {
	if (!mongoose.Types.ObjectId.isValid(messageId)) throw new Error('消息不存在')
	const message = await MessageModel.findById(messageId)
	if (!message) throw new Error('消息不存在')
	if (message.contentType === 'system') throw new Error('系统消息不能撤回')
	if (String(message.sender) !== String(userId)) throw new Error('只能撤回自己发送的消息')
	if (message.recalledAt) throw new Error('消息已经撤回')
	const recallWindowMs = Math.max(1, Number(process.env.MESSAGE_RECALL_WINDOW_SECONDS || 120)) * 1000
	if (Date.now() - new Date(message.createdAt).getTime() > recallWindowMs) throw new Error('消息已超过可撤回时间')
	message.recalledAt = new Date()
	message.recalledBy = userId
	message.pinnedAt = null
	message.pinnedBy = null
	await message.save()
	const conversation = await ConversationModel.findById(message.conversationId)
	return { message, recipientIds: conversation ? await conversationRecipients(conversation) : [userId] }
}

const deleteMessageForUser = async (userId, messageId) => {
	if (!mongoose.Types.ObjectId.isValid(messageId)) throw new Error('消息不存在')
	const message = await MessageModel.findById(messageId)
	if (!message) throw new Error('消息不存在')
	const conversation = await ConversationModel.findById(message.conversationId)
	if (!conversation) throw new Error('会话不存在')
	let allowed = idListHasUserId(conversation.members, userId)
	if (conversation.type === 'group') {
		const group = await GroupModel.findById(conversation.group).select('members')
		allowed = idListHasUserId(group?.members, userId)
	}
	if (!allowed) throw new Error('当前成员不是该会话成员')
	await MessageModel.findByIdAndUpdate(messageId, { $addToSet: { deletedFor: userId } })
}

const deleteMessagesForUser = async (userId, messageIds) => {
	const ids = [...new Set((Array.isArray(messageIds) ? messageIds : []).map(String))]
	if (!ids.length) throw new Error('请选择要删除的消息')
	if (ids.length > 50) throw new Error('一次最多删除50条消息')
	if (ids.some((id) => !mongoose.Types.ObjectId.isValid(id))) throw new Error('消息ID无效')

	const messages = await MessageModel.find({ _id: { $in: ids } }).select('_id conversationId')
	if (messages.length !== ids.length) throw new Error('部分消息不存在')
	const conversationIds = [...new Set(messages.map((message) => String(message.conversationId)))]
	const conversations = await ConversationModel.find({ _id: { $in: conversationIds } }).select('type members group')
	if (conversations.length !== conversationIds.length) throw new Error('部分会话不存在')

	for (const conversation of conversations) {
		let allowed = idListHasUserId(conversation.members, userId)
		if (conversation.type === 'group') {
			const group = await GroupModel.findById(conversation.group).select('members')
			allowed = idListHasUserId(group?.members, userId)
		}
		if (!allowed) throw new Error('当前成员不是该会话成员')
	}

	const result = await MessageModel.updateMany({ _id: { $in: ids } }, { $addToSet: { deletedFor: userId } })
	return { deletedCount: result.modifiedCount }
}

const allowedReactions = ['👍', '❤️', '😂', '😮', '😢', '👏']

const toggleMessageReaction = async (userId, messageId, emoji) => {
	if (!mongoose.Types.ObjectId.isValid(messageId)) throw new Error('消息不存在')
	if (!allowedReactions.includes(emoji)) throw new Error('暂不支持这个表情')
	const message = await MessageModel.findById(messageId)
	if (!message || message.recalledAt) throw new Error('消息不存在或已撤回')
	if (message.contentType === 'system') throw new Error('系统消息不能添加回应')
	const conversation = await ConversationModel.findById(message.conversationId)
	if (!conversation) throw new Error('会话不存在')
	let allowed = idListHasUserId(conversation.members, userId)
	if (conversation.type === 'group') {
		const group = await GroupModel.findById(conversation.group).select('members')
		allowed = idListHasUserId(group?.members, userId)
	}
	if (!allowed) throw new Error('当前成员不是该会话成员')

	let reaction = message.reactions.find((item) => item.emoji === emoji)
	let active
	if (!reaction) {
		message.reactions.push({ emoji, users: [userId] })
		active = true
	} else {
		const index = reaction.users.findIndex((id) => String(id) === String(userId))
		if (index >= 0) {
			reaction.users.splice(index, 1)
			active = false
		} else {
			reaction.users.push(userId)
			active = true
		}
	}
	message.reactions = message.reactions.filter((item) => item.users.length > 0)
	await message.save()
	return { message, recipientIds: await conversationRecipients(conversation), active }
}

async function assertConversationMember(userId, conversation) {
	if (!conversation) throw new Error('会话不存在')
	if (conversation.type === 'group') {
		const group = await GroupModel.findById(conversation.group).select('members owner admins')
		if (!group || !idListHasUserId(group.members, userId)) throw new Error('当前成员不是该会话成员')
		return group
	}
	if (!idListHasUserId(conversation.members, userId)) throw new Error('当前成员不是该会话成员')
	return null
}

const getPinnedMessage = async (userId, conversationId) => {
	if (!mongoose.Types.ObjectId.isValid(conversationId)) throw new Error('无效的会话ID')
	const conversation = await ConversationModel.findById(conversationId)
	await assertConversationMember(userId, conversation)
	if (conversation.type !== 'group') return null
	return MessageModel.findOne({ conversationId, pinnedAt: { $ne: null }, recalledAt: null })
		.populate('sender', 'username userId avatar')
		.populate('pinnedBy', 'username userId avatar')
		.sort({ pinnedAt: -1 })
}

const setPinnedMessage = async (userId, messageId, pinned) => {
	if (!mongoose.Types.ObjectId.isValid(messageId)) throw new Error('消息不存在')
	const message = await MessageModel.findById(messageId)
	if (!message || message.recalledAt || message.contentType === 'system') throw new Error('这条消息不能置顶')
	const conversation = await ConversationModel.findById(message.conversationId)
	const group = await assertConversationMember(userId, conversation)
	if (!group) throw new Error('只有群聊消息可以置顶')
	const canManage = String(group.owner) === String(userId) || idListHasUserId(group.admins, userId)
	if (!canManage) throw new Error('只有群主或管理员可以置顶消息')

	if (pinned) {
		await MessageModel.updateMany(
			{ conversationId: conversation._id, pinnedAt: { $ne: null }, _id: { $ne: message._id } },
			{ $set: { pinnedAt: null, pinnedBy: null } }
		)
		message.pinnedAt = new Date()
		message.pinnedBy = userId
	} else {
		message.pinnedAt = null
		message.pinnedBy = null
	}
	await message.save()
	await message.populate([{ path: 'sender', select: 'username userId avatar' }, { path: 'pinnedBy', select: 'username userId avatar' }])
	return { message, pinned: Boolean(pinned), recipientIds: group.members.map(String), groupId: String(group._id) }
}

const editMessage = async (userId, messageId, content) => {
	if (!mongoose.Types.ObjectId.isValid(messageId)) throw new Error('消息不存在')
	const nextContent = String(content || '').trim()
	if (!nextContent) throw new Error('消息内容不能为空')
	const maxLength = Math.max(1, parseInt(process.env.WS_MAX_CONTENT_LENGTH || '8000', 10))
	if (nextContent.length > maxLength) throw new Error(`消息内容不能超过${maxLength}字`)

	const message = await MessageModel.findById(messageId)
	if (!message || message.recalledAt) throw new Error('消息不存在或已撤回')
	if (String(message.sender) !== String(userId)) throw new Error('只能编辑自己发送的消息')
	if (message.contentType !== 'text' || message.encrypted) throw new Error('这条消息不支持编辑')
	const editWindowMs = Math.max(1, Number(process.env.MESSAGE_EDIT_WINDOW_SECONDS || 900)) * 1000
	if (Date.now() - new Date(message.createdAt).getTime() > editWindowMs) throw new Error('消息已超过可编辑时间')

	const conversation = await ConversationModel.findById(message.conversationId)
	await assertConversationMember(userId, conversation)
	message.content = nextContent
	message.editedAt = new Date()
	await message.save()
	return { message, recipientIds: await conversationRecipients(conversation) }
}

const setMessageFavorite = async (userId, messageId, favorite) => {
	if (!mongoose.Types.ObjectId.isValid(messageId)) throw new Error('消息不存在')
	const message = await MessageModel.findById(messageId)
	if (!message || message.contentType === 'system') throw new Error('这条消息不能收藏')
	if (message.deletedFor.some(id => String(id) === String(userId))) throw new Error('消息不存在')
	const conversation = await ConversationModel.findById(message.conversationId)
	await assertConversationMember(userId, conversation)
	if (favorite) {
		await MessageFavoriteModel.updateOne(
			{ user: userId, message: messageId },
			{ $setOnInsert: { user: userId, message: messageId } },
			{ upsert: true }
		)
	} else {
		await MessageFavoriteModel.deleteOne({ user: userId, message: messageId })
	}
	return { favorite: Boolean(favorite) }
}

const getMessageFavorites = async (userId, page = 1, limit = 30) => {
	const safeLimit = Math.min(50, Math.max(1, parseInt(limit || 30, 10)))
	const safePage = Math.max(1, parseInt(page || 1, 10))
	const favorites = await MessageFavoriteModel.find({ user: userId })
		.populate({ path: 'message', populate: { path: 'sender', select: 'username userId avatar' } })
		.sort({ createdAt: -1 })
		.skip((safePage - 1) * safeLimit)
		.limit(safeLimit)
		.lean()
	const conversationIds = [...new Set(favorites.map(item => String(item.message?.conversationId || '')).filter(Boolean))]
	const conversations = await ConversationModel.find({ _id: { $in: conversationIds } })
		.populate('members', 'username avatar')
		.populate('group', 'name avatar members')
		.lean()
	const byId = new Map(conversations.map(item => [String(item._id), item]))
	const list = favorites.flatMap(item => {
		const message = item.message
		const conversation = byId.get(String(message?.conversationId || ''))
		if (!message || !conversation || message.deletedFor?.some(id => String(id) === String(userId))) return []
		if (conversation.type === 'group' && !idListHasUserId(conversation.group?.members, userId)) return []
		if (conversation.type === 'private' && !idListHasUserId(conversation.members, userId)) return []
		const peer = conversation.type === 'private' ? conversation.members.find(member => String(member._id) !== String(userId)) : null
		return [{
			_id: item._id,
			createdAt: item.createdAt,
			message,
			conversation: {
				_id: conversation._id,
				type: conversation.type,
				targetId: conversation.type === 'group' ? conversation.group?._id : peer?._id,
				name: conversation.type === 'group' ? conversation.group?.name || '群聊' : peer?.username || '对话',
				avatar: conversation.type === 'group' ? conversation.group?.avatar || '' : peer?.avatar || '',
			},
		}]
	})
	return { list, page: safePage, limit: safeLimit, total: await MessageFavoriteModel.countDocuments({ user: userId }) }
}

module.exports = {
	createAndSaveMessage,
	createAndSaveGroupMessage,
	getMessageList,
	syncMessages,
	acknowledgeDeliveredMessages,
	searchConversationMessages,
	recallMessage,
	deleteMessageForUser,
	deleteMessagesForUser,
	toggleMessageReaction,
	getPinnedMessage,
	setPinnedMessage,
	editMessage,
	setMessageFavorite,
	getMessageFavorites,
}
