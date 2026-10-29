const {
	createAndSaveMessage,
	createAndSaveGroupMessage,
	getMessageList,
	syncMessages: syncMessagesService,
	acknowledgeDeliveredMessages,
	searchConversationMessages,
	recallMessage: recallMessageService,
	deleteMessageForUser,
	deleteMessagesForUser,
	toggleMessageReaction,
	getPinnedMessage,
	setPinnedMessage,
	editMessage: editMessageService,
	setMessageFavorite,
	getMessageFavorites,
} = require('../services/messageService')
const userController = require('./userController')
const { ConversationModel, MessageModel, GroupModel } = require('../model/index')
const { MESSAGE_TYPE } = require('../enum/message')
const { validateChatPayload } = require('../utils/wsMessageValidation')
const realtimeService = require('../services/realtimeService')

const MAX_WS_PAYLOAD_BYTES = 65536

function wsClientErrorMessage(err) {
	if (!(err instanceof Error) || !err.message) return '消息发送失败'
	const m = err.message
	if (m.length > 200 || /MongoNetworkError|Topology|ECONNREFUSED|E11000|Cast to ObjectId failed/i.test(m)) {
		return '消息发送失败'
	}
	return m
}

/**
 * 包装消息，添加消息类型
 * @param {String} type - 消息类型
 * @param {Object} data - 消息数据
 * @param {String} event - 事件类型 / 前端使用
 * @returns {Object} - 包装后的消息
 */
function wrapMessage(type, data) {
	return {
		type,
		data,
	}
}

/**
 * 处理接收到的消息
 * @param {Object} ws - 当前 WebSocket 连接
 * @param {Object} req - 请求对象，包含用户信息
 * @param {String} msg - 接收到的消息字符串
 */
async function handleIncomingMessage(ws, req, msg) {
	const raw = Buffer.isBuffer(msg) ? msg.toString('utf8') : String(msg)
	if (Buffer.byteLength(raw, 'utf8') > MAX_WS_PAYLOAD_BYTES) {
		ws.send(
			JSON.stringify(wrapMessage(MESSAGE_TYPE.MESSAGE_SEND_ERROR, { error: '消息过大或格式无效' }))
		)
		return
	}

	let parsed
	try {
		parsed = JSON.parse(raw)
	} catch {
		ws.send(JSON.stringify(wrapMessage(MESSAGE_TYPE.MESSAGE_SEND_ERROR, { error: '消息格式无效' })))
		return
	}

	if (parsed?.type === MESSAGE_TYPE.TYPING) {
		await forwardTypingIndicator(parsed, senderIdFromRequest(req))
		return
	}
	if (parsed?.type === MESSAGE_TYPE.MESSAGE_DELIVERY_ACK) {
		const result = await acknowledgeDeliveredMessages(req.user.id, parsed.messageIds)
		if (ws.readyState === ws.OPEN) {
			ws.send(JSON.stringify(wrapMessage(MESSAGE_TYPE.MESSAGE_DELIVERY_ACK_SUCCESS, { messageIds: result.acknowledgedIds })))
		}
		result.notifications.forEach(item => realtimeService.pushToUser(item.senderId, MESSAGE_TYPE.MESSAGE_DELIVERED, {
			messages: item.entries,
			userId: req.user.id,
			deliveredAt: item.deliveredAt,
		}))
		return
	}

	const validated = validateChatPayload(parsed)
	if (!validated.ok) {
		ws.send(JSON.stringify(wrapMessage(MESSAGE_TYPE.MESSAGE_SEND_ERROR, { error: validated.error })))
		return
	}

	const { recipientId, content, contentType, conversationType, groupId, encrypted, nonce, encryptionAlgorithm, clientMessageId, replyTo, mentions } = validated.payload
	const senderId = req.user.id

	try {
		let savedMessage = null
		if (conversationType === 'private') {
			const { message, recipientPeerId } = await createAndSaveMessage(
				senderId,
				recipientId,
				content,
				contentType,
				{ encrypted, nonce, encryptionAlgorithm },
				clientMessageId,
				replyTo
			)
			savedMessage = message
			await savedMessage.populate([{ path: 'replyTo', select: 'content contentType encrypted nonce encryptionAlgorithm recalledAt sender' }, { path: 'sender', select: 'username avatar userId' }])
			const outgoingMessage = { ...message.toObject(), clientMessageId, conversationType: 'private' }
			realtimeService.pushToUsers([recipientPeerId], MESSAGE_TYPE.USER_MESSAGE, outgoingMessage)
		} else if (conversationType === 'group') {
			savedMessage = await createAndSaveGroupMessage(senderId, groupId, content, contentType, clientMessageId, replyTo, mentions)
			await savedMessage.populate([{ path: 'replyTo', select: 'content contentType encrypted nonce encryptionAlgorithm recalledAt sender' }, { path: 'sender', select: 'username avatar userId' }])
			const group = await GroupModel.findById(groupId).populate('members')
			const outgoingMessage = { ...savedMessage.toObject(), clientMessageId, conversationType: 'group', groupId, groupName: group.name }

			// 过滤掉发送者自己
			const recipientIds = group.members
				.map((m) => m._id.toString())
				.filter((id) => id !== String(senderId))

			// 发送消息给其他群组成员
			realtimeService.pushToUsers(recipientIds, MESSAGE_TYPE.GROUP_MESSAGE, outgoingMessage)
		}

		// 发送确认消息给发送者
		if (['private', 'group'].includes(conversationType)) {
			ws.send(JSON.stringify(wrapMessage(MESSAGE_TYPE.MESSAGE_SENT_CONFIRMATION, {
				...savedMessage.toObject(),
				clientMessageId,
			})))
		}
	} catch (error) {
		console.error('Error handling message:', error)
		ws.send(
			JSON.stringify(
				wrapMessage(MESSAGE_TYPE.MESSAGE_SEND_ERROR, { error: wsClientErrorMessage(error), clientMessageId })
			)
		)
	}
}

