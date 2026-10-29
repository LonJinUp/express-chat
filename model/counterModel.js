const mongoose = require('mongoose')
const { Schema } = mongoose

const counterSchema = new Schema({
	_id: { type: String, required: true },
	value: { type: Number, default: 0 },
}, { versionKey: false })

module.exports = counterSchema
