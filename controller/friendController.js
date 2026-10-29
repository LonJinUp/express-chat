const friendService = require('../services/friendService')
const realtimeService = require('../services/realtimeService')
const { MESSAGE_TYPE } = require('../enum/message')

function currentUserPayload(user) {
	return {
		id: user.id,
		userId: user.userId,
		username: user.username,
		avatar: user.avatar,
	}
}

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
		realtimeService.pushToUser(
			newFriendRequest.friend,
			MESSAGE_TYPE.FRIEND_REQUEST_RECEIVED,
			{
				requestId: newFriendRequest._id,
				status: newFriendRequest.status,
				from: currentUserPayload(req.user),
			}
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
		realtimeService.pushToUser(
			friendId,
			MESSAGE_TYPE.FRIEND_REQUEST_ACCEPTED,
			{
				requestId: friendRequest._id,
				status: friendRequest.status,
				friend: currentUserPayload(req.user),
			}
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
		realtimeService.pushToUser(
			friendId,
			MESSAGE_TYPE.FRIEND_REQUEST_REJECTED,
			{
				requestId: friendRequest._id,
				status: friendRequest.status,
				friend: currentUserPayload(req.user),
			}
		)
		res.handleSuccess()
	} catch (error) {
		res.handleError(error.message)
	}
}

/**
 * 删除好友
 */
exports.removeFriend = async (req, res) => {
	try {
		const { friendId } = req.body
		await friendService.removeFriend(req.user.id, friendId)
		realtimeService.pushToUser(friendId, MESSAGE_TYPE.FRIEND_REMOVED, {
			friendId: req.user.id,
		})
		res.handleSuccess()
	} catch (error) {
		res.handleError(error.message)
	}
}

exports.blockUser = async (req, res) => {
	try {
		const target = await friendService.blockUser(req.user.id, req.body.friendId)
		realtimeService.pushToUser(req.body.friendId, MESSAGE_TYPE.FRIEND_REMOVED, { friendId: req.user.id })
		res.handleSuccess(target, '已加入黑名单')
	} catch (error) { res.handleError(error.message) }
}

exports.unblockUser = async (req, res) => {
	try {
		await friendService.unblockUser(req.user.id, req.body.friendId)
		res.handleSuccess(null, '已移出黑名单')
	} catch (error) { res.handleError(error.message) }
}

exports.getBlockedUsers = async (req, res) => {
	try { res.handleSuccess(await friendService.getBlockedUsers(req.user.id)) }
	catch (error) { res.handleError(error.message) }
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
