const express = require('express')
const router = express.Router()
const controller = require('../controller/e2eeController')
const { authenticateToken } = require('../middleware/authMiddleware')

router.get('/e2ee/status', authenticateToken, controller.getStatus)
router.post('/e2ee/public-key', authenticateToken, controller.registerPublicKey)
router.get('/e2ee/key-backup', authenticateToken, controller.getKeyBackup)
router.put('/e2ee/key-backup', authenticateToken, controller.saveKeyBackup)
router.post('/e2ee/key-reset', authenticateToken, controller.resetKey)
router.post('/e2ee/conversation', authenticateToken, controller.setConversationMode)
module.exports = router
