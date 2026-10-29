const crypto = require('crypto')

const requestedDriver = (process.env.PRESENCE_DRIVER || 'memory').toLowerCase()
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379'
const keyPrefix = process.env.REDIS_KEY_PREFIX || 'express-chat'
const allowMemoryFallback = process.env.PRESENCE_REDIS_FALLBACK_TO_MEMORY !== 'false'
const instanceId = `${process.env.INSTANCE_ID || 'node'}:${process.pid}:${crypto.randomUUID()}`
const connectionTtlSeconds = Math.max(Number(process.env.PRESENCE_CONNECTION_TTL_SECONDS) || 45, 20)
const sweepIntervalMs = Math.max(Number(process.env.PRESENCE_SWEEP_INTERVAL_MS) || 5000, 1000)

const channel = `${keyPrefix}:presence:events`
const expirationKey = `${keyPrefix}:{presence}:expirations`
const memoryUsers = new Map()
const listeners = new Set()

let activeDriver = 'memory'
let redisClient = null
let redisSubscriber = null
let initPromise = null
let sweepTimer = null

const registerScript = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
local before = redis.call('ZCARD', KEYS[1])
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3])
redis.call('ZADD', KEYS[2], ARGV[2], ARGV[4])
redis.call('EXPIRE', KEYS[1], ARGV[5])
if before == 0 then return 1 else return 0 end
`

const removeScript = `
redis.call('ZREM', KEYS[2], ARGV[2])
local removed = redis.call('ZREM', KEYS[1], ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[3])
if removed > 0 and redis.call('ZCARD', KEYS[1]) == 0 then return 1 else return 0 end
`

const sweepScript = `
local score = redis.call('ZSCORE', KEYS[2], ARGV[2])
if not score or tonumber(score) > tonumber(ARGV[3]) then return 0 end
redis.call('ZREM', KEYS[2], ARGV[2])
local removed = redis.call('ZREM', KEYS[1], ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[3])
if removed > 0 and redis.call('ZCARD', KEYS[1]) == 0 then return 1 else return 0 end
`

const userKey = userId => `${keyPrefix}:{presence}:user:${userId}`
const memberName = (userId, connectionId) => `${userId}|${connectionId}`
const expiresAt = () => Date.now() + connectionTtlSeconds * 1000

function emitStatus(event) {
	listeners.forEach(listener => {
		Promise.resolve(listener(event)).catch(error => {
			console.error('[presence] 状态回调执行失败:', error.message)
		})
	})
}

async function publishStatus(userId, status) {
	const event = {
		userId: String(userId),
		status,
		lastSeenAt: new Date().toISOString(),
		instanceId,
	}
	if (activeDriver === 'redis') {
		await redisClient.publish(channel, JSON.stringify(event))
		return
	}
	emitStatus(event)
}

function registerMemory(userId, connectionId) {
	const id = String(userId)
	const connections = memoryUsers.get(id) || new Set()
	const wasOffline = connections.size === 0
	connections.add(connectionId)
	memoryUsers.set(id, connections)
	if (wasOffline) return publishStatus(id, 'online')
}

function removeMemory(userId, connectionId) {
	const id = String(userId)
	const connections = memoryUsers.get(id)
	if (!connections || !connections.delete(connectionId)) return
	if (connections.size > 0) return
	memoryUsers.delete(id)
	return publishStatus(id, 'offline')
}

async function sweepExpiredConnections() {
	if (activeDriver !== 'redis' || !redisClient?.isReady) return
	try {
		const currentTime = Date.now()
		const expired = await redisClient.zRangeByScore(expirationKey, 0, currentTime, {
			LIMIT: { offset: 0, count: 200 },
		})
		for (const member of expired) {
			const separator = member.indexOf('|')
			if (separator < 1) {
				await redisClient.zRem(expirationKey, member)
				continue
			}
			const userId = member.slice(0, separator)
			const connectionId = member.slice(separator + 1)
			const becameOffline = await redisClient.eval(sweepScript, {
				keys: [userKey(userId), expirationKey],
				arguments: [connectionId, member, String(currentTime)],
			})
			if (Number(becameOffline) === 1) await publishStatus(userId, 'offline')
		}
	} catch (error) {
		console.error('[presence] 清理过期连接失败:', error.message)
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
	redisClient.on('error', error => console.error('[presence] Redis 客户端异常:', error.message))
	redisSubscriber.on('error', error => console.error('[presence] Redis 订阅异常:', error.message))
	await Promise.all([redisClient.connect(), redisSubscriber.connect()])
	await redisSubscriber.subscribe(channel, raw => {
		try {
			emitStatus(JSON.parse(raw))
		} catch (error) {
			console.error('[presence] 无法解析状态事件:', error.message)
		}
	})
	activeDriver = 'redis'
	sweepTimer = setInterval(sweepExpiredConnections, sweepIntervalMs)
	sweepTimer.unref?.()
	console.log(`[presence] Redis 在线状态已启用，实例 ${instanceId}`)
}

async function init() {
	if (initPromise) return initPromise
	initPromise = (async () => {
		if (requestedDriver !== 'redis') {
			activeDriver = 'memory'
			console.log('[presence] 使用单机内存在线状态')
			return activeDriver
		}
		try {
			await initRedis()
		} catch (error) {
			if (!allowMemoryFallback) throw error
			activeDriver = 'memory'
			console.error(`[presence] Redis 初始化失败，已降级为单机内存模式: ${error.message}`)
			await Promise.allSettled([redisClient?.disconnect(), redisSubscriber?.disconnect()])
			redisClient = null
			redisSubscriber = null
		}
		return activeDriver
	})()
	return initPromise
}

async function register(userId, connectionId) {
	await init()
	const id = String(userId)
	if (activeDriver === 'memory') return registerMemory(id, connectionId)
	const expiry = expiresAt()
	const becameOnline = await redisClient.eval(registerScript, {
		keys: [userKey(id), expirationKey],
		arguments: [String(Date.now()), String(expiry), connectionId, memberName(id, connectionId), String(connectionTtlSeconds * 3)],
	})
	if (Number(becameOnline) === 1) await publishStatus(id, 'online')
}

async function touch(userId, connectionId) {
	await init()
	if (activeDriver === 'memory') return
	const id = String(userId)
	const expiry = expiresAt()
	// 复用原子注册脚本：若进程长时间卡顿导致租约已过期，下一次 pong 能重新触发上线事件。
	const becameOnline = await redisClient.eval(registerScript, {
		keys: [userKey(id), expirationKey],
		arguments: [String(Date.now()), String(expiry), connectionId, memberName(id, connectionId), String(connectionTtlSeconds * 3)],
	})
	if (Number(becameOnline) === 1) await publishStatus(id, 'online')
}

async function remove(userId, connectionId) {
	await init()
	const id = String(userId)
	if (activeDriver === 'memory') return removeMemory(id, connectionId)
	const becameOffline = await redisClient.eval(removeScript, {
		keys: [userKey(id), expirationKey],
		arguments: [connectionId, memberName(id, connectionId), String(Date.now())],
	})
	if (Number(becameOffline) === 1) await publishStatus(id, 'offline')
}

function onStatusChange(listener) {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

function getDriver() {
	return activeDriver
}

module.exports = { init, register, touch, remove, onStatusChange, getDriver }
