const jwt = require('jsonwebtoken')
const { PASSWORD_SECRET } = require('../../config/config.default')

/**
 * 接口鉴权
 * @param {Object} req
 * @param {Object} res
 * @param {Object} next
 * @returns
 */
const authenticateToken = (req, res, next) => {
	const authHeader = req.headers['authorization']
	const token = authHeader && authHeader.split(' ')[1]
	if (!token) return res.sendStatus(401)
	jwt.verify(token, PASSWORD_SECRET, (err, user) => {
		if (err) return res.sendStatus(401)
		req.user = user
		next()
	})
}

/**
 * 使用 Promise 封装 jwt.verify
 * @param {String} token - JWT token
 * @returns {Object} decoded - 解码后的 token 数据
 * @throws {Error} - 如果 token 无效或验证失败，则抛出错误
 */
function verifyToken(token) {
	return new Promise((resolve, reject) => {
		jwt.verify(token, PASSWORD_SECRET, (err, decoded) => {
			if (err) {
				reject('登录过期')
			} else {
				resolve(decoded)
			}
		})
	})
}

/**
 * socket 鉴权
 * @param {Object} ws
 * @param {Object} req
 * @returns
 */
async function socketJwtMiddleware(ws, req) {
	let token = req.query.Authorization
	if (!token) {
		ws.close(4001, 'Invalid token')
		throw new Error('Token not provided')
	}
	token = token.split(' ')[1]
	try {
		const user = await verifyToken(token)
		req.user = user
	} catch (err) {
		ws.close(4001, 'Invalid token')
		throw err
	}
}

module.exports = { authenticateToken, socketJwtMiddleware }