function senderIdFromRequest(req) {
	return String(req.user.id)
}

async function forwardTypingIndicator(payload, senderId) {
	const active = payload.active === true
	if (payload.conversationType === 'private') {
		const recipientId = String(payload.recipientId || '')
		if (!recipientId || recipientId === senderId) return
		const conversation = await ConversationModel.findOne({ type: 'private', members: { $all: [senderId, recipientId] } }).select('_id members')
		if (!conversation) return
		realtimeService.pushToUsers([recipientId], MESSAGE_TYPE.TYPING, {
			conversationId: conversation._id,
			conversationType: 'private',
			senderId,
			active,
		})
		return
	}

	if (payload.conversationType === 'group') {
		const groupId = String(payload.groupId || '')
		const group = await GroupModel.findOne({ _id: groupId, members: senderId }).select('members')
		if (!group) return
		const recipientIds = group.members.map(String).filter((id) => id !== senderId)
		realtimeService.pushToUsers(recipientIds, MESSAGE_TYPE.TYPING, {
			groupId,
			conversationType: 'group',
			senderId,
			active,
		})
	}
}

/**
 * 获取用户的好友列表，并通知他们
 * @param {String} userId
 * @param {String} status
 * @param {Map<String, Set>} users - 存放所有在线用户的 WebSocket 连接
 */
async function notifyFriendsStatus(userId, status, users) {
	try {
		const friends = await userController.getFriends(userId)
		friends.forEach((friend) => {
			const connections = users.get(friend.id)
			if (!connections) return
			connections.forEach((friendWs) => {
				if (friendWs && friendWs.readyState === friendWs.OPEN) {
					friendWs.send(
						JSON.stringify(wrapMessage(MESSAGE_TYPE.FRIEND_STATUS_CHANGE, { userId, status }))
					)
				}
			})
		})
	} catch (err) {
		console.error('Error getting friends:', err)
	}
}

/**
 * 获取会话中的聊天记录
 * @param {Object} req
 * @param {Object} res
 */
const getConversationMessageList = async (req, res) => {
	try {
		const { conversationId, limit = 10, lastId = '' } = req.query
		const userId = req.user.id
		const result = await getMessageList(userId, conversationId, limit, lastId)
		res.handleSuccess(result)
	} catch (error) {
		res.handleError(error.message)
	}
}

const syncMessages = async (req, res) => {
	try {
		const result = await syncMessagesService(req.user.id, req.query.afterSequence, req.query.limit)
		res.handleSuccess(result)
	} catch (error) {
		res.handleError(error.message)
	}
}

