module.exports = {
	// 定义各种消息类型的枚举
	MESSAGE_TYPE: {
		// 普通文本消息
		TYPE: 'text',
		// 用户发送的消息推送
		USER_MESSAGE: 'user_message',
		// 好友上线/下线通知
		FRIEND_STATUS_CHANGE: 'friend_status_notification',
		// 收到新的好友请求
		FRIEND_REQUEST_RECEIVED: 'friend_request_received',
		// 好友请求已被接受
		FRIEND_REQUEST_ACCEPTED: 'friend_request_accepted',
		// 好友请求已被拒绝
		FRIEND_REQUEST_REJECTED: 'friend_request_rejected',
		// 好友关系已解除
		FRIEND_REMOVED: 'friend_removed',
		// 好友已登记端到端加密公钥
		E2EE_KEY_READY: 'e2ee_key_ready',
		// 私聊端到端加密模式发生变化
		E2EE_MODE_CHANGED: 'e2ee_mode_changed',
		// 消息被发送者撤回
		MESSAGE_RECALLED: 'message_recalled',
		MESSAGE_REACTION: 'message_reaction',
		// 群组消息
		GROUP_MESSAGE: 'group_message',
		// 系统通知
		SYSTEM_NOTIFICATION: 'system_notification',
		// 群组邀请
		GROUP_INVITATION: 'group_invitation',
		//发送消息成功
		MESSAGE_SENT_CONFIRMATION: 'message_success',
		//消息发送失败
		MESSAGE_SEND_ERROR: 'message_error',
		// WebSocket 首包鉴权成功
		AUTH_SUCCESS: 'auth_success',
		// 对端正在输入（短暂状态，不入库）
		TYPING: 'typing',
		// 会话成员更新了已读时间
		CONVERSATION_READ: 'conversation_read',
	},
}
