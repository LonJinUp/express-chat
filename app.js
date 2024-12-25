const express = require('express')
const expressWs = require('express-ws')
const app = express()
const cors = require('cors')
const morgan = require('morgan')
const router = require('./router')
const responseMiddleware = require('./middleware/responseMiddleware')
const { initWebSocket } = require('./socket')

expressWs(app)

// 数据格式解析
app.use(express.json())
app.use(express.urlencoded())

// 响应格式
app.use(responseMiddleware)

// 跨域
app.use(cors())

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