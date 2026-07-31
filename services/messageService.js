const mongoose = require('mongoose')
const { ConversationModel, MessageModel, GroupModel, UserModel, ConversationReadModel } = require('../model/index')

function idListHasUserId(list, userId) {
	if (userId == null || !list || !list.length) return false
	const uid = String(userId)
	return list.some((item) => String(item) === uid)
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
const createAndSaveGroupMessage = async (senderId, groupId, content, contentType, clientMessageId = '', replyTo = '') => {
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
			replyTo: replyTargetId,
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
	if (String(message.sender) !== String(userId)) throw new Error('只能撤回自己发送的消息')
	if (message.recalledAt) throw new Error('消息已经撤回')
	const recallWindowMs = Math.max(1, Number(process.env.MESSAGE_RECALL_WINDOW_SECONDS || 120)) * 1000
	if (Date.now() - new Date(message.createdAt).getTime() > recallWindowMs) throw new Error('消息已超过可撤回时间')
	message.recalledAt = new Date()
	message.recalledBy = userId
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

const allowedReactions = ['👍', '❤️', '😂', '😮', '😢', '👏']

const toggleMessageReaction = async (userId, messageId, emoji) => {
	if (!mongoose.Types.ObjectId.isValid(messageId)) throw new Error('消息不存在')
	if (!allowedReactions.includes(emoji)) throw new Error('暂不支持这个表情')
	const message = await MessageModel.findById(messageId)
	if (!message || message.recalledAt) throw new Error('消息不存在或已撤回')
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

module.exports = {
	createAndSaveMessage,
	createAndSaveGroupMessage,
	getMessageList,
	recallMessage,
	deleteMessageForUser,
	toggleMessageReaction,
}
