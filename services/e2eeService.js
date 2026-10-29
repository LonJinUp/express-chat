const { UserModel, ConversationModel } = require('../model')

function globallyEnabled() {
	return String(process.env.E2EE_ENABLED || 'false').toLowerCase() === 'true'
}

async function registerPublicKey(userId, publicKey) {
	if (!globallyEnabled()) throw new Error('服务器未开启端到端加密')
	if (typeof publicKey !== 'string' || publicKey.length < 32 || publicKey.length > 256) {
		throw new Error('无效的端到端加密公钥')
	}
	const user = await UserModel.findByIdAndUpdate(
		userId,
		{ e2eePublicKey: publicKey },
		{ new: true }
	).select('friends')
	if (!user) throw new Error('用户不存在')
	return user
}

async function getKeyBackup(userId) {
	if (!globallyEnabled()) throw new Error('服务器未开启端到端加密')
	const user = await UserModel.findById(userId).select('e2eePublicKey e2eeKeyBackup')
	if (!user) throw new Error('用户不存在')
	const backup = user.e2eeKeyBackup
	if (!backup?.ciphertext) {
		return { exists: false, publicKey: user.e2eePublicKey || '' }
	}
	return {
		exists: true,
		publicKey: backup.publicKey || user.e2eePublicKey || '',
		ciphertext: backup.ciphertext,
		nonce: backup.nonce,
		salt: backup.salt,
		iterations: backup.iterations,
		algorithm: backup.algorithm,
		updatedAt: backup.updatedAt,
	}
}

async function saveKeyBackup(userId, payload) {
	if (!globallyEnabled()) throw new Error('服务器未开启端到端加密')
	const fields = ['ciphertext', 'nonce', 'salt', 'algorithm', 'publicKey']
	if (fields.some((key) => typeof payload[key] !== 'string' || !payload[key])) {
		throw new Error('加密密钥备份数据不完整')
	}
	if (payload.ciphertext.length > 4096 || payload.nonce.length > 256 || payload.salt.length > 256) {
		throw new Error('加密密钥备份数据过大')
	}
	const iterations = Number(payload.iterations)
	if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) {
		throw new Error('无效的密钥派生参数')
	}
	if (payload.algorithm !== 'pbkdf2-sha256+nacl-secretbox-v1') {
		throw new Error('不支持的密钥备份算法')
	}
	const user = await UserModel.findById(userId).select('e2eePublicKey')
	if (!user) throw new Error('用户不存在')
	if (!user.e2eePublicKey || user.e2eePublicKey !== payload.publicKey) {
		throw new Error('备份公钥与当前账号不一致')
	}
	await UserModel.findByIdAndUpdate(userId, {
		e2eeKeyBackup: {
			ciphertext: payload.ciphertext,
			nonce: payload.nonce,
			salt: payload.salt,
			iterations,
			algorithm: payload.algorithm,
			publicKey: payload.publicKey,
			updatedAt: new Date(),
		},
	})
	return { exists: true }
}

async function resetKey(userId, publicKey) {
	if (!globallyEnabled()) throw new Error('服务器未开启端到端加密')
	if (typeof publicKey !== 'string' || publicKey.length < 32 || publicKey.length > 256) throw new Error('无效的端到端加密公钥')
	const user = await UserModel.findById(userId)
	if (!user) throw new Error('用户不存在')
	const encryptedConversations = await ConversationModel.find({ type: 'private', members: userId, encryptionMode: 'e2ee' }).select('_id members').lean()
	user.e2eePublicKey = publicKey
	user.e2eeKeyBackup = { ciphertext: '', nonce: '', salt: '', iterations: 0, algorithm: '', publicKey: '', updatedAt: new Date() }
	await user.save()
	await ConversationModel.updateMany({ type: 'private', members: userId, encryptionMode: 'e2ee' }, { $set: { encryptionMode: 'plaintext' } })
	return encryptedConversations
}

async function getStatus(userId, peerId) {
	const [user, peer] = await Promise.all([
		UserModel.findById(userId).select('e2eePublicKey'),
		UserModel.findById(peerId).select('e2eePublicKey username'),
	])
	if (!user || !peer) throw new Error('用户不存在')
	const conversation = await ConversationModel.findOne({
		type: 'private',
		members: { $all: [userId, peerId] },
	})
	return {
		enabled: globallyEnabled(),
		ownPublicKey: user.e2eePublicKey || '',
		peerPublicKey: peer.e2eePublicKey || '',
		conversationId: conversation?._id || null,
		encryptionMode: conversation?.encryptionMode || 'plaintext',
	}
}

async function setConversationMode(userId, peerId, enabled) {
	if (enabled && !globallyEnabled()) throw new Error('服务器未开启端到端加密')
	const peer = await UserModel.findById(peerId).select('e2eePublicKey')
	const user = await UserModel.findById(userId).select('e2eePublicKey friends')
	if (!peer || !user) throw new Error('用户不存在')
	if (!user.friends.some((id) => id.toString() === peerId)) throw new Error('仅好友可以开启加密私聊')
	if (enabled && (!user.e2eePublicKey || !peer.e2eePublicKey)) throw new Error('双方尚未准备好加密密钥')
	const conversation = await ConversationModel.findOneAndUpdate(
		{ type: 'private', members: { $all: [userId, peerId] } },
		{ $setOnInsert: { type: 'private', members: [userId, peerId] }, $set: { encryptionMode: enabled ? 'e2ee' : 'plaintext' } },
		{ upsert: true, new: true }
	)
	return conversation
}

module.exports = {
	globallyEnabled,
	registerPublicKey,
	getKeyBackup,
	saveKeyBackup,
	resetKey,
	getStatus,
	setConversationMode,
}
