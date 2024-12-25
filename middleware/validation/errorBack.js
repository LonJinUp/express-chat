const { validationResult } = require('express-validator')

module.exports = (validator) => {
	return async (req, res, next) => {
		await Promise.all(validator.map((i) => i.run(req)))
		const errors = validationResult(req)
		if (!errors.isEmpty()) {
			return res.handleError(errors.array()[0].msg)
		}
		next()
	}
}
