const mongoose = require('mongoose')
const { MessageReportModel, MessageModel, ConversationModel, GroupModel } = require('../model')

const reasons = new Set(['spam', 'abuse', 'fraud', 'explicit', 'other'])

async function createMessageReport(userId, input) {
	if (!mongoose.Types.ObjectId.isValid(input.messageId)) throw new Error('消息不存在')
	if (!reasons.has(input.reason)) throw new Error('请选择举报原因')
	const detail = String(input.detail || '').trim().slice(0, 500)
	const message = await MessageModel.findById(input.messageId).select('sender conversationId content contentType encrypted recalledAt')
	if (!message || message.recalledAt) throw new Error('消息不存在或已撤回')
	if (String(message.sender) === String(userId)) throw new Error('不能举报自己发送的消息')

	const conversation = await ConversationModel.findById(message.conversationId).select('type members group')
	if (!conversation) throw new Error('会话不存在')
	let allowed = conversation.members.some((id) => String(id) === String(userId))
	if (conversation.type === 'group') {
		const group = await GroupModel.findById(conversation.group).select('members')
		allowed = Boolean(group?.members.some((id) => String(id) === String(userId)))
	}
	if (!allowed) throw new Error('你无权举报该会话中的消息')

	try {
		return await MessageReportModel.create({
			reporter: userId,
			reportedUser: message.sender,
			message: message._id,
			conversation: conversation._id,
			reason: input.reason,
			detail,
			contentType: message.contentType,
			contentSnapshot: message.encrypted ? '[端到端加密消息]' : String(message.content || '').slice(0, 1000),
		})
	} catch (error) {
		if (error?.code === 11000) throw new Error('你已经举报过这条消息')
		throw error
	}
}

async function getMyReports(userId) {
	return MessageReportModel.find({ reporter: userId })
		.populate('reportedUser', 'username avatar userId')
		.sort({ createdAt: -1 })
		.limit(100)
}

async function getReportsForReview(status = 'pending', page = 1, limit = 30) {
	const allowedStatuses = ['all', 'pending', 'reviewing', 'resolved', 'rejected']
	if (!allowedStatuses.includes(status)) throw new Error('举报状态无效')
	const pageNumber = Math.max(1, parseInt(page, 10) || 1)
	const limitNumber = Math.min(50, Math.max(1, parseInt(limit, 10) || 30))
	const query = status === 'all' ? {} : { status }
	const [list, total] = await Promise.all([
		MessageReportModel.find(query)
			.populate('reporter', 'username avatar userId')
			.populate('reportedUser', 'username avatar userId')
			.populate('reviewer', 'username userId')
			.sort({ createdAt: -1 })
			.skip((pageNumber - 1) * limitNumber)
			.limit(limitNumber),
		MessageReportModel.countDocuments(query),
	])
	return { list, total, page: pageNumber, limit: limitNumber }
}

async function updateReportStatus(adminId, reportId, status, resolutionNote = '') {
	if (!mongoose.Types.ObjectId.isValid(reportId)) throw new Error('举报记录不存在')
	if (!['reviewing', 'resolved', 'rejected'].includes(status)) throw new Error('处理状态无效')
	const report = await MessageReportModel.findByIdAndUpdate(reportId, {
		status,
		reviewer: adminId,
		resolutionNote: String(resolutionNote || '').trim().slice(0, 500),
		reviewedAt: new Date(),
		updatedAt: new Date(),
	}, { new: true })
	if (!report) throw new Error('举报记录不存在')
	return report
}

module.exports = { createMessageReport, getMyReports, getReportsForReview, updateReportStatus }
