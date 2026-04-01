const mongoose = require('mongoose')
const { ConversationModel, MessageModel, GroupModel, UserModel } = require('../model/index')

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
	const sender = await UserModel.findById(senderId).select('friends')
	if (!sender) {
		throw new Error('用户不存在')
	}
	const ok = sender.friends.some((fid) => fid.equals(recipientOid))
	if (!ok) {
		throw new Error('仅可向好友发送私聊消息')
	}
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
const createAndSaveMessage = async (senderId, recipientId, content, contentType) => {
	const recipientOid = await resolveRecipientObjectId(recipientId)
	await assertUsersAreFriends(senderId, recipientOid)
	const peerId = recipientOid.toString()

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

		// 创建一个新的消息
		const message = new MessageModel({
			conversationId: conversation._id,
			sender: senderId,
			content: content,
			contentType: contentType,
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
const createAndSaveGroupMessage = async (senderId, groupId, content, contentType) => {
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

		// 创建新的消息
		const message = new MessageModel({
			conversationId: conversation._id,
			sender: senderId,
			content: content,
			contentType: contentType,
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
		}
		const isMember = idListHasUserId(conversation.members, userId)
		if (!isMember) {
			throw new Error('当前成员不是该会话成员')
		}

		// 构建消息查询条件
		const query = { conversationId }

		if (lastId) {
			if (!mongoose.Types.ObjectId.isValid(lastId)) {
				throw new Error('无效的消息游标')
			}
			query._id = { $lt: new mongoose.Types.ObjectId(lastId) }
		}

		// 查询消息记录 按照消息ID倒序排列，获取最新的消息
		const messages = await MessageModel.find(query)
			.populate('sender', 'username userId avatar') 
			.sort({ _id: -1 })
			.limit(parseInt(limit))

		// 为每条消息添加 isMe 字段，判断是否是当前用户发送的消息
		const processedMessages = messages.map((message) => {
			const messageObj = message.toObject()
			messageObj.isMe = message.sender._id.toString() === userId
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

module.exports = { createAndSaveMessage, createAndSaveGroupMessage, getMessageList }
