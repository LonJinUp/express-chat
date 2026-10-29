const mongoose = require('mongoose')

const sessionSchema = new mongoose.Schema({
	user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
	sessionId: { type: String, required: true, unique: true },
	deviceName: { type: String, default: '未知设备', maxlength: 120 },
	platform: { type: String, default: 'unknown', maxlength: 40 },
	browser: { type: String, default: 'unknown', maxlength: 40 },
	userAgent: { type: String, default: '', maxlength: 500 },
	ip: { type: String, default: '', maxlength: 80 },
	lastActiveAt: { type: Date, default: Date.now },
	expiresAt: { type: Date, required: true },
	revokedAt: { type: Date, default: null },
	createdAt: { type: Date, default: Date.now },
})

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
sessionSchema.index({ user: 1, lastActiveAt: -1 })

module.exports = sessionSchema
