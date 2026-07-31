module.exports = (req, res, next) => {
	res.handleSuccess = (data = null, message = '') => {
		const response = {
			message: message,
			code: 1,
			data: data,
		}
		res.status(200).json(response)
	}
	/**
	 * 业务/校验失败响应
	 * @param {string} message
	 * @param {any} data
	 * @param {number} [statusCode=400] 4xx/5xx，便于网关与监控识别
	 */
	res.handleError = (message = '', data = null, statusCode = 400) => {
		const response = {
			message: message,
			code: 0,
			data: data,
		}
		const code =
			Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 600 ? statusCode : 400
		res.status(code).json(response)
	}
	next()
}
