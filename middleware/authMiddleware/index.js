const jwt = require('jsonwebtoken')

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
	jwt.verify(token, process.env.PASSWORD_SECRET, (err, user) => {
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
		jwt.verify(token, process.env.PASSWORD_SECRET, (err, decoded) => {
			if (err) {
				reject('登录过期')
			} else {
				resolve(decoded)
			}
		})
	})
}

/**
 * 从 "Bearer <jwt>" 或裸 JWT 字符串中取出 token
 */
function extractBearerToken(authorizationHeader) {
	if (!authorizationHeader || typeof authorizationHeader !== 'string') return null
	const t = authorizationHeader.trim()
	if (t.startsWith('Bearer ')) {
		const rest = t.slice(7).trim()
		return rest || null
	}
	return t || null
}

function getTokenFromSocketRequest(req) {
	const headerAuth = req.headers['authorization'] || req.headers['Authorization']
	const queryAuth = req.query.Authorization || req.query.token
	const raw = headerAuth || queryAuth
	return extractBearerToken(typeof raw === 'string' ? raw : String(raw || ''))
}

/**
 * socket 鉴权：优先 HTTP Header，其次 Query。
 * @param {Object} ws
 * @param {Object} req
 * @param {{ allowDeferredAuth?: boolean }} [options] allowDeferredAuth=true 时若无 token 不关闭连接，由首包 JSON 鉴权
 */
async function socketJwtMiddleware(ws, req, options = {}) {
	const { allowDeferredAuth = false } = options
	const token = getTokenFromSocketRequest(req)

	if (!token) {
		if (allowDeferredAuth) {
			req.user = undefined
			return
		}
		ws.close(4001, 'Invalid token')
		throw new Error('Token not provided')
	}
	try {
		req.user = await verifyToken(token)
	} catch (err) {
		ws.close(4001, 'Invalid token')
		throw err
	}
}

module.exports = {
	authenticateToken,
	socketJwtMiddleware,
	extractBearerToken,
	verifyToken,
	getTokenFromSocketRequest,
}
