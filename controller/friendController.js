const friendService = require('../services/friendService')

/**
 * 发起好友请求
 * @param {*} req
 * @param {*} res
 */
exports.sendFriendRequest = async (req, res) => {
	try {
		const { friendId } = req.body
		const { id: userId } = req.user
		const newFriendRequest = await friendService.sendFriendRequest(
			userId,
			friendId
		)
		res.handleSuccess()
	} catch (error) {
		res.handleError(error.message)
	}
}

/**
 * 同意好友请求
 * @param {*} req
 * @param {*} res
 */
exports.acceptFriendRequest = async (req, res) => {
	try {
		const { friendId } = req.body
		const { id: userId } = req.user
		const friendRequest = await friendService.acceptFriendRequest(
			userId,
			friendId
		)
		res.handleSuccess()
	} catch (error) {
		res.handleError(error.message)
	}
}

/**
 * 拒绝好友请求
 * @param {*} req
 * @param {*} res
 */
exports.rejectFriendRequest = async (req, res) => {
	try {
		const { friendId } = req.body
		const { id: userId } = req.user
		const friendRequest = await friendService.rejectFriendRequest(
			userId,
			friendId
		)
		res.handleSuccess()
	} catch (error) {
		res.handleError(error.message)
	}
}

/**
 * 获取最近添加好友请求列表
 * @param {*} req
 * @param {*} res
 */
exports.getFriendRequests = async (req, res) => {
	try {
		const { id: userId } = req.user
		const { page = 1, limit = 10 } = req.query
		const friendRequests = await friendService.getFriendRequests(
			userId,
			parseInt(page),
			parseInt(limit)
		)
		res.handleSuccess(friendRequests)
	} catch (error) {
		res.handleError(error.message)
	}
}
