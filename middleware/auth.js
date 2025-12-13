const { clerkClient, requireAuth } = require('@clerk/express');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Authentication middleware supporting both Custom JWT and Clerk
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'No token provided'
    });
  }

  // 1. Try Custom JWT Verification (Phone Auth)
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key');

    // If verification succeeds, find the user
    const user = await User.findById(decoded.userId);

    if (user) {
      if (!user.isActive || user.isSuspended || user.deleteRequestedAt) {
        return res.status(401).json({
          success: false,
          message: 'User account is inactive, suspended, or pending deletion'
        });
      }

      req.user = user;
      return next();
    }
    // If user not found by ID, fall through to Clerk check (unlikely but safe)
  } catch (jwtError) {
    // JWT verification failed (invalid signature, expired, or malformed)
    // This is expected if it's a Clerk token, so we proceed to Clerk verification
    // console.log('Custom JWT verification failed, trying Clerk...', jwtError.message);
  }

  // 2. Try Clerk Verification (Social Auth)
  // Use Clerk's requireAuth to verify the token
  requireAuth()(req, res, async (err) => {
    if (err) {
      return res.status(401).json({
        success: false,
        message: 'Unauthenticated',
        error: err.message
      });
    }

    try {
      const { userId } = req.auth;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token payload'
        });
      }

      // Find user in our DB by Clerk ID
      let user = await User.findOne({ clerkId: userId });

      // If not found by Clerk ID, try to find by email (migration/first login)
      if (!user) {
        try {
          const clerkUser = await clerkClient.users.getUser(userId);
          const email = clerkUser.emailAddresses[0]?.emailAddress;

          if (email) {
            user = await User.findOne({ email });

            if (user) {
              // Existing user found by email, link Clerk ID
              user.clerkId = userId;
              await user.save();
            } else {
              // New user, create account
              user = new User({
                clerkId: userId,
                email: email,
                name: `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || 'User',
                phone: clerkUser.phoneNumbers[0]?.phoneNumber || undefined,
                // Password not needed for Clerk users
              });
              await user.save();
            }
          }
        } catch (clerkError) {
          console.error('Error fetching user from Clerk:', clerkError);
          // If we can't fetch from Clerk, we can't sync/create, so fail
          return res.status(500).json({
            success: false,
            message: 'Error syncing user profile'
          });
        }
      }

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User could not be created or found'
        });
      }

      if (!user.isActive || user.isSuspended || user.deleteRequestedAt) {
        return res.status(401).json({
          success: false,
          message: 'User not found or account inactive'
        });
      }

      req.user = user;
      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      res.status(500).json({
        success: false,
        message: 'Authentication failed'
      });
    }
  });
};

// Optional authentication middleware
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next();
  }

  // 1. Try Custom JWT
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key');
    const user = await User.findById(decoded.userId);
    if (user && user.isActive && !user.isSuspended && !user.deleteRequestedAt) {
      req.user = user;
      return next();
    }
  } catch (e) {
    // Ignore error, try Clerk
  }

  // 2. Try Clerk
  requireAuth()(req, res, async (err) => {
    if (err) return next(); // Invalid token, just continue as guest

    try {
      const { userId } = req.auth;
      if (!userId) return next();

      const user = await User.findOne({ clerkId: userId });
      if (user && user.isActive && !user.isSuspended && !user.deleteRequestedAt) {
        req.user = user;
      }
      next();
    } catch (error) {
      next();
    }
  });
};

module.exports = { authenticateToken, optionalAuth };