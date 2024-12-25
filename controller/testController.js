const testService = require('../services/testService')

exports.add = async (req, res) => {
	try {
		const user = await testService.add(req.body)
		res.handleSuccess(user)
	} catch (error) {
		res.handleError('api error', error)
	}
}
