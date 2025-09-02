import { Request, Response, NextFunction } from 'express';

import prisma from '../lib/prisma.js';
import cognitoService, { CognitoUser } from '../services/cognito.service.js';
import logger from '../utils/logger.js';
import { env } from '../config/env.js';

import { AppError } from './error.middleware.js';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        cognitoId: string;
        email: string;
        name?: string;
        cognitoUser: CognitoUser;
      };
    }
  }
}

/**
 * Middleware to authenticate requests using JWT tokens from Cognito
 * In development mode, allows bypass with special dev token
 */
export const authenticateToken = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      throw new AppError('Access token is required', 401);
    }

    // Development auth bypass
    if (env.isDevelopment && token === 'dev-bypass-token') {
      const testUserId = process.env.TEST_USER_ID || 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
      
      // Get test user from database using raw query to handle field mismatch
      const testUserResult = await prisma.$queryRaw<Array<{
        id: string;
        email: string;
        first_name: string;
        last_name: string;
      }>>`
        SELECT id, email, first_name, last_name
        FROM users 
        WHERE id = ${testUserId}::uuid
      `;

      if (testUserResult && testUserResult.length > 0) {
        const testUser = testUserResult[0];
        const fullName = `${testUser.first_name} ${testUser.last_name}`;
        
        req.user = {
          id: testUser.id,
          cognitoId: 'dev-bypass-cognito-id',
          email: testUser.email,
          name: fullName,
          cognitoUser: {
            sub: 'dev-bypass-cognito-id',
            email: testUser.email,
            name: fullName,
          } as CognitoUser,
        };

        logger.info('🔓 Development auth bypass activated', {
          userId: testUser.id,
          email: testUser.email,
          warning: 'This should ONLY be used in development!',
        });

        return next();
      } else {
        logger.error('Development bypass failed - test user not found', { testUserId });
        throw new AppError('Development test user not found', 500);
      }
    }

    // Verify token with Cognito
    let cognitoUser: CognitoUser;
    try {
      cognitoUser = await cognitoService.verifyToken(token);
    } catch (error: any) {
      logger.warn('Token verification failed', { error: error.message });
      throw new AppError('Invalid or expired token', 401);
    }

    // Get or create user in our database
    let dbUser = await prisma.user.findUnique({
      where: { cognitoId: cognitoUser.sub },
    });

    if (!dbUser) {
      // Create user in database if doesn't exist
      dbUser = await prisma.user.create({
        data: {
          cognitoId: cognitoUser.sub,
          email: cognitoUser.email,
          name: cognitoUser.name || null,
          preferences: {},
        },
      });
      logger.info('Created new user in database', { userId: dbUser.id, email: dbUser.email });
    } else {
      // Update user info if it has changed
      const needsUpdate = dbUser.email !== cognitoUser.email || dbUser.name !== cognitoUser.name;

      if (needsUpdate) {
        dbUser = await prisma.user.update({
          where: { id: dbUser.id },
          data: {
            email: cognitoUser.email,
            name: cognitoUser.name || null,
          },
        });
        logger.info('Updated user info from Cognito', { userId: dbUser.id });
      }
    }

    // Attach user to request object
    req.user = {
      id: dbUser.id,
      cognitoId: dbUser.cognitoId,
      email: dbUser.email,
      cognitoUser,
      ...(dbUser.name && { name: dbUser.name }),
    };

    logger.debug('User authenticated successfully', {
      userId: dbUser.id,
      email: dbUser.email,
    });

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      logger.error('Authentication middleware error', { error });
      next(new AppError('Authentication failed', 401));
    }
  }
};

/**
 * Middleware to optionally authenticate requests
 * Sets req.user if valid token is provided, but doesn't fail if no token
 */
export const optionalAuth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return next(); // No token provided, continue without authentication
    }

    // Try to authenticate, but don't fail if token is invalid
    try {
      const cognitoUser = await cognitoService.verifyToken(token);

      const dbUser = await prisma.user.findUnique({
        where: { cognitoId: cognitoUser.sub },
      });

      if (dbUser) {
        req.user = {
          id: dbUser.id,
          cognitoId: dbUser.cognitoId,
          email: dbUser.email,
          cognitoUser,
          ...(dbUser.name && { name: dbUser.name }),
        };
      }
    } catch (error) {
      // Ignore authentication errors for optional auth
      logger.debug('Optional authentication failed', { error });
    }

    next();
  } catch (error) {
    logger.error('Optional auth middleware error', { error });
    next(); // Continue without authentication
  }
};

/**
 * Middleware to check if user has specific permissions
 */
export const requirePermission = (permission: string) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    // For now, we'll implement basic role-based permissions
    // In the future, this could be expanded to a more sophisticated RBAC system

    // All authenticated users have basic permissions for now
    const userPermissions = ['read:own', 'write:own', 'delete:own'];

    if (!userPermissions.includes(permission)) {
      throw new AppError('Insufficient permissions', 403);
    }

    next();
  };
};

/**
 * Middleware to ensure user owns the resource
 */
export const requireOwnership = (resourceUserIdField = 'userId') => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    // Extract resource user ID from request parameters or body
    const resourceUserId = req.params[resourceUserIdField] || req.body[resourceUserIdField];

    if (resourceUserId && resourceUserId !== req.user.id) {
      throw new AppError('Access denied - resource does not belong to user', 403);
    }

    next();
  };
};

/**
 * Middleware to validate JWT token format without Cognito verification
 * Useful for quickly rejecting malformed tokens
 */
export const validateTokenFormat = (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      throw new AppError('Access token is required', 401);
    }

    // Basic JWT format validation
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new AppError('Invalid token format', 401);
    }

    // Try to decode payload (without verification)
    try {
      if (parts[1]) {
        JSON.parse(Buffer.from(parts[1], 'base64').toString());
      }
    } catch {
      throw new AppError('Invalid token payload', 401);
    }

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      next(new AppError('Token validation failed', 401));
    }
  }
};

/**
 * Middleware to extract user ID from token and add to request params
 * Useful for routes that need to filter by current user
 */
export const injectUserId = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authenticateToken(req, res, () => {
      if (req.user) {
        req.params['userId'] = req.user.id;
        req.body['userId'] = req.user.id;
      }
      next();
    });
  } catch (error) {
    next(error);
  }
};
