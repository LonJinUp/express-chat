const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../middleware/authMiddleware')
const { globalSearch } = require('../controller/searchController')

router.get('/search', authenticateToken, globalSearch)

module.exports = router
