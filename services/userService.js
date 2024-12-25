const { encryptPassword, verifyPassword, generateUserId } = require('../utils')
const { UserModel } = require('../model')
const { PASSWORD_SECRET } = require('../config/config.default')
const jwt = require('jsonwebtoken')

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
const login = async (username, plainTextPassword) => {
	const user = await UserModel.findOne({ username }).select('password userId')
	if (user && (await verifyPassword(plainTextPassword, user.password))) {
		const token = jwt.sign({ userId: user.userId, username, id: user._id }, PASSWORD_SECRET, { expiresIn: '24h' })
		return { token }
	} else {
		throw new Error('Invalid credentials')
	}
}

/**
 * 获取用户信息
 * @param {String} userId 用户ID
 * @returns
 */
const userinfo = async (userId) => {
	try {
		const user = await UserModel.findById(userId).select('-password')
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
	}).select('-password -friends -groups')

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
	const user = await UserModel.findById(userId).populate('friends')

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
		console.error('Error updating user status:', error)
		throw error
	}
}

module.exports = {
	register,
	login,
	userinfo,
	getFriendList,
	changeUserStatus,
	getFriends,
}
