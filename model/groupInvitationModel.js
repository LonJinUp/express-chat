const mongoose = require('mongoose')

const groupInvitationSchema = new mongoose.Schema({
	group: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'Group',
		required: true,
	},
	inviter: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: true,
	},
	invitee: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: true,
	},
	status: {
		type: String,
		enum: ['pending', 'accepted', 'rejected'],
		default: 'pending',
	},
	createdAt: {
		type: Date,
		default: Date.now,
	},
	updatedAt: {
		type: Date,
		default: Date.now,
	},
})

groupInvitationSchema.index(
	{ group: 1, invitee: 1 },
	{ unique: true, partialFilterExpression: { status: 'pending' } }
)

module.exports = groupInvitationSchema
