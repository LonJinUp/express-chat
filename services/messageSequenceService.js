const { CounterModel } = require('../model')

async function nextMessageSequence() {
	const counter = await CounterModel.findOneAndUpdate(
		{ _id: 'global_message_sequence' },
		{ $inc: { value: 1 } },
		{ upsert: true, new: true, setDefaultsOnInsert: true }
	).lean()
	return counter.value
}

async function currentMessageSequence() {
	const counter = await CounterModel.findById('global_message_sequence').select('value').lean()
	return counter?.value || 0
}

module.exports = { nextMessageSequence, currentMessageSequence }
