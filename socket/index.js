const expressWs = require('express-ws')
const {
	socketJwtMiddleware,
	extractBearerToken,
	verifyToken,
} = require('../middleware/authMiddleware')
const { handleIncomingMessage, notifyFriendsStatus } = require('../controller/messageController')
const userService = require('../services/userService')
const realtimeService = require('../services/realtimeService')
const { MESSAGE_TYPE } = require('../enum/message')

const WS_RATE_WINDOW_MS = 60 * 1000

function getWsMaxMsgPerMin() {
	return Math.max(1, parseInt(process.env.WS_MAX_MSG_PER_MIN || '120', 10))
}

function getWsMaxConnPerUser() {
	return Math.max(1, parseInt(process.env.WS_MAX_CONN_PER_USER || '10', 10))
}

/** 滑动窗口内限制每条连接每分钟消息数，防刷 */
function allowIncomingMessageRate(ws) {
	const max = getWsMaxMsgPerMin()
	const now = Date.now()
	if (ws._wsRateWindowStart == null) {
		ws._wsRateWindowStart = now
		ws._wsRateCount = 0
	}
	if (now - ws._wsRateWindowStart >= WS_RATE_WINDOW_MS) {
		ws._wsRateWindowStart = now
		ws._wsRateCount = 0
	}
	ws._wsRateCount += 1
	return ws._wsRateCount <= max
}

function sendWsProtocolError(ws, text) {
	if (ws.readyState !== ws.OPEN) return
	try {
		ws.send(
			JSON.stringify({
				type: MESSAGE_TYPE.MESSAGE_SEND_ERROR,
				data: { error: text },
			})
		)
	} catch (_) {
		/* ignore */
	}
}

function getWsAuthTimeoutMs() {
	return Math.max(3000, parseInt(process.env.WS_AUTH_TIMEOUT_MS || '15000', 10))
}

/**
 * 无 Query/Header Token 时：保持连接，直到收到首条鉴权 JSON（可重试，直至超时）
 */
function handleWebSocketPendingAuth(ws, req) {
	ws.isAlive = true
	let authTimer = setTimeout(() => {
		if (ws.readyState === ws.OPEN) {
			ws.close(4001, 'Auth timeout')
		}
	}, getWsAuthTimeoutMs())

	ws.once('close', () => clearTimeout(authTimer))

	const pendingAuthHandler = async (msg) => {
		if (req.user) return

		const raw = Buffer.isBuffer(msg) ? msg.toString('utf8') : String(msg)
		if (Buffer.byteLength(raw, 'utf8') > 65536) {
			sendWsProtocolError(ws, '鉴权消息过大')
			return
		}

		let parsed
		try {
			parsed = JSON.parse(raw)
		} catch {
			sendWsProtocolError(ws, '鉴权消息须为 JSON，例如 {"type":"auth","token":"<JWT>"}')
			return
		}

		if (parsed.type !== 'auth') {
			sendWsProtocolError(ws, '请先发送鉴权：{"type":"auth","token":"..."} 或 "authorization":"Bearer ..."')
			return
		}

		let rawToken = ''
		if (typeof parsed.token === 'string' && parsed.token.trim()) {
			rawToken = parsed.token.trim()
		} else if (typeof parsed.authorization === 'string' && parsed.authorization.trim()) {
			rawToken = parsed.authorization.trim()
		}
		const token = extractBearerToken(rawToken)

		if (!token) {
			sendWsProtocolError(ws, '鉴权缺少 token 或 authorization')
			return
		}

		try {
			req.user = await verifyToken(token)
		} catch {
			sendWsProtocolError(ws, '登录已过期或 token 无效')
			if (ws.readyState === ws.OPEN) {
				ws.close(4001, 'Invalid token')
			}
			return
		}

		clearTimeout(authTimer)
		ws.removeListener('message', pendingAuthHandler)

		try {
			ws.send(
				JSON.stringify({
					type: MESSAGE_TYPE.AUTH_SUCCESS,
					data: {
						id: req.user.id,
						userId: req.user.userId,
						username: req.user.username,
					},
				})
			)
		} catch (_) {
			/* ignore */
		}

		handleWebSocketConnection(ws, req)
	}

	ws.on('message', pendingAuthHandler)

	ws.on('error', (err) => {
		console.error('WebSocket error (pending auth):', err)
	})
}

