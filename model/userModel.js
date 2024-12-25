const mongoose = require('mongoose')
const uuid = require('uuid')

const userSchema = new mongoose.Schema({
	userId: {
		type: String,
		default: '',
		unique: true,
	},
	username: {
		type: String,
		required: true,
		unique: true,
	},
	password: {
		type: String,
		required: true,
	},
	email: {
		type: String,
		required: true,
		unique: true,
	},
	avatar: {
		type: String,
	},
	status: {
		type: String,
		enum: ['online', 'offline'],
		default: 'offline',
	},
	lastLoginTime: {
		type: Date,
		default: Date.now,
	},
	friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
	groups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Group' }],
	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now },
})

module.exports = userSchema
