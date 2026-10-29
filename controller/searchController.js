const { UserModel, GroupModel, ConversationModel, ConversationReadModel, MessageModel } = require('../model')

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function globalSearch(req, res) {
	try {
		const keyword = String(req.query.keyword || '').trim().slice(0, 60)
		if (!keyword) return res.handleSuccess({ users: [], groups: [], messages: [] })
		const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 12))
		const regex = new RegExp(escapeRegExp(keyword), 'i')
		const user = await UserModel.findById(req.user.id).select('friends').lean()
		if (!user) throw new Error('用户不存在')
		const [users, groups, privateConversations, joinedGroups] = await Promise.all([
			UserModel.find({ _id: { $in: user.friends || [] }, username: regex }).select('username userId avatar status').limit(limit).lean(),
			GroupModel.find({ members: req.user.id, name: regex }).select('name avatar').limit(limit).lean(),
			ConversationModel.find({ type: 'private', members: req.user.id }).select('_id members').lean(),
			GroupModel.find({ members: req.user.id }).select('_id name').lean(),
		])
		const groupIds = joinedGroups.map(group => group._id)
		const groupConversations = groupIds.length
			? await ConversationModel.find({ type: 'group', group: { $in: groupIds } }).select('_id group').lean()
			: []
		const conversations = [...privateConversations, ...groupConversations]
		const conversationIds = conversations.map(item => item._id)
		if (!conversationIds.length) return res.handleSuccess({ users, groups, messages: [] })

		const [states, messages] = await Promise.all([
			ConversationReadModel.find({ user: req.user.id, conversation: { $in: conversationIds } }).select('conversation clearedAt').lean(),
			MessageModel.find({
				conversationId: { $in: conversationIds },
				contentType: 'text',
				encrypted: false,
				recalledAt: null,
				deletedFor: { $ne: req.user.id },
				content: regex,
			}).populate('sender', 'username avatar').sort({ createdAt: -1 }).limit(limit * 3).lean(),
		])
		const clearedAtMap = new Map(states.map(state => [String(state.conversation), state.clearedAt]))
		const conversationMap = new Map(conversations.map(item => [String(item._id), item]))
		const groupNameMap = new Map(joinedGroups.map(group => [String(group._id), group.name]))
		const peerIds = privateConversations.flatMap(item => item.members.map(String).filter(id => id !== String(req.user.id)))
		const peers = peerIds.length ? await UserModel.find({ _id: { $in: peerIds } }).select('username avatar').lean() : []
		const peerMap = new Map(peers.map(peer => [String(peer._id), peer]))
		const visibleMessages = messages.filter(message => {
			const clearedAt = clearedAtMap.get(String(message.conversationId))
			return !clearedAt || new Date(message.createdAt) > new Date(clearedAt)
		}).slice(0, limit).map(message => {
			const conversation = conversationMap.get(String(message.conversationId))
			const isGroup = Boolean(conversation?.group)
			const peerId = !isGroup ? conversation.members.map(String).find(id => id !== String(req.user.id)) : ''
			return {
				_id: message._id,
				content: message.content,
				createdAt: message.createdAt,
				sender: message.sender,
				conversationId: message.conversationId,
				conversationType: isGroup ? 'group' : 'private',
				targetId: isGroup ? String(conversation.group) : peerId,
				conversationName: isGroup ? (groupNameMap.get(String(conversation.group)) || '群聊') : (peerMap.get(peerId)?.username || '私聊'),
			}
		})
		res.handleSuccess({ users, groups, messages: visibleMessages })
	} catch (error) {
		res.handleError(error.message)
	}
}

module.exports = { globalSearch }
