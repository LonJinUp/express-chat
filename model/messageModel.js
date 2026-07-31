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
		clientMessageId: { type: String, default: '' },
		replyTo: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
		content: {
			type: String,
			required: true,
		}, //消息内容
		contentType: {
			type: String,
			enum: ['text', 'image', 'file', 'audio'],
			default: 'text',
		}, //消息类型，如文本（text）、图片（image）、文件（file）等
		encrypted: { type: Boolean, default: false },
		nonce: { type: String, default: '' },
		encryptionAlgorithm: { type: String, default: '' },
		recalledAt: { type: Date, default: null },
		recalledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
		deletedFor: [{ type: Schema.Types.ObjectId, ref: 'User' }],
		reactions: [{
			emoji: { type: String, required: true, maxlength: 8 },
			users: [{ type: Schema.Types.ObjectId, ref: 'User' }],
		}],
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

messageSchema.index(
	{ sender: 1, clientMessageId: 1 },
	{ unique: true, partialFilterExpression: { clientMessageId: { $type: 'string', $gt: '' } } }
)
messageSchema.index({ conversationId: 1, createdAt: -1 })

module.exports = messageSchema
