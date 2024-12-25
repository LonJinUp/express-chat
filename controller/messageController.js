const { createAndSaveMessage, createAndSaveGroupMessage, getMessageList } = require('../services/messageService')
const userController = require('./userController')
const { ConversationModel, MessageModel, GroupModel } = require('../model/index')
const { MESSAGE_TYPE } = require('../enum/message')

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
 * @param {Object} users - 当前已连接的用户字典
 */
async function handleIncomingMessage(ws, req, msg, users) {
	const { recipientId, content, contentType, conversationType, groupId } = JSON.parse(msg)
	const senderId = req.user.id

	try {
		let savedMessage = null
		if (conversationType === 'private') {
			savedMessage = await createAndSaveMessage(senderId, recipientId, content, contentType)
			// 发送消息给接收者
			broadcastMessage([recipientId], wrapMessage(MESSAGE_TYPE.USER_MESSAGE, savedMessage), users)
		} else if (conversationType === 'group') {
			savedMessage = await createAndSaveGroupMessage(senderId, groupId, content, contentType)
			const group = await GroupModel.findById(groupId).populate('members')

			// 过滤掉发送者自己
			const recipientIds = group.members.map((m) => m._id.toString()).filter((id) => id !== senderId)

			// 发送消息给其他群组成员
			broadcastMessage(recipientIds, wrapMessage(MESSAGE_TYPE.GROUP_MESSAGE, savedMessage), users)
		}

		// 发送确认消息给发送者
		if (['private', 'group'].includes(conversationType)) {
			ws.send(JSON.stringify(wrapMessage(MESSAGE_TYPE.MESSAGE_SENT_CONFIRMATION, savedMessage)))
		}
	} catch (error) {
		console.error('Error handling message:', error)
		ws.send(JSON.stringify(wrapMessage(MESSAGE_TYPE.MESSAGE_SEND_ERROR, { error: error.message })))
	}
}

/**
 * 广播消息给指定的用户
 * @param {Array} userIds - 需要广播的用户ID数组
 * @param {Object} message - 要广播的消息
 * @param {Object} users - 已连接的用户字典
 */
function broadcastMessage(userIds, message, users) {
	userIds.forEach((userId) => {
		const client = users[userId]
		if (client && client.readyState === client.OPEN) {
			client.send(JSON.stringify(message))
		}
	})
}

/**
 * 获取用户的好友列表，并通知他们
 * @param {String} userId
 * @param {String} status
 * @param {Object} users - 存放所有在线用户的 WebSocket 连接
 */
async function notifyFriendsStatus(userId, status, users) {
	try {
		const friends = await userController.getFriends(userId)
		friends.forEach((friend) => {
			const friendWs = users[friend.id]
			if (friendWs) {
				friendWs.send(JSON.stringify(wrapMessage(MESSAGE_TYPE.FRIEND_STATUS_CHANGE, { userId, status })))
			}
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

module.exports = {
	handleIncomingMessage,
	notifyFriendsStatus,
	getConversationMessageList,
}
