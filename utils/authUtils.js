const bcrypt = require('bcryptjs')

/**
 * 加密密码
 * 使用bcrypt库的hash方法来加密明文密码，生成一个安全的哈希值。
 * @param {String} plainTextPassword - 用户的明文密码
 * @returns {Promise<String>} - 返回一个promise，解决时包含加密后的哈希密码
 */
const encryptPassword = async (plainTextPassword) => {
	try {
		// 定义盐的轮数，影响加密的强度和计算时间
		const saltRounds = 10
		// 使用bcrypt的hash方法加密密码，并附加盐
		const hashedPassword = await bcrypt.hash(plainTextPassword, saltRounds)
		return hashedPassword
	} catch (error) {
		throw error
	}
}

/**
 * 验证密码
 * 使用bcrypt库的compare方法来验证用户提供的明文密码与数据库存储的哈希密码是否匹配。
 * @param {string} plainTextPassword - 用户输入的明文密码
 * @param {string} hashedPassword - 数据库中存储的哈希密码
 * @returns {Promise<boolean>} - 返回一个promise，解决时返回一个布尔值，表示密码是否匹配
 */
const verifyPassword = async (plainTextPassword, hashedPassword) => {
	try {
		return await bcrypt.compare(plainTextPassword, hashedPassword)
	} catch (error) {
		throw error
	}
}

module.exports = { encryptPassword, verifyPassword }
