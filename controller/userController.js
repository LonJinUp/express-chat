const userService = require('../services/userService')

/**
 * 注册
 * @param {Object} req
 * @param {Object} res
 */
exports.register = async (req, res) => {
	try {
		const user = await userService.register(req.body)
		const { password, ...userWithoutPassword } = user.toObject()
		res.handleSuccess(userWithoutPassword)
	} catch (error) {
		res.handleError(error.message)
	}
}

/**
 * 登录
 * @param {Object} req
 * @param {Object} res
 */
exports.login = async (req, res, next) => {
	const { username, password } = req.body
	try {
		const user = await userService.login(username, password, {
			deviceName: req.body.deviceName,
			platform: req.body.platform,
			userAgent: req.get('user-agent'),
			ip: req.ip,
		})
		res.handleSuccess(user)
	} catch (error) {
		res.handleError(error.message)
	}
}

/**
 * 获取用户信息
 * @param {Object} req
 * @param {Object} res
 */
exports.getUserInfo = async (req, res) => {
	try {
		const user = await userService.userinfo(req.user.id)
		if (user) {
			res.handleSuccess(user)
		} else {
			res.handleError('暂无此用户')
		}
	} catch (error) {
		res.handleError(error.message)
	}
}

/**
 * 更新用户资料
 * @param {Object} req
 * @param {Object} res
 */
exports.updateProfile = async (req, res) => {
	try {
		const result = await userService.updateProfile(req.user.id, req.body, req.user.sid)
		res.handleSuccess(result)
	} catch (error) {
		res.handleError(error.message)
	}
}

exports.getSessions = async (req, res) => {
	try { res.handleSuccess(await userService.listSessions(req.user.id, req.user.sid)) }
	catch (error) { res.handleError(error.message) }
}

exports.logout = async (req, res) => {
	try {
		if (req.user.sid) {
			await userService.revokeSession(req.user.id, req.user.sid)
			require('../services/realtimeService').revokeSessionConnections(req.user.id, req.user.sid)
		}
		res.handleSuccess(null, '已退出登录')
	} catch (error) { res.handleError(error.message) }
}

exports.revokeSession = async (req, res) => {
	try {
		await userService.revokeSession(req.user.id, req.params.sessionId)
		require('../services/realtimeService').revokeSessionConnections(req.user.id, req.params.sessionId)
		res.handleSuccess(null, '设备已退出')
	} catch (error) { res.handleError(error.message) }
}

exports.revokeOtherSessions = async (req, res) => {
	try {
		const sessions = await userService.listSessions(req.user.id, req.user.sid)
		const count = await userService.revokeOtherSessions(req.user.id, req.user.sid)
		const realtimeService = require('../services/realtimeService')
		sessions.filter((item) => !item.current).forEach((item) => realtimeService.revokeSessionConnections(req.user.id, item.sessionId))
		res.handleSuccess({ count }, '其他设备已退出')
	} catch (error) { res.handleError(error.message) }
}

exports.changePassword = async (req, res) => {
	try {
		const result = await userService.changePassword(req.user.id, req.user.sid, req.body.currentPassword, req.body.newPassword)
		const realtimeService = require('../services/realtimeService')
		result.revokedSessionIds.forEach((sessionId) => realtimeService.revokeSessionConnections(req.user.id, sessionId))
		res.handleSuccess({ revokedDevices: result.revokedSessionIds.length }, '密码已修改')
	} catch (error) { res.handleError(error.message) }
}

exports.getNotificationSettings = async (req, res) => {
	try { res.handleSuccess(await userService.getNotificationSettings(req.user.id)) }
	catch (error) { res.handleError(error.message) }
}

exports.updateNotificationSettings = async (req, res) => {
	try { res.handleSuccess(await userService.updateNotificationSettings(req.user.id, req.body)) }
	catch (error) { res.handleError(error.message) }
}

/**
 * 获取好友列表
 * @param {Object} req
 * @param {Object} res
 */
exports.getFriendList = async (req, res) => {
	try {
		const { page = 1, limit = 10 } = req.query
		const friends = await userService.getFriendList(
			req.user.id,
			parseInt(page),
			parseInt(limit)
		)
		if (friends) {
			res.handleSuccess(friends)
		} else {
			res.handleError('暂无此用户')
		}
	} catch (error) {
		res.handleError(error.message)
	}
}

exports.getFriends = async (userId) => {
	// 获取用户的好友列表
	const friends = await userService.getFriends(userId)
	return friends
}

/**
 * 更新用户在线/离线状态
 * @param {Object} req
 * @param {Object} res
 */
exports.setUserStatus = async (req, res) => {
	console.log(req)
	console.log(res)
	try {
		const user = await userService.changeUserStatus(req.user.id, req.status)
		if (user) {
			res.handleSuccess(user)
		} else {
			res.handleError('暂无此用户')
		}
	} catch (error) {
		res.handleError(error.message)
	}
}
