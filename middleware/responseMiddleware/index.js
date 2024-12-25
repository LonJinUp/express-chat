module.exports = (req, res, next) => {
	res.handleSuccess = (data = null, message = '') => {
		const response = {
			message: message,
			code: 1,
			data: data,
		}
		res.status(200).json(response)
	}
	res.handleError = (message = '', data = null) => {
		const response = {
			message: message,
			code: 0,
			data: data,
		}
		res.status(200).json(response)
	}
	next()
}
