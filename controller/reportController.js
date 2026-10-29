const reportService = require('../services/reportService')

exports.createMessageReport = async (req, res) => {
	try {
		const report = await reportService.createMessageReport(req.user.id, req.body)
		res.handleSuccess(report, '举报已提交')
	} catch (error) { res.handleError(error.message) }
}

exports.getMyReports = async (req, res) => {
	try {
		res.handleSuccess(await reportService.getMyReports(req.user.id))
	} catch (error) { res.handleError(error.message) }
}

exports.getReportsForReview = async (req, res) => {
	try {
		res.handleSuccess(await reportService.getReportsForReview(req.query.status, req.query.page, req.query.limit))
	} catch (error) { res.handleError(error.message) }
}

exports.updateReportStatus = async (req, res) => {
	try {
		const report = await reportService.updateReportStatus(req.user.id, req.params.reportId, req.body.status, req.body.resolutionNote)
		require('../services/realtimeService').pushToUser(report.reporter, 'report_status_changed', {
			reportId: report._id,
			status: report.status,
			resolutionNote: report.resolutionNote,
		})
		res.handleSuccess(report, '举报状态已更新')
	} catch (error) { res.handleError(error.message) }
}
