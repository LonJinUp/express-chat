const { testModel } = require('../model/index')

const add = async (data) => {
	try {
		const addTestModel = new testModel(data)
		const dbBack = await addTestModel.save()
		return addTestModel
	} catch (err) {
		throw new Error(err)
	}
}

module.exports = {
	add,
}
