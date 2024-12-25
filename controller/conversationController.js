const conversationService = require('../services/conversationService')

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
		await conversationService.markConversationAsRead(conversationId, userId)
		res.handleSuccess(null, '标记已读成功')
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
		const conversationId = await conversationService.findConversationByTypeAndId(type, id)
		res.handleSuccess(conversationId)
	} catch (error) {
		res.handleError(error.message)
	}
}

module.exports = {
	getUserConversationList,
	markAsRead,
	findConversationByTypeAndId,
}
