require('dotenv-flow').config()
const express = require('express')
const mongoose = require('mongoose')
const helmet = require('helmet')
const expressWs = require('express-ws')
const app = express()

if (process.env.TRUST_PROXY === '1') {
	app.set('trust proxy', 1)
}
const cors = require('cors')
const morgan = require('morgan')
const router = require('./router')
const responseMiddleware = require('./middleware/responseMiddleware')
const { initWebSocket } = require('./socket')

expressWs(app)

// 数据格式解析
app.use(express.json())
app.use(express.urlencoded({ extended: false }))

// 安全响应头（根路径若需内联脚本，已关闭 CSP 避免破坏既有静态页）
app.use(
	helmet({
		contentSecurityPolicy: false,
	})
)

// 响应格式
app.use(responseMiddleware)

// 跨域
app.use(cors())

// 存活探针：仅表示进程可响应，不检查数据库（K8s liveness）
app.get('/health', (req, res) => {
	res.status(200).json({
		ok: true,
		liveness: true,
		uptime: Math.floor(process.uptime()),
	})
})

// 就绪探针：MongoDB 已连接才 200（K8s readiness / 负载均衡摘流）
app.get('/ready', (req, res) => {
	const dbOk = mongoose.connection.readyState === 1
	const states = ['disconnected', 'connected', 'connecting', 'disconnecting']
	res.status(dbOk ? 200 : 503).json({
		ok: dbOk,
		ready: dbOk,
		mongo: dbOk ? 'connected' : states[mongoose.connection.readyState] ?? 'unknown',
		uptime: Math.floor(process.uptime()),
	})
})

//日志记录
app.use(morgan('dev'))

// 路由
app.use('/api/v1', router)

// socket
initWebSocket(app)

app.get('/', (req, res) => {
	res.sendFile(__dirname + '/index.html')
})

const PORT = process.env.PORT || 3001

app.listen(PORT, () => {
	console.log(`✅Server is running on http://localhost:${PORT}`)
})
