const mongoose = require('mongoose')
const { Schema } = mongoose

const messageSchema = new Schema(
	{
		conversationId: {
			type: Schema.Types.ObjectId,
			ref: 'Conversation',
			required: true,
		}, //关联的会话ID
		sender: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
		}, //发送者ID
		content: {
			type: String,
			required: true,
		}, //消息内容
		contentType: {
			type: String,
			enum: ['text', 'image', 'file'],
			default: 'text',
		}, //消息类型，如文本（text）、图片（image）、文件（file）等
		status: {
			type: String,
			enum: ['sent', 'read'],
			default: 'sent',
			comment: '',
		}, //消息状态，如已发送（sent）、已读（read）等
		createdAt: {
			type: Date,
			default: Date.now,
		}, //消息发送时间
	},
	{ timestamps: true }
)

module.exports = messageSchema
