const mongoose = require('mongoose')

// 群组表
const groupSchema = new mongoose.Schema({
	name: {
		type: String,
		required: true,
	}, // 群组名称
	avatar: {
		type: String,
		default: '',
	}, //群头像
	owner: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: true,
	}, // 群主ID
	members: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
		},
	], // 成员ID列表
	admins: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
		},
	], // 管理员ID列表
	createdAt: {
		type: Date,
		default: Date.now,
	}, // 创建时间
	updatedAt: {
		type: Date,
		default: Date.now,
	}, // 更新时间
})
module.exports = groupSchema
