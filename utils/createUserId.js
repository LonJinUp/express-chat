const uuid = require('uuid')

/**
 * 创建用户ID
 * @returns {string} 生成的ID
 */
const generateUserId = () => {
	const timestamp = Date.now().toString()
	const randomPart = uuid.v4().replace(/\D/g, '').slice(0, 5)
	const userId = timestamp + randomPart
	return userId.slice(-15)
}

module.exports = { generateUserId }
