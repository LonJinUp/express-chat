const rateLimit = require('express-rate-limit')

const json429 = (message) => (req, res) => {
	res.status(429).json({
		code: 0,
		message,
		data: null,
	})
}

/** 登录：同一 IP 15 分钟内最多 30 次 */
exports.authLoginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 30,
	standardHeaders: true,
	legacyHeaders: false,
	handler: json429('登录尝试过于频繁，请稍后再试'),
})

/** 注册：同一 IP 1 小时内最多 10 次 */
exports.authRegisterLimiter = rateLimit({
	windowMs: 60 * 60 * 1000,
	max: 10,
	standardHeaders: true,
	legacyHeaders: false,
	handler: json429('注册请求过于频繁，请稍后再试'),
})
