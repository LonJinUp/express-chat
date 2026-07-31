const path = require('path')
const fs = require('fs/promises')
const crypto = require('crypto')

const IMAGE_EXTENSIONS = {
	'image/jpeg': '.jpg',
	'image/png': '.png',
	'image/webp': '.webp',
	'image/gif': '.gif',
}
const FILE_EXTENSIONS = {
	'application/pdf': '.pdf',
	'text/plain': '.txt',
	'text/csv': '.csv',
	'application/zip': '.zip',
	'application/x-zip-compressed': '.zip',
	'application/msword': '.doc',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
	'application/vnd.ms-excel': '.xls',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
	'application/vnd.ms-powerpoint': '.ppt',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
}
const AUDIO_EXTENSIONS = {
	'audio/mpeg': '.mp3',
	'audio/mp3': '.mp3',
	'audio/mp4': '.m4a',
	'audio/x-m4a': '.m4a',
	'audio/aac': '.aac',
	'audio/wav': '.wav',
	'audio/x-wav': '.wav',
	'audio/amr': '.amr',
	'audio/ogg': '.ogg',
	'audio/webm': '.webm',
}

function getUploadDriver() {
	return String(process.env.UPLOAD_DRIVER || 'local').toLowerCase()
}

function getLocalUploadDir() {
	return path.resolve(process.env.UPLOAD_LOCAL_DIR || path.join(__dirname, '..', 'uploads'))
}

function createObjectName(mimeType, kind = 'images') {
	const date = new Date().toISOString().slice(0, 10).replace(/-/g, '/')
	const extension = kind === 'images' ? IMAGE_EXTENSIONS[mimeType] : kind === 'audio' ? AUDIO_EXTENSIONS[mimeType] : FILE_EXTENSIONS[mimeType]
	return `${kind}/${date}/${crypto.randomUUID()}${extension}`
}

function assertImage(file) {
	if (!file?.buffer || !IMAGE_EXTENSIONS[file.mimetype]) throw new Error('仅支持 JPG、PNG、WebP 或 GIF 图片')
	const bytes = file.buffer
	const valid =
		(file.mimetype === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
		(file.mimetype === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
		(file.mimetype === 'image/gif' && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))) ||
		(file.mimetype === 'image/webp' && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP')
	if (!valid) throw new Error('图片内容与文件类型不一致')
}

async function uploadLocal(file, kind = 'images') {
	const objectName = createObjectName(file.mimetype, kind)
	const target = path.join(getLocalUploadDir(), objectName)
	await fs.mkdir(path.dirname(target), { recursive: true })
	await fs.writeFile(target, file.buffer, { flag: 'wx' })
	return { driver: 'local', objectName, url: `/uploads/${objectName}` }
}

async function uploadOss(file, kind = 'images') {
	const OSS = require('ali-oss')
	const required = ['OSS_REGION', 'OSS_BUCKET', 'OSS_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_SECRET']
	const missing = required.filter((key) => !process.env[key])
	if (missing.length) throw new Error(`OSS 配置缺失：${missing.join(', ')}`)
	const client = new OSS({
		region: process.env.OSS_REGION,
		bucket: process.env.OSS_BUCKET,
		accessKeyId: process.env.OSS_ACCESS_KEY_ID,
		accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
		endpoint: process.env.OSS_ENDPOINT || undefined,
		secure: true,
	})
	const objectName = createObjectName(file.mimetype, kind)
	const result = await client.put(objectName, file.buffer, {
		headers: { 'Content-Type': file.mimetype, 'Cache-Control': 'public, max-age=31536000, immutable' },
	})
	const cdnBase = String(process.env.OSS_PUBLIC_BASE_URL || '').replace(/\/$/, '')
	return { driver: 'oss', objectName, url: cdnBase ? `${cdnBase}/${objectName}` : result.url }
}

async function uploadImage(file) {
	assertImage(file)
	const driver = getUploadDriver()
	if (driver === 'local') return uploadLocal(file)
	if (driver === 'oss') return uploadOss(file)
	throw new Error(`不支持的上传驱动：${driver}`)
}

function safeOriginalName(value) {
	let name = String(value || '文件')
	// Multer/Busboy 可能把 multipart 中的 UTF-8 文件名按 latin1 解码，
	// 典型表现为“测试.pdf”变成“æµè¯.pdf”。仅在转换结果是有效 UTF-8
	// 且更少出现乱码特征时采用修复结果，避免破坏正常的西文文件名。
	if (/[\u0080-\u00ff]/.test(name)) {
		const repaired = Buffer.from(name, 'latin1').toString('utf8')
		const brokenScore = (text) => (text.match(/[\ufffdÃÂæçåèé]/g) || []).length
		if (!repaired.includes('\ufffd') && brokenScore(repaired) < brokenScore(name)) name = repaired
	}
	return path.basename(name).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120) || '文件'
}

async function uploadFile(file) {
	if (!file?.buffer || !FILE_EXTENSIONS[file.mimetype]) throw new Error('仅支持 PDF、文本、ZIP 和常用 Office 文档')
	const driver = getUploadDriver()
	let result
	if (driver === 'local') result = await uploadLocal(file, 'files')
	else if (driver === 'oss') result = await uploadOss(file, 'files')
	else throw new Error(`不支持的上传驱动：${driver}`)
	return { ...result, name: safeOriginalName(file.originalname), size: file.size, mimeType: file.mimetype }
}

async function uploadAudio(file) {
	let mimeType = file?.mimetype
	if (mimeType === 'application/octet-stream') {
		const extension = path.extname(String(file.originalname || '')).toLowerCase()
		mimeType = Object.keys(AUDIO_EXTENSIONS).find((key) => AUDIO_EXTENSIONS[key] === extension)
	}
	if (!file?.buffer || !mimeType || !AUDIO_EXTENSIONS[mimeType]) throw new Error('仅支持 MP3、M4A、AAC、WAV、AMR 或 OGG 语音')
	const normalizedFile = { ...file, mimetype: mimeType }
	const driver = getUploadDriver()
	let result
	if (driver === 'local') result = await uploadLocal(normalizedFile, 'audio')
	else if (driver === 'oss') result = await uploadOss(normalizedFile, 'audio')
	else throw new Error(`不支持的上传驱动：${driver}`)
	return { ...result, size: file.size, mimeType }
}

module.exports = { uploadImage, uploadFile, uploadAudio, getLocalUploadDir, getUploadDriver, safeOriginalName, IMAGE_EXTENSIONS, FILE_EXTENSIONS, AUDIO_EXTENSIONS }
