const { UserModel, FriendModel } = require('../model')
const mongoose = require('mongoose')

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
	const [sender, blockedByTarget] = await Promise.all([
		UserModel.findById(userId).select('blockedUsers'),
		UserModel.exists({ _id: friendInfo._id, blockedUsers: userId }),
	])
	if (sender?.blockedUsers?.some((id) => id.equals(friendInfo._id))) throw new Error('请先将对方移出黑名单')
	if (blockedByTarget) throw new Error('暂时无法添加该用户')

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
	const blocked = await UserModel.exists({
		$or: [
			{ _id: userId, blockedUsers: friendId },
			{ _id: friendId, blockedUsers: userId },
		],
	})
	if (blocked) throw new Error('当前无法建立好友关系')
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

const blockUser = async (userId, targetId) => {
	if (String(userId) === String(targetId)) throw new Error('不能拉黑自己')
	if (!mongoose.Types.ObjectId.isValid(targetId)) throw new Error('用户不存在')
	const target = await UserModel.findById(targetId).select('username avatar userId')
	if (!target) throw new Error('用户不存在')

	const session = await mongoose.startSession()
	session.startTransaction()
	try {
		await UserModel.findByIdAndUpdate(userId, { $addToSet: { blockedUsers: targetId }, $pull: { friends: targetId } }, { session })
		await UserModel.findByIdAndUpdate(targetId, { $pull: { friends: userId } }, { session })
		await FriendModel.deleteMany({ $or: [{ user: userId, friend: targetId }, { user: targetId, friend: userId }] }).session(session)
		await session.commitTransaction()
		return target
	} catch (error) {
		await session.abortTransaction()
		throw error
	} finally { session.endSession() }
}

const unblockUser = async (userId, targetId) => {
	const result = await UserModel.findOneAndUpdate({ _id: userId, blockedUsers: targetId }, { $pull: { blockedUsers: targetId } })
	if (!result) throw new Error('该用户不在黑名单中')
}

const getBlockedUsers = async (userId) => {
	const user = await UserModel.findById(userId).populate('blockedUsers', 'username avatar userId')
	if (!user) throw new Error('用户不存在')
	return user.blockedUsers || []
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

/**
 * 双向解除好友关系，保留双方历史消息
 */
const removeFriend = async (userId, friendId) => {
	if (userId === friendId) throw new Error('不能删除自己')
	const session = await mongoose.startSession()
	session.startTransaction()
	try {
		const [user, friend] = await Promise.all([
			UserModel.findById(userId).session(session),
			UserModel.findById(friendId).session(session),
		])
		if (!user || !friend) throw new Error('用户不存在')
		if (!user.friends.some((id) => id.toString() === friendId)) throw new Error('对方不是你的好友')

		await UserModel.findByIdAndUpdate(userId, { $pull: { friends: friendId } }, { session })
		await UserModel.findByIdAndUpdate(friendId, { $pull: { friends: userId } }, { session })
		await FriendModel.deleteMany({
			$or: [
				{ user: userId, friend: friendId },
				{ user: friendId, friend: userId },
			],
		}).session(session)

		await session.commitTransaction()
		return friend
	} catch (error) {
		await session.abortTransaction()
		throw error
	} finally {
		session.endSession()
	}
}

module.exports = {
	sendFriendRequest,
	acceptFriendRequest,
	rejectFriendRequest,
	getFriendRequests,
	removeFriend,
	blockUser,
	unblockUser,
	getBlockedUsers,
}
