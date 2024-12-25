const expressWs = require('express-ws')
const { socketJwtMiddleware } = require('../middleware/authMiddleware')
const { handleIncomingMessage, notifyFriendsStatus } = require('../controller/messageController')
const userService = require('../services/userService')

let aWss
const users = {}

function initWebSocket(app) {
	const wsInstance = expressWs(app)
	aWss = wsInstance.getWss('/socket/message')

	app.ws('/socket/message', async (ws, req) => {
		try {
			// 认证
			await socketJwtMiddleware(ws, req)
			// 用户连接和心跳检测
			handleWebSocketConnection(ws, req)
		} catch (err) {
			console.error('WebSocket authentication error:', err)
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
	users[req.user.id] = ws

	// 接收 pong 事件以检测连接状态
	ws.on('pong', () => {
		ws.isAlive = true
	})

	// 处理消息
	ws.on('message', (msg) => handleIncomingMessage(ws, req, msg, users))

	// 处理连接关闭
	ws.on('close', () => {
		delete users[req.user.id]
		notifyFriendsStatus(req.user.id, 'offline', users)
		userService.changeUserStatus(req.user.id, 'offline')
	})

	// 处理 WebSocket 错误
	ws.on('error', (err) => {
		console.error('WebSocket error:', err)
	})

	// 通知好友用户上线
	notifyFriendsStatus(req.user.id, 'online', users)
	userService.changeUserStatus(req.user.id, 'online')
}

module.exports = {
	initWebSocket,
}
