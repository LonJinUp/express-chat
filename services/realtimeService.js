let pushHandler = null
let revokeSessionHandler = null

function registerPushHandler(handler) {
  pushHandler = handler
}

function registerRevokeSessionHandler(handler) {
  revokeSessionHandler = handler
}

function revokeSessionConnections(userId, sessionId) {
  if (!revokeSessionHandler || !userId || !sessionId) return false
  return revokeSessionHandler(String(userId), String(sessionId))
}

function pushToUser(userId, type, data = {}) {
  if (!pushHandler || !userId) return false
  return pushHandler([String(userId)], type, data)
}

function pushToUsers(userIds, type, data = {}) {
  if (!pushHandler || !Array.isArray(userIds) || !userIds.length) return false
  return pushHandler(userIds.map(String), type, data)
}

module.exports = {
  registerPushHandler,
  registerRevokeSessionHandler,
  revokeSessionConnections,
  pushToUser,
  pushToUsers,
}
