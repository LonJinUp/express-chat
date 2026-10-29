const mongoose = require('mongoose')

const groupJoinRequestSchema = new mongoose.Schema({
	group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
	applicant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
	status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending', index: true },
	message: { type: String, default: '', maxlength: 120 },
}, { timestamps: true })

groupJoinRequestSchema.index({ group: 1, applicant: 1, status: 1 })

module.exports = groupJoinRequestSchema
