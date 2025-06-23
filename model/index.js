const mongoose = require('mongoose')

async function main() {
	console.log('====')
	console.log(process.env)
	await mongoose.connect(process.env.BASE_MONGO_URL)
}

main()
	.then((res) => {
		console.log('✅ mongo connection successful')
	})
	.catch((error) => {
		console.log('❌ mongo error:', error)
	})

//导出模块
module.exports = {
	testModel: mongoose.model('testModel', require('./testModel')),
	UserModel: mongoose.model('User', require('./userModel')),
	ConversationModel: mongoose.model('Conversation', require('./conversationModel')),
	MessageModel: mongoose.model('Message', require('./messageModel')),
	GroupModel: mongoose.model('Group', require('./groupsModel')),
	FriendModel: mongoose.model('Friend', require('./friendModel')),
	ConversationReadModel: mongoose.model('ConversationRead', require('./conversationReadModel')),
}
