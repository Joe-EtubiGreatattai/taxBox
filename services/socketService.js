const { Server } = require('socket.io');

/**
 * Simple wrapper around socket.io instance so controllers/services can emit events
 * without tight coupling to the HTTP server.
 */
let ioInstance = /** @type {Server | null} */ (null);

function setSocketServerInstance(io) {
  ioInstance = io;
}

function getIO() {
  return ioInstance;
}

/**
 * Emit an event to a specific user room.
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {string} event
 * @param {any} payload
 */
function emitToUser(userId, event, payload) {
  if (!ioInstance || !userId) return;
  try {
    const room = userId.toString();
    ioInstance.to(room).emit(event, payload);
  } catch (err) {
    console.error('Socket emitToUser error:', err?.message || err);
  }
}

module.exports = {
  setSocketServerInstance,
  getIO,
  emitToUser,
};
