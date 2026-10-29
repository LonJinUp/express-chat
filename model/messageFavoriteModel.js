const mongoose = require('mongoose')

const messageFavoriteSchema = new mongoose.Schema({
	user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
	message: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', required: true, index: true },
}, { timestamps: true })

messageFavoriteSchema.index({ user: 1, message: 1 }, { unique: true })

module.exports = messageFavoriteSchema
