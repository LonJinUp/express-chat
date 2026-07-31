const express = require('express')
const multer = require('multer')
const controller = require('../controller/uploadController')
const { authenticateToken } = require('../middleware/authMiddleware')

const router = express.Router()
const maxBytes = Math.max(1, Number(process.env.UPLOAD_MAX_IMAGE_MB || 10)) * 1024 * 1024
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: 1 } })
const maxFileBytes = Math.max(1, Number(process.env.UPLOAD_MAX_FILE_MB || 25)) * 1024 * 1024
const fileUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxFileBytes, files: 1 } })
const maxAudioBytes = Math.max(1, Number(process.env.UPLOAD_MAX_AUDIO_MB || 15)) * 1024 * 1024
const audioUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxAudioBytes, files: 1 } })

function receiveImage(req, res, next) {
	upload.single('file')(req, res, (error) => {
		if (!error) return next()
		const message = error.code === 'LIMIT_FILE_SIZE'
			? `图片不能超过 ${process.env.UPLOAD_MAX_IMAGE_MB || 10}MB`
			: '图片上传失败'
		return res.handleError(message)
	})
}

router.post('/upload/image', authenticateToken, receiveImage, controller.uploadImage)
router.post('/upload/file', authenticateToken, (req, res, next) => {
	fileUpload.single('file')(req, res, (error) => {
		if (!error) return next()
		return res.handleError(error.code === 'LIMIT_FILE_SIZE' ? `文件不能超过 ${process.env.UPLOAD_MAX_FILE_MB || 25}MB` : '文件上传失败')
	})
}, controller.uploadFile)
router.post('/upload/audio', authenticateToken, (req, res, next) => {
	audioUpload.single('file')(req, res, (error) => {
		if (!error) return next()
		return res.handleError(error.code === 'LIMIT_FILE_SIZE' ? `语音不能超过 ${process.env.UPLOAD_MAX_AUDIO_MB || 15}MB` : '语音上传失败')
	})
}, controller.uploadAudio)

module.exports = router