let aWss
// Map<userId, Set<WebSocket>>
const users = new Map()

function pushToConnectedUsers(userIds, type, data = {}) {
	let sent = false
	const payload = JSON.stringify({ type, data })

	userIds.forEach((userId) => {
		const connections = users.get(String(userId))
		if (!connections) return

		connections.forEach((ws) => {
			if (ws.readyState !== ws.OPEN) return
			try {
				ws.send(payload)
				sent = true
			} catch (error) {
				console.error('WebSocket push failed:', error)
			}
		})
	})

	return sent
}

realtimeService.registerPushHandler(pushToConnectedUsers)

realtimeService.registerRevokeSessionHandler((userId, sessionId) => {
	const connections = users.get(String(userId))
	if (!connections) return false
	let closed = false
	connections.forEach((ws) => {
		if (String(ws.sessionId || '') !== String(sessionId)) return
		closed = true
		try {
			if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'session_revoked', data: { sessionId } }))
			ws.close(4002, 'Session revoked')
		} catch (_) { /* ignore */ }
	})
	return closed
})

function addConnection(userId, ws) {
	let set = users.get(userId)
	if (!set) {
		set = new Set()
		users.set(userId, set)
	}
	set.add(ws)
	return set.size === 1 // 首次连接
}

function removeConnection(userId, ws) {
	const set = users.get(userId)
	if (!set) return true
	set.delete(ws)
	if (set.size === 0) {
		users.delete(userId)
		return true
	}
	return false
}

function initWebSocket(app) {
	const wsInstance = expressWs(app)
	aWss = wsInstance.getWss('/socket/message')

	app.ws('/socket/message', async (ws, req) => {
		try {
			await socketJwtMiddleware(ws, req, { allowDeferredAuth: true })
			if (req.user) {
				handleWebSocketConnection(ws, req)
			} else {
				handleWebSocketPendingAuth(ws, req)
			}
		} catch (err) {
			console.error('WebSocket authentication error:', err)
			if (ws.readyState === ws.OPEN) {
				ws.close(4001, 'Unauthorized')
			}
		}
	})

	// 心跳检测
	const interval = setInterval(() => {
		aWss.clients.forEach((ws) => {
			if (!ws.isAlive) return ws.terminate()
			ws.isAlive = false
			ws.ping()
		})
	}, 10000)

	wsInstance.getWss().on('close', () => {
		clearInterval(interval)
	})
}

/**
 * 处理用户的 WebSocket 连接、心跳和断开
 */
function handleWebSocketConnection(ws, req) {
	ws.isAlive = true
	const userId = req.user.id
	ws.userId = userId
	ws.sessionId = req.user.sid || ''

	const maxConn = getWsMaxConnPerUser()
	const existing = users.get(userId)
	if (existing && existing.size >= maxConn) {
		ws.close(4008, 'Too many connections')
		return
	}

	const isFirstConnection = addConnection(userId, ws)

	// 接收 pong 事件以检测连接状态
	ws.on('pong', () => {
		ws.isAlive = true
	})

	// 处理消息（异步错误统一捕获，避免 unhandledRejection）
	ws.on('message', (msg) => {
		if (!allowIncomingMessageRate(ws)) {
			sendWsProtocolError(ws, '发送过于频繁，请稍后再试')
			return
		}
		handleIncomingMessage(ws, req, msg, users).catch((err) => {
			console.error('WebSocket handleIncomingMessage:', err)
			sendWsProtocolError(ws, '消息处理失败')
		})
	})

	// 处理连接关闭
	ws.on('close', () => {
		const shouldMarkOffline = removeConnection(userId, ws)
		if (shouldMarkOffline) {
			notifyFriendsStatus(userId, 'offline', users)
			userService.changeUserStatus(userId, 'offline').catch((err) => {
				console.error('Failed to mark user offline:', err)
			})
		}
	})

	// 处理 WebSocket 错误
	ws.on('error', (err) => {
		console.error('WebSocket error:', err)
	})

	// 通知好友用户上线（仅在首个连接建立时）
	if (isFirstConnection) {
		notifyFriendsStatus(userId, 'online', users)
		userService.changeUserStatus(userId, 'online').catch((err) => {
			console.error('Failed to mark user online:', err)
		})
	}
}

module.exports = {
	initWebSocket,
}
