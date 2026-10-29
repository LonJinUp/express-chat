const crypto = require('crypto')

const requestedDriver = (process.env.REALTIME_DRIVER || process.env.PRESENCE_DRIVER || 'memory').toLowerCase()
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379'
const keyPrefix = process.env.REDIS_KEY_PREFIX || 'express-chat'
const allowMemoryFallback = process.env.REALTIME_REDIS_FALLBACK_TO_MEMORY !== 'false'
const instanceId = `${process.env.INSTANCE_ID || 'node'}:${process.pid}:${crypto.randomUUID()}`
const channel = `${keyPrefix}:realtime:events`

let pushHandler = null
let revokeSessionHandler = null
let redisClient = null
let redisSubscriber = null
let activeDriver = 'memory'
let initPromise = null

function registerPushHandler(handler) {
	pushHandler = handler
}

function registerRevokeSessionHandler(handler) {
	revokeSessionHandler = handler
}

function deliverLocal(event) {
	if (event.kind === 'push') {
		if (!pushHandler || !Array.isArray(event.userIds)) return false
		return pushHandler(event.userIds.map(String), event.type, event.data || {})
	}
	if (event.kind === 'revoke_session') {
		if (!revokeSessionHandler || !event.userId || !event.sessionId) return false
		return revokeSessionHandler(String(event.userId), String(event.sessionId))
	}
	return false
}

function publishRemote(event) {
	const publish = () => redisClient.publish(channel, JSON.stringify({ ...event, sourceInstanceId: instanceId }))
		.catch(error => console.error('[realtime] Redis 事件发布失败:', error.message))
	if (activeDriver === 'redis' && redisClient?.isReady) {
		publish()
		return
	}
	// 服务刚启动时 HTTP 请求可能早于 Redis 完成连接，初始化完成后补发本次事件。
	if (requestedDriver === 'redis' && initPromise) {
		initPromise.then(() => {
			if (activeDriver === 'redis' && redisClient?.isReady) publish()
		}).catch(() => {})
	}
}

async function initRedis() {
	const { createClient } = require('redis')
	redisClient = createClient({
		url: redisUrl,
		socket: {
			connectTimeout: 5000,
			reconnectStrategy: retries => retries > 5 ? new Error('Redis reconnect attempts exhausted') : Math.min(retries * 200, 2000),
		},
	})
	redisSubscriber = redisClient.duplicate()
	redisClient.on('error', error => console.error('[realtime] Redis 客户端异常:', error.message))
	redisSubscriber.on('error', error => console.error('[realtime] Redis 订阅异常:', error.message))
	await Promise.all([redisClient.connect(), redisSubscriber.connect()])
	await redisSubscriber.subscribe(channel, raw => {
		try {
			const event = JSON.parse(raw)
			if (event.sourceInstanceId === instanceId) return
			deliverLocal(event)
		} catch (error) {
			console.error('[realtime] 无法处理 Redis 事件:', error.message)
		}
	})
	activeDriver = 'redis'
	console.log(`[realtime] Redis 多实例消息总线已启用，实例 ${instanceId}`)
}

async function init() {
	if (initPromise) return initPromise
	initPromise = (async () => {
		if (requestedDriver !== 'redis') {
			activeDriver = 'memory'
			console.log('[realtime] 使用单机内存消息路由')
			return activeDriver
		}
		try {
			await initRedis()
		} catch (error) {
			if (!allowMemoryFallback) throw error
			activeDriver = 'memory'
			console.error(`[realtime] Redis 初始化失败，已降级为单机内存模式: ${error.message}`)
			await Promise.allSettled([redisClient?.disconnect(), redisSubscriber?.disconnect()])
			redisClient = null
			redisSubscriber = null
		}
		return activeDriver
	})()
	return initPromise
}

function revokeSessionConnections(userId, sessionId) {
	if (!userId || !sessionId) return false
	const event = { kind: 'revoke_session', userId: String(userId), sessionId: String(sessionId) }
	const delivered = deliverLocal(event)
	publishRemote(event)
	return delivered
}

function pushToUser(userId, type, data = {}) {
	if (!userId) return false
	return pushToUsers([String(userId)], type, data)
}

function pushToUsers(userIds, type, data = {}) {
	if (!Array.isArray(userIds) || !userIds.length || !type) return false
	const event = { kind: 'push', userIds: [...new Set(userIds.map(String))], type, data }
	const delivered = deliverLocal(event)
	publishRemote(event)
	return delivered
}

function getDriver() {
	return activeDriver
}

module.exports = {
	init,
	getDriver,
	registerPushHandler,
	registerRevokeSessionHandler,
	revokeSessionConnections,
	pushToUser,
	pushToUsers,
}
