const mongoose = require('mongoose')

// 好友表
const friendSchema = new mongoose.Schema({
	user: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: true,
	},
	friend: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: true,
	}, // 好友ID
	status: {
		type: String,
		enum: ['pending', 'accepted', 'rejected'],
		default: 'pending',
	}, // 好友关系状态 (待处理, 已接受, 已拒绝)
	createdAt: {
		type: Date,
		default: Date.now,
	}, // 创建时间
	updatedAt: {
		type: Date,
		default: Date.now,
	}, // 更新时间
})

module.exports = friendSchema
