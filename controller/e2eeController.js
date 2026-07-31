const e2eeService = require('../services/e2eeService')
const realtimeService = require('../services/realtimeService')
const { MESSAGE_TYPE } = require('../enum/message')

exports.getStatus = async (req, res) => {
	try { res.handleSuccess(await e2eeService.getStatus(req.user.id, req.query.peerId)) }
	catch (error) { res.handleError(error.message) }
}
exports.registerPublicKey = async (req, res) => {
	try {
		const user = await e2eeService.registerPublicKey(req.user.id, req.body.publicKey)
		realtimeService.pushToUsers(user.friends, MESSAGE_TYPE.E2EE_KEY_READY, {
			userId: req.user.id,
		})
		res.handleSuccess()
	}
	catch (error) { res.handleError(error.message) }
}
exports.getKeyBackup = async (req, res) => {
	try { res.handleSuccess(await e2eeService.getKeyBackup(req.user.id)) }
	catch (error) { res.handleError(error.message) }
}
exports.saveKeyBackup = async (req, res) => {
	try { res.handleSuccess(await e2eeService.saveKeyBackup(req.user.id, req.body)) }
	catch (error) { res.handleError(error.message) }
}
exports.resetKey = async (req, res) => {
	try {
		if (req.body.confirmation !== 'RESET_E2EE_KEY') throw new Error('请确认重置加密密钥')
		const conversations = await e2eeService.resetKey(req.user.id, req.body.publicKey)
		conversations.forEach((conversation) => {
			realtimeService.pushToUsers(conversation.members, MESSAGE_TYPE.E2EE_MODE_CHANGED, {
				conversationId: conversation._id,
				encryptionMode: 'plaintext',
				changedBy: req.user.id,
				members: conversation.members,
				reason: 'key_reset',
			})
		})
		res.handleSuccess({ disabledConversations: conversations.length }, '加密密钥已重置')
	} catch (error) { res.handleError(error.message) }
}
exports.setConversationMode = async (req, res) => {
	try {
		const conversation = await e2eeService.setConversationMode(
			req.user.id,
			req.body.peerId,
			req.body.enabled === true
		)
		realtimeService.pushToUsers(conversation.members, MESSAGE_TYPE.E2EE_MODE_CHANGED, {
			conversationId: conversation._id,
			encryptionMode: conversation.encryptionMode,
			changedBy: req.user.id,
			members: conversation.members,
		})
		res.handleSuccess(conversation)
	}
	catch (error) { res.handleError(error.message) }
}