const searchMessages = async (req, res) => {
	try {
		const { conversationId, keyword = '', resourceType = 'all', limit = 30, lastId = '' } = req.query
		const result = await searchConversationMessages(req.user.id, conversationId, { keyword, resourceType, limit, lastId })
		res.handleSuccess(result)
	} catch (error) { res.handleError(error.message) }
}

const recallMessage = async (req, res) => {
	try {
		const result = await recallMessageService(req.user.id, req.body.messageId)
		realtimeService.pushToUsers(result.recipientIds, MESSAGE_TYPE.MESSAGE_RECALLED, {
			messageId: result.message._id,
			conversationId: result.message.conversationId,
			recalledAt: result.message.recalledAt,
			recalledBy: req.user.id,
		})
		res.handleSuccess(result.message)
	} catch (error) { res.handleError(error.message) }
}

const deleteMessageForMe = async (req, res) => {
	try {
		await deleteMessageForUser(req.user.id, req.body.messageId)
		res.handleSuccess()
	} catch (error) { res.handleError(error.message) }
}

const deleteMessagesForMe = async (req, res) => {
	try {
		const result = await deleteMessagesForUser(req.user.id, req.body.messageIds)
		res.handleSuccess(result, '消息已删除')
	} catch (error) { res.handleError(error.message) }
}

const reactToMessage = async (req, res) => {
	try {
		const result = await toggleMessageReaction(req.user.id, req.body.messageId, req.body.emoji)
		const reactions = result.message.reactions.map((item) => ({ emoji: item.emoji, users: item.users.map(String) }))
		realtimeService.pushToUsers(result.recipientIds, MESSAGE_TYPE.MESSAGE_REACTION, {
			messageId: result.message._id,
			conversationId: result.message.conversationId,
			reactions,
			userId: req.user.id,
			emoji: req.body.emoji,
			active: result.active,
		})
		res.handleSuccess({ reactions, active: result.active })
	} catch (error) { res.handleError(error.message) }
}

const getConversationPinnedMessage = async (req, res) => {
	try {
		const message = await getPinnedMessage(req.user.id, req.query.conversationId)
		res.handleSuccess(message)
	} catch (error) { res.handleError(error.message) }
}

const pinMessage = async (req, res) => {
	try {
		const result = await setPinnedMessage(req.user.id, req.body.messageId, req.body.pinned === true)
		realtimeService.pushToUsers(result.recipientIds, 'message_pin_changed', {
			conversationId: result.message.conversationId,
			groupId: result.groupId,
			pinned: result.pinned,
			message: result.pinned ? result.message.toObject() : null,
			messageId: result.message._id,
			changedBy: req.user.id,
		})
		res.handleSuccess({ pinned: result.pinned, message: result.pinned ? result.message : null })
	} catch (error) { res.handleError(error.message) }
}

const editMessage = async (req, res) => {
	try {
		const result = await editMessageService(req.user.id, req.body.messageId, req.body.content)
		realtimeService.pushToUsers(result.recipientIds, 'message_edited', {
			messageId: result.message._id,
			conversationId: result.message.conversationId,
			content: result.message.content,
			editedAt: result.message.editedAt,
		})
		res.handleSuccess(result.message, '消息已编辑')
	} catch (error) { res.handleError(error.message) }
}

const favoriteMessage = async (req, res) => {
	try {
		const favorite = req.body.favorite === true
		res.handleSuccess(await setMessageFavorite(req.user.id, req.body.messageId, favorite), favorite ? '已收藏' : '已取消收藏')
	} catch (error) { res.handleError(error.message) }
}

const messageFavorites = async (req, res) => {
	try { res.handleSuccess(await getMessageFavorites(req.user.id, req.query.page, req.query.limit)) }
	catch (error) { res.handleError(error.message) }
}

module.exports = {
	handleIncomingMessage,
	notifyFriendsStatus,
	getConversationMessageList,
	syncMessages,
	searchMessages,
	recallMessage,
	deleteMessageForMe,
	deleteMessagesForMe,
	reactToMessage,
	getConversationPinnedMessage,
	pinMessage,
	editMessage,
	favoriteMessage,
	messageFavorites,
}
