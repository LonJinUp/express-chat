const mongoose = require('mongoose')

mongoose.set('bufferCommands', false)

let connectingPromise = null
let retryTimer = null

function retryDelay() {
	return Math.max(1000, parseInt(process.env.MONGO_RETRY_INTERVAL_MS || '3000', 10))
}

function scheduleReconnect() {
	if (retryTimer || mongoose.connection.readyState === 1) return
	retryTimer = setTimeout(() => {
		retryTimer = null
		connectMongo()
	}, retryDelay())
	retryTimer.unref?.()
}

async function connectMongo() {
	if (mongoose.connection.readyState === 1) return mongoose.connection
	if (connectingPromise) return connectingPromise
	const serverSelectionTimeoutMS = Math.max(1000, parseInt(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || '5000', 10))
	connectingPromise = mongoose.connect(process.env.BASE_MONGO_URL, { serverSelectionTimeoutMS })
		.then(() => {
			console.log('✅ mongo connection successful')
			return mongoose.connection
		})
		.catch((error) => {
			console.error(`❌ mongo unavailable: ${error.message}; retrying in ${retryDelay()}ms`)
			scheduleReconnect()
			return null
		})
		.finally(() => { connectingPromise = null })
	return connectingPromise
}

mongoose.connection.on('disconnected', () => {
	console.warn('⚠️ mongo disconnected; waiting to reconnect')
	scheduleReconnect()
})

connectMongo()

module.exports = {
	testModel: mongoose.model('testModel', require('./testModel')),
	UserModel: mongoose.model('User', require('./userModel')),
	ConversationModel: mongoose.model('Conversation', require('./conversationModel')),
	MessageModel: mongoose.model('Message', require('./messageModel')),
	CounterModel: mongoose.model('Counter', require('./counterModel')),
	MessageReportModel: mongoose.model('MessageReport', require('./messageReportModel')),
	MessageFavoriteModel: mongoose.model('MessageFavorite', require('./messageFavoriteModel')),
	GroupModel: mongoose.model('Group', require('./groupsModel')),
	GroupInvitationModel: mongoose.model('GroupInvitation', require('./groupInvitationModel')),
	GroupJoinRequestModel: mongoose.model('GroupJoinRequest', require('./groupJoinRequestModel')),
	FriendModel: mongoose.model('Friend', require('./friendModel')),
	ConversationReadModel: mongoose.model('ConversationRead', require('./conversationReadModel')),
	SessionModel: mongoose.model('Session', require('./sessionModel')),
	connectMongo,
}
