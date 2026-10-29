const mongoose = require('mongoose')

const messageReportSchema = new mongoose.Schema({
	reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
	reportedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
	message: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', required: true },
	conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
	reason: {
		type: String,
		enum: ['spam', 'abuse', 'fraud', 'explicit', 'other'],
		required: true,
	},
	detail: { type: String, default: '', maxlength: 500 },
	contentType: { type: String, default: 'text' },
	contentSnapshot: { type: String, default: '', maxlength: 1000 },
	status: {
		type: String,
		enum: ['pending', 'reviewing', 'resolved', 'rejected'],
		default: 'pending',
	},
	reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
	resolutionNote: { type: String, default: '', maxlength: 500 },
	reviewedAt: { type: Date, default: null },
	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now },
})

messageReportSchema.index({ reporter: 1, message: 1 }, { unique: true })
messageReportSchema.index({ status: 1, createdAt: -1 })

module.exports = messageReportSchema
