const config = {
	development: {
		BASE_MONGO_URL: 'mongodb://expressChat:lonjin@localhost:27017/expressChat',
		PASSWORD_SECRET: '24434a28-42d2-4db7-91bd-4d8c2daf175c',
	},
	production: {
		BASE_MONGO_URL: 'mongodb://expressChat:lonjin@localhost:27017/expressChat',
		PASSWORD_SECRET: '76c9e72f-c748-4245-aea8-7fe824b92a97',
	},
}
module.exports = config[process.env.NODE_ENV]
