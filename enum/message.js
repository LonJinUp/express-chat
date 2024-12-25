module.exports = {
	// 定义各种消息类型的枚举
	MESSAGE_TYPE: {
		// 普通文本消息
		TYPE: 'text',
		// 用户发送的消息推送
		USER_MESSAGE: 'user_message',
		// 好友上线/下线通知
		FRIEND_STATUS_CHANGE: 'friend_status_notification',
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
		// ... 其他消息类型 ...
	},
}
