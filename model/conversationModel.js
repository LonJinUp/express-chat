const mongoose = require('mongoose')
const { Schema } = mongoose
// 会话模型
const conversationSchema = new Schema(
	{
		type: {
			type: String,
			enum: ['private', 'group'],
			required: true,
		}, //会话类型，单聊（private）或群聊（group）
		members: [
			{
				type: Schema.Types.ObjectId,
				ref: 'User',
				required: true,
			},
		], //会话成员ID列表
		group: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Group',
		}, //群聊ID
		lastMessage: {
			type: Schema.Types.ObjectId,
			ref: 'Message',
		}, // 最近一条消息的ID
		createdAt: {
			type: Date,
			default: Date.now,
		}, //会话创建时间
		updatedAt: {
			type: Date,
			default: Date.now,
		}, //会话更新时间
	},
	{ timestamps: true }
)

module.exports = conversationSchema
