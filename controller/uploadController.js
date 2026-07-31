const uploadService = require('../services/uploadService')

exports.uploadImage = async (req, res) => {
	try {
		const result = await uploadService.uploadImage(req.file)
		let url = result.url
		if (url.startsWith('/')) {
			const configuredBase = String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')
			const requestBase = `${req.protocol}://${req.get('host')}`
			url = `${configuredBase || requestBase}${url}`
		}
		res.handleSuccess({ ...result, url })
	} catch (error) {
		res.handleError(error.message)
	}
}

exports.uploadFile = async (req, res) => {
	try {
		const result = await uploadService.uploadFile(req.file)
		let url = result.url
		if (url.startsWith('/')) {
			const configuredBase = String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')
			url = `${configuredBase || `${req.protocol}://${req.get('host')}`}${url}`
		}
		res.handleSuccess({ ...result, url })
	} catch (error) { res.handleError(error.message) }
}

exports.uploadAudio = async (req, res) => {
	try {
		const result = await uploadService.uploadAudio(req.file)
		let url = result.url
		if (url.startsWith('/')) {
			const configuredBase = String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')
			url = `${configuredBase || `${req.protocol}://${req.get('host')}`}${url}`
		}
		res.handleSuccess({ ...result, url })
	} catch (error) { res.handleError(error.message) }
}
