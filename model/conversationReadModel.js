const mongoose = require('mongoose')
const { Schema } = mongoose

const conversationReadSchema = new Schema(
	{
		conversation: {
			type: Schema.Types.ObjectId,
			ref: 'Conversation',
			required: true,
		},
		user: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			required: true,
		},
		readAt: {
			type: Date,
			default: Date.now,
		},
	},
	{ timestamps: true }
)

// 创建复合索引
conversationReadSchema.index({ conversation: 1, user: 1 }, { unique: true })

module.exports = conversationReadSchema
