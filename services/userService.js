const { encryptPassword, verifyPassword, generateUserId } = require('../utils')
const { UserModel, SessionModel } = require('../model')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')

const createToken = (user, sessionId) => {
	return jwt.sign(
		{ userId: user.userId, username: user.username, id: user._id, sid: sessionId },
		process.env.PASSWORD_SECRET,
		{ expiresIn: process.env.AUTH_TOKEN_EXPIRES_IN || '30d' }
	)
}

function detectClient(meta = {}) {
	const ua = String(meta.userAgent || '').slice(0, 500)
	const platform = meta.platform || (/iPhone|iPad/i.test(ua) ? 'iOS' : /Android/i.test(ua) ? 'Android' : /Windows/i.test(ua) ? 'Windows' : /Macintosh|Mac OS/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'unknown')
	const browser = /Edg\//i.test(ua) ? 'Edge' : /Chrome|CriOS/i.test(ua) ? 'Chrome' : /Firefox|FxiOS/i.test(ua) ? 'Firefox' : /Safari/i.test(ua) ? 'Safari' : /MicroMessenger/i.test(ua) ? '微信' : 'unknown'
	return { userAgent: ua, platform: String(platform).slice(0, 40), browser, deviceName: String(meta.deviceName || `${browser} · ${platform}`).slice(0, 120), ip: String(meta.ip || '').replace(/^::ffff:/, '').slice(0, 80) }
}

/**
 * 注册
 * @param {Object} userData
 * @returns
 */
const register = async (userData) => {
	// 检查邮箱是否存在
	const existingUser = await UserModel.findOne({ email: userData.email })
	if (existingUser) {
		throw new Error('邮箱已存在')
	}
	const encryptedPassword = await encryptPassword(userData.password)
	const user = new UserModel({
		userId: generateUserId(),
		username: userData.username,
		password: encryptedPassword,
		email: userData.email,
	})
	try {
		await user.save()
		return user
	} catch (error) {
		throw error
	}
}

/**
 * 登录
 * @param {String} username 用户名
 * @param {String} plainTextPassword 密码
 * @returns
 */
const login = async (username, plainTextPassword, meta = {}) => {
	const user = await UserModel.findOne({ username }).select('password userId')
	if (user && (await verifyPassword(plainTextPassword, user.password))) {
		const sessionId = crypto.randomUUID()
		const days = Math.max(1, parseInt(process.env.AUTH_SESSION_DAYS || '30', 10))
		await SessionModel.create({ user: user._id, sessionId, ...detectClient(meta), expiresAt: new Date(Date.now() + days * 86400000) })
		const token = createToken(user, sessionId)
		return { token, sessionId }
	} else {
		throw new Error('Invalid credentials')
	}
}

/**
 * 更新用户资料
 * @param {String} userId 用户ID
 * @param {Object} profile 用户资料
 * @returns {Object} 最新用户资料及刷新后的 token
 */
const updateProfile = async (userId, profile, sessionId) => {
	const user = await UserModel.findById(userId)
	if (!user) throw new Error('暂无此用户')

	const username = typeof profile.username === 'string' ? profile.username.trim() : undefined
	const email = typeof profile.email === 'string' ? profile.email.trim() : undefined
	const avatar = typeof profile.avatar === 'string' ? profile.avatar.trim() : undefined

	if (username !== undefined && username !== user.username) {
		const existingUsername = await UserModel.findOne({ username, _id: { $ne: userId } })
		if (existingUsername) throw new Error('用户名已存在')
		user.username = username
	}

	if (email !== undefined && email !== user.email) {
		const existingEmail = await UserModel.findOne({ email, _id: { $ne: userId } })
		if (existingEmail) throw new Error('邮箱已存在')
		user.email = email
	}

	if (avatar !== undefined) user.avatar = avatar
	user.updatedAt = Date.now()

	try {
		await user.save()
	} catch (error) {
		if (error.code === 11000) throw new Error('用户名或邮箱已存在')
		throw error
	}

	const updatedUser = await UserModel.findById(userId).select('-password -blockedUsers')
	return { user: updatedUser, token: createToken(updatedUser, sessionId) }
}

const listSessions = async (userId, currentSessionId) => {
	const sessions = await SessionModel.find({ user: userId, revokedAt: null, expiresAt: { $gt: new Date() } }).sort({ lastActiveAt: -1 }).lean()
	return sessions.map((item) => ({ sessionId: item.sessionId, deviceName: item.deviceName, platform: item.platform, browser: item.browser, ip: item.ip, createdAt: item.createdAt, lastActiveAt: item.lastActiveAt, current: item.sessionId === currentSessionId }))
}

