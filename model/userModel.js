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
	role: {
		type: String,
		enum: ['user', 'admin'],
		default: 'user',
	},
	e2eePublicKey: { type: String, default: '' },
	e2eeKeyBackup: {
		ciphertext: { type: String, default: '' },
		nonce: { type: String, default: '' },
		salt: { type: String, default: '' },
		iterations: { type: Number, default: 0 },
		algorithm: { type: String, default: '' },
		publicKey: { type: String, default: '' },
		updatedAt: { type: Date },
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
	lastSeenAt: {
		type: Date,
		default: null,
	},
	friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
	blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
	notificationSettings: {
		messageSound: { type: Boolean, default: true },
		friendRequestSound: { type: Boolean, default: true },
		showMessagePreview: { type: Boolean, default: true },
		desktopNotifications: { type: Boolean, default: false },
	},
	groups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Group' }],
	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now },
})

module.exports = userSchema
