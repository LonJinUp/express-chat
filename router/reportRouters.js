const express = require('express')
const router = express.Router()
const reportController = require('../controller/reportController')
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware')

router.post('/report/message', authenticateToken, reportController.createMessageReport)
router.get('/report/mine', authenticateToken, reportController.getMyReports)
router.get('/admin/reports', authenticateToken, requireAdmin, reportController.getReportsForReview)
router.put('/admin/reports/:reportId', authenticateToken, requireAdmin, reportController.updateReportStatus)

module.exports = router
