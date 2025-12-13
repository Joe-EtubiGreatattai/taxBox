const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const { emitToUser } = require('./socketService');

/**
 * Permanently delete a user and clean up associated resources.
 * This is used both by scheduled purging and admin hard-deletes.
 */
async function hardDeleteUserById(userId, options = {}) {
  const { reason } = options;

  const user = await User.findById(userId);
  if (!user) {
    return { deleted: false };
  }

  // Clean up profile photo file if stored under /uploads
  try {
    if (user.profilePhotoUrl && user.profilePhotoUrl.startsWith('/uploads/')) {
      const oldPath = path.join(
        __dirname,
        '..',
        user.profilePhotoUrl.replace('/uploads', 'uploads')
      );
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }
  } catch (cleanupError) {
    console.warn('hardDeleteUserById: could not clean up profile photo:', cleanupError.message);
  }

  await User.findByIdAndDelete(userId);

  try {
    emitToUser(userId, 'account:deleted', { reason });
  } catch (emitError) {
    console.warn('hardDeleteUserById: emitToUser failed:', emitError.message);
  }

  return { deleted: true };
}

module.exports = {
  hardDeleteUserById,
};
