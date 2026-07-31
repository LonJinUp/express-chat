/** 与 model/messageModel contentType 枚举一致 */
const ALLOWED_CONTENT_TYPES = new Set(['text', 'image', 'file', 'audio'])

const MAX_CONTENT_STRING_LENGTH = parseInt(process.env.WS_MAX_CONTENT_LENGTH || '8000', 10)

/**
 * 校验 WebSocket 聊天 JSON 载荷
 * @returns {{ ok: true, payload: object } | { ok: false, error: string }}
 */
function validateChatPayload(parsed) {
	if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return { ok: false, error: '消息格式无效' }
	}

	const { conversationType, content, contentType, recipientId, groupId, encrypted, nonce, encryptionAlgorithm, clientMessageId, replyTo } = parsed

	if (conversationType !== 'private' && conversationType !== 'group') {
		return { ok: false, error: 'conversationType 须为 private 或 group' }
	}

	if (content == null || content === '') {
		return { ok: false, error: '消息内容不能为空' }
	}
	if (typeof content !== 'string') {
		return { ok: false, error: '消息内容格式无效' }
	}
	if (content.length > MAX_CONTENT_STRING_LENGTH) {
		return { ok: false, error: `消息内容过长（最多 ${MAX_CONTENT_STRING_LENGTH} 字符）` }
	}

	const ct = contentType == null || contentType === '' ? 'text' : contentType
	if (typeof ct !== 'string' || !ALLOWED_CONTENT_TYPES.has(ct)) {
		return { ok: false, error: 'contentType 无效' }
	}

	if (conversationType === 'private') {
		if (recipientId == null || recipientId === '') {
			return { ok: false, error: '私聊需提供 recipientId' }
		}
		if (typeof recipientId !== 'string' && typeof recipientId !== 'number') {
			return { ok: false, error: 'recipientId 格式无效' }
		}
	}

	if (conversationType === 'group') {
		if (groupId == null || groupId === '') {
			return { ok: false, error: '群聊需提供 groupId' }
		}
	}

	const payload = {
		conversationType,
		content,
		contentType: ct,
		recipientId: conversationType === 'private' ? String(recipientId).trim() : undefined,
		groupId: conversationType === 'group' ? String(groupId).trim() : undefined,
		encrypted: encrypted === true,
		nonce: typeof nonce === 'string' ? nonce : '',
		encryptionAlgorithm: typeof encryptionAlgorithm === 'string' ? encryptionAlgorithm : '',
		clientMessageId: typeof clientMessageId === 'string' && clientMessageId.length <= 100 ? clientMessageId : '',
		replyTo: typeof replyTo === 'string' && replyTo.length <= 100 ? replyTo : '',
	}

	return { ok: true, payload }
}

module.exports = {
	validateChatPayload,
	MAX_CONTENT_STRING_LENGTH,
}
