const mongoose = require('mongoose')

const testSchema = new mongoose.Schema({
	title: {
		type: String,
	},
	content: {
		type: String,
	},
	createTime: {
		type: Date,
		default: Date.now,
	},
	updateTime: {
		type: Date,
		default: Date.now,
	},
})

module.exports = testSchema
