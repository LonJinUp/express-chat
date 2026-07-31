const conversationService = require('../services/conversationService')
const realtimeService = require('../services/realtimeService')

/**
 * 获取当前用户的最近聊天会话
 * @param {Object} req
 * @param {Object} res
 */
const getUserConversationList = async (req, res) => {
	try {
		const { type = '', page = 1, limit = 10 } = req.query
		const userId = req.user.id
		const result = await conversationService.getUserConversations(userId, type, page, limit)
		res.handleSuccess(result)
	} catch (error) {
		console.log(error)
		res.handleError(error.message)
	}
}

/**
 * 标记会话为已读
 * @param {Object} req
 * @param {Object} res
 */
const markAsRead = async (req, res) => {
	try {
		const { conversationId } = req.body
		const userId = req.user.id
		const result = await conversationService.markConversationAsRead(conversationId, userId)
		realtimeService.pushToUsers(result.recipientIds, 'conversation_read', {
			conversationId,
			userId,
			readAt: result.readAt,
		})
		res.handleSuccess({ readAt: result.readAt }, '标记已读成功')
	} catch (error) {
		res.handleError(error.message)
	}
}

const getConversationReadStatus = async (req, res) => {
	try {
		const result = await conversationService.getConversationReadStatus(req.query.conversationId, req.user.id)
		res.handleSuccess(result)
	} catch (error) { res.handleError(error.message) }
}

const clearConversationHistory = async (req, res) => {
	try {
		const { conversationId } = req.body
		await conversationService.clearConversationHistory(conversationId, req.user.id)
		res.handleSuccess(null, '聊天记录已清空')
	} catch (error) {
		res.handleError(error.message)
	}
}

const updateConversationPreferences = async (req, res) => {
	try {
		const result = await conversationService.updateConversationPreferences(req.body, req.user.id)
		res.handleSuccess(result, '会话设置已更新')
	} catch (error) {
		res.handleError(error.message)
	}
}

/**
 * 根据会话类型和ID查找历史会话
 * @param {Object} req
 * @param {Object} res
 */
const findConversationByTypeAndId = async (req, res) => {
	try {
		const { type, id } = req.query
		const conversationId = await conversationService.findConversationByTypeAndId(type, id, req.user.id)
		res.handleSuccess(conversationId)
	} catch (error) {
		res.handleError(error.message)
	}
}

module.exports = {
	getUserConversationList,
	markAsRead,
	getConversationReadStatus,
	clearConversationHistory,
	updateConversationPreferences,
	findConversationByTypeAndId,
}
