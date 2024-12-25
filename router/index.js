const express = require('express')
const router = express.Router()
const test = require('./test')
const user = require('./userRoutes')
const firend = require('./friendRouters')
const groups = require('./groupsRouters')
const conversation = require('./conversationRouters')
const message = require('./messageRouters')

router.use(test)
router.use(user)
router.use(firend)
router.use(groups)
router.use(conversation)
router.use(message)

module.exports = router
