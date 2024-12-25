const express = require('express')
const router = express.Router()
const testController = require('../controller/testController')

router.post('/test/add', testController.add)

module.exports = router