const revokeSession = async (userId, sessionId) => {
	const session = await SessionModel.findOneAndUpdate({ user: userId, sessionId, revokedAt: null }, { revokedAt: new Date() }, { new: true })
	if (!session) throw new Error('设备会话不存在或已退出')
	return session
}

const revokeOtherSessions = async (userId, currentSessionId) => {
	const result = await SessionModel.updateMany({ user: userId, sessionId: { $ne: currentSessionId }, revokedAt: null }, { revokedAt: new Date() })
	return result.modifiedCount || 0
}

const changePassword = async (userId, currentSessionId, currentPassword, newPassword) => {
	const user = await UserModel.findById(userId).select('password')
	if (!user) throw new Error('暂无此用户')
	if (!(await verifyPassword(currentPassword, user.password))) throw new Error('当前密码不正确')
	if (await verifyPassword(newPassword, user.password)) throw new Error('新密码不能与当前密码相同')

	user.password = await encryptPassword(newPassword)
	user.updatedAt = new Date()
	await user.save()

	const otherSessions = await SessionModel.find({ user: userId, sessionId: { $ne: currentSessionId }, revokedAt: null }).select('sessionId').lean()
	await SessionModel.updateMany({ user: userId, sessionId: { $ne: currentSessionId }, revokedAt: null }, { revokedAt: new Date() })
	return { revokedSessionIds: otherSessions.map((item) => item.sessionId) }
}

const notificationDefaults = { messageSound: true, friendRequestSound: true, showMessagePreview: true }

const getNotificationSettings = async (userId) => {
	const user = await UserModel.findById(userId).select('notificationSettings').lean()
	if (!user) throw new Error('暂无此用户')
	return { ...notificationDefaults, ...(user.notificationSettings || {}) }
}

const updateNotificationSettings = async (userId, settings) => {
	const allowed = ['messageSound', 'friendRequestSound', 'showMessagePreview']
	const update = {}
	allowed.forEach((key) => {
		if (typeof settings[key] === 'boolean') update[`notificationSettings.${key}`] = settings[key]
	})
	if (!Object.keys(update).length) throw new Error('没有可更新的通知设置')
	const user = await UserModel.findByIdAndUpdate(userId, { $set: update }, { new: true }).select('notificationSettings').lean()
	if (!user) throw new Error('暂无此用户')
	return { ...notificationDefaults, ...(user.notificationSettings || {}) }
}

/**
 * 获取用户信息
 * @param {String} userId 用户ID
 * @returns
 */
const userinfo = async (userId) => {
	try {
		const user = await UserModel.findById(userId).select('-password -blockedUsers')
		return user
	} catch (error) {
		throw error
	}
}

/**
 * 获取好友列表
 * @param {String} userId 用户ID
 * @param {Number} page 页码
 * @param {Number} limit 每页显示数量
 * @returns {Object} 包含好友列表和分页信息的对象
 */
const getFriendList = async (userId, page = 1, limit = 10) => {
	const user = await UserModel.findById(userId).select('friends')
	if (!user) {
		throw new Error('User not found')
	}

	const friends = user.friends || []
	const total = friends.length
	const startIndex = (page - 1) * limit
	const endIndex = page * limit

	// 获取分页后的好友ID列表
	const paginatedFriendIds = friends.slice(startIndex, endIndex)

	// 根据好友ID列表查询好友详细信息
	const friendDetails = await UserModel.find({
		_id: { $in: paginatedFriendIds },
	}).select('-password -friends -groups -blockedUsers')

	return {
		total,
		page,
		limit,
		list: friendDetails,
	}
}

/**
 * 获取好友列表
 * @param {String} userId 用户ID
 * @returns {Object} 包含好友列表
 */
const getFriends = async (userId) => {
	const user = await UserModel.findById(userId).populate('friends', '-password -friends -groups -blockedUsers')

	if (!user) {
		throw new Error('User not found')
	}
	return user.friends
}

/**
 * 修改用户在线/离线状态
 * @param {String} userId 用户ID
 * @param {String} newStatus 状态
 * @returns {Object} 用户信息
 */
const changeUserStatus = async (userId, newStatus) => {
	try {
		let user = await UserModel.findByIdAndUpdate(
			userId,
			{ status: newStatus, lastLoginTime: Date.now() },
			{ new: true, useFindAndModify: false }
		)
		if (!user) {
			throw new Error('User not found')
		}
		return user
	} catch (err) {
		console.error('Error updating user status:', err)
		throw err
	}
}

module.exports = {
	register,
	login,
	userinfo,
	updateProfile,
	getFriendList,
	changeUserStatus,
	getFriends,
	listSessions,
	revokeSession,
	revokeOtherSessions,
	changePassword,
	getNotificationSettings,
	updateNotificationSettings,
}
