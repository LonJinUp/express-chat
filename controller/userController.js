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
		const user = await userService.login(username, password)
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
