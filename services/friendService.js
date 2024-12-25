const { UserModel, FriendModel } = require('../model')

/**
 * 根据用户userId查找用户
 * @param {*} userId
 * @returns
 */
const getUserInfoByUserId = async (userId) => {
	const userInfo = await UserModel.findOne({ userId })
	if (!userInfo) {
		throw new Error('该用户不存在')
	}
	return userInfo
}

/**
 * 发送好友请求
 * @param {String} userId
 * @param {String} friendId
 * @returns
 */
const sendFriendRequest = async (userId, friendId) => {
	//查找是否有该用户
	const friendInfo = await getUserInfoByUserId(friendId)

	// 检查是否已经发送过好友请求
	const existingRequest = await FriendModel.findOne({
		user: userId,
		friend: friendInfo._id,
	})
	if (existingRequest) {
		throw new Error('已经发送过好友申请，等待用户确认')
	}

	// 检查是否已经是好友
	const existingFriendship = await FriendModel.findOne({
		user: userId,
		friend: friendInfo._id,
		status: 'accepted',
	})
	if (existingFriendship) {
		throw new Error('已经成为好友，无需添加')
	}

	// 创建新的好友请求
	const newFriendRequest = new FriendModel({
		user: userId,
		friend: friendInfo._id,
		status: 'pending',
	})
	await newFriendRequest.save()

	return newFriendRequest
}

/**
 * 接受好友请求
 * @param {String} userId
 * @param {String} friendId
 * @returns
 */
const acceptFriendRequest = async (userId, friendId) => {
	const friendRequest = await FriendModel.findOneAndUpdate(
		{ user: friendId, friend: userId, status: 'pending' },
		{ status: 'accepted' },
		{ new: true }
	)
	if (!friendRequest) {
		throw new Error('Friend request not found')
	}

	// 将好友ID添加到用户的 friends 列表中
	await UserModel.findByIdAndUpdate(userId, {
		$addToSet: { friends: friendId },
	})
	await UserModel.findByIdAndUpdate(friendId, {
		$addToSet: { friends: userId },
	})

	return friendRequest
}

/**
 * 拒绝好友请求
 * @param {String} userId
 * @param {String} friendId
 * @returns
 */

const rejectFriendRequest = async (userId, friendId) => {
	const friendRequest = await FriendModel.findOneAndUpdate(
		{ user: friendId, friend: userId, status: 'pending' },
		{ status: 'rejected' },
		{ new: true }
	)
	if (!friendRequest) {
		throw new Error('Friend request not found')
	}
	return friendRequest
}

/**
 * 获取最近的好友请求列表
 * @param {String} userId
 * @param {Number} page
 * @param {Number} limit
 * @returns
 */
const getFriendRequests = async (userId, page, limit) => {
	const skip = (page - 1) * limit
	const friendRequests = await FriendModel.find({ friend: userId })
		.populate('user', 'username avatar')
		.skip(skip)
		.limit(limit)
		.sort({ createdAt: -1 })
	const total = await FriendModel.countDocuments({ friend: userId })
	return {
		total,
		page,
		list: friendRequests,
	}
}

module.exports = {
	sendFriendRequest,
	acceptFriendRequest,
	rejectFriendRequest,
	getFriendRequests,
}
