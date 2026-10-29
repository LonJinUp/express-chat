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
	announcement: {
		type: String,
		default: '',
		maxlength: 500,
	}, // 群公告
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
	memberNicknames: {
		type: Map,
		of: String,
		default: {},
	}, // 群成员在当前群内使用的昵称，键为用户 ObjectId 字符串
	joinApprovalRequired: {
		type: Boolean,
		default: false,
	}, // 通过群邀请链接加入时是否需要管理员审核
	inviteCode: {
		type: String,
		default: '',
		index: true,
	}, // 可随时重置的群邀请链接口令
	inviteLinkEnabled: {
		type: Boolean,
		default: true,
	},
	inviteCodeExpiresAt: {
		type: Date,
		default: null,
	},
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
