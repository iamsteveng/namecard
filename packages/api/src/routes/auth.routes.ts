import type {
  // RegisterRequest, // Currently unused
  RegisterResponse,
  // LoginRequest, // Currently unused
  LoginResponse,
  // LogoutRequest, // Currently unused
  LogoutResponse,
  // RefreshTokenRequest, // Currently unused
  RefreshTokenResponse,
  GetUserProfileResponse,
  UpdateUserProfileRequest,
  UpdateUserProfileResponse
} from '@namecard/shared';
import { Router, Request, Response } from 'express';

import prisma from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { asyncHandler, AppError } from '../middleware/error.middleware.js';
import {
  validateUserLogin,
  validateUserRegistration,
} from '../middleware/validation.middleware.js';
import cognitoService from '../services/cognito.service.js';
import logger from '../utils/logger.js';

const router = Router();

// POST /api/v1/auth/register
router.post(
  '/register',
  validateUserRegistration,
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password, name } = req.body;

    try {
      logger.info('Registering new user', { email, name });

      // Check if user already exists in our database
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        throw new AppError('User with this email already exists', 409);
      }

      // Register user with Cognito
      const { userSub } = await cognitoService.registerUser(email, password, name);

      // Create user in our database
      const user = await prisma.user.create({
        data: {
          cognitoId: userSub,
          email,
          name,
          preferences: {},
        },
      });

      logger.info('User registered successfully', {
        userId: user.id,
        email: user.email,
        cognitoId: userSub,
      });

      const response: RegisterResponse = {
        success: true,
        data: {
          user: {
            id: user.id,
            cognitoId: user.cognitoId,
            email: user.email,
            name: user.name || undefined,
            avatarUrl: user.avatarUrl || undefined,
            preferences: user.preferences as any,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          },
          session: {
            user: {
              id: user.id,
              cognitoId: user.cognitoId,
              email: user.email,
              name: user.name || undefined,
              avatarUrl: user.avatarUrl || undefined,
              preferences: user.preferences as any,
              createdAt: user.createdAt,
              updatedAt: user.updatedAt,
            },
            accessToken: '', // Will be provided after login
            expiresAt: new Date(),
          },
        },
        message: 'User registered successfully. Please log in to get access tokens.',
      };

      res.status(201).json(response);
    } catch (error: any) {
      logger.error('Registration failed - detailed error:', {
        email,
        message: error.message,
        name: error.name,
        code: error.code,
        stack: error.stack?.substring(0, 500),
      });

      if (error instanceof AppError) {
        throw error;
      }

      // Handle Cognito-specific errors
      if (error.message.includes('UsernameExistsException')) {
        throw new AppError('User with this email already exists', 409);
      } else if (error.message.includes('InvalidPasswordException')) {
        throw new AppError('Password does not meet requirements', 400);
      } else if (error.message.includes('InvalidParameterException')) {
        throw new AppError('Invalid email format', 400);
      }

      throw new AppError(`Registration failed: ${error.message}`, 500);
    }
  })
);

// POST /api/v1/auth/login
router.post(
  '/login',
  validateUserLogin,
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    try {
      logger.info('User login attempt', { email });

      // Authenticate with Cognito
      const authResult = await cognitoService.authenticateUser(email, password);

      if (authResult.challengeName) {
        // Handle auth challenges (e.g., force password change)
        return res.json({
          success: false,
          requiresChallenge: true,
          challengeName: authResult.challengeName,
          session: authResult.session,
          message: 'Authentication challenge required',
        });
      }

      // Get or update user in our database
      let user = await prisma.user.findUnique({
        where: { cognitoId: authResult.user.sub },
      });

      if (!user) {
        // Create user if doesn't exist (shouldn't happen normally)
        user = await prisma.user.create({
          data: {
            cognitoId: authResult.user.sub,
            email: authResult.user.email,
            name: authResult.user.name || null,
            preferences: {},
          },
        });
        logger.info('Created user during login', { userId: user.id });
      } else {
        // Update user info if changed
        const needsUpdate =
          user.email !== authResult.user.email || user.name !== authResult.user.name;

        if (needsUpdate) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              email: authResult.user.email,
              name: authResult.user.name || null,
            },
          });
          logger.info('Updated user during login', { userId: user.id });
        }
      }

      logger.info('User logged in successfully', {
        userId: user.id,
        email: user.email,
      });

      const response: LoginResponse = {
        success: true,
        data: {
          user: {
            id: user.id,
            cognitoId: user.cognitoId,
            email: user.email,
            name: user.name || undefined,
            avatarUrl: user.avatarUrl || undefined,
            preferences: user.preferences as any,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          },
          session: {
            user: {
              id: user.id,
              cognitoId: user.cognitoId,
              email: user.email,
              name: user.name || undefined,
              avatarUrl: user.avatarUrl || undefined,
              preferences: user.preferences as any,
              createdAt: user.createdAt,
              updatedAt: user.updatedAt,
            },
            accessToken: authResult.accessToken,
            refreshToken: authResult.refreshToken,
            expiresAt: new Date(Date.now() + authResult.expiresIn * 1000),
          },
        },
        message: 'Login successful',
      };

      res.json(response);
    } catch (error: any) {
      logger.error('Login failed', { email, error: error.message });

      // Handle Cognito-specific errors
      if (error.message.includes('NotAuthorizedException')) {
        throw new AppError('Invalid email or password', 401);
      } else if (error.message.includes('UserNotConfirmedException')) {
        throw new AppError('Account not verified. Please check your email.', 401);
      } else if (error.message.includes('UserNotFoundException')) {
        throw new AppError('Invalid email or password', 401);
      } else if (error.message.includes('TooManyRequestsException')) {
        throw new AppError('Too many login attempts. Please try again later.', 429);
      }

      throw new AppError('Login failed. Please try again.', 401);
    }
  })
);

// POST /api/v1/auth/logout
router.post(
  '/logout',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

      if (token) {
        // Sign out user globally in Cognito (invalidates all tokens)
        await cognitoService.globalSignOut(token);
        logger.info('User logged out successfully', { userId: req.user?.id });
      }

      const response: LogoutResponse = {
        success: true,
        data: {
          message: 'Logged out successfully',
        },
      };

      res.json(response);
    } catch (error: any) {
      logger.error('Logout failed', { error: error.message });
      // Even if logout fails, we should return success to the client
      res.json({
        success: true,
        data: {
          message: 'Logged out successfully',
        },
      });
    }
  })
);

// POST /api/v1/auth/refresh
router.post(
  '/refresh',
  asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError('Refresh token is required', 400);
    }

    try {
      logger.info('Refreshing access token');

      // Refresh token with Cognito
      const authResult = await cognitoService.refreshToken(refreshToken);

      const response: RefreshTokenResponse = {
        success: true,
        data: {
          accessToken: authResult.accessToken,
          expiresAt: new Date(Date.now() + authResult.expiresIn * 1000),
        },
      };

      res.json(response);
    } catch (error: any) {
      logger.error('Token refresh failed', { error: error.message });

      if (
        error.message.includes('NotAuthorizedException') ||
        error.message.includes('TokenExpiredException')
      ) {
        throw new AppError('Refresh token is invalid or expired', 401);
      }

      throw new AppError('Token refresh failed', 500);
    }
  })
);

// GET /api/v1/auth/profile
router.get(
  '/profile',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError('User not authenticated', 401);
    }

    try {
      // Get full user data from database
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: {
          _count: {
            select: {
              cards: true,
            },
          },
        },
      });

      if (!user) {
        throw new AppError('User not found', 404);
      }

      const response: GetUserProfileResponse = {
        success: true,
        data: {
          id: user.id,
          email: user.email,
          name: user.name || undefined,
          avatarUrl: user.avatarUrl || undefined,
          preferences: user.preferences as any,
          cardCount: user._count.cards,
          lastActivity: user.updatedAt,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      };

      res.json(response);
    } catch (error: any) {
      logger.error('Get profile failed', { userId: req.user.id, error: error.message });

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError('Failed to get user profile', 500);
    }
  })
);

// PUT /api/v1/auth/profile
router.put(
  '/profile',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError('User not authenticated', 401);
    }

    const { name, avatarUrl, preferences } = req.body;

    try {
      // Validate input
      if (name !== undefined && (typeof name !== 'string' || name.trim().length < 1)) {
        throw new AppError('Name must be a non-empty string', 400);
      }

      if (avatarUrl !== undefined && avatarUrl !== null && typeof avatarUrl !== 'string') {
        throw new AppError('Avatar URL must be a string', 400);
      }

      // Update user in database
      const updateData: any = {};
      if (name !== undefined) updateData.name = name.trim();
      if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
      if (preferences !== undefined) updateData.preferences = preferences;

      const updatedUser = await prisma.user.update({
        where: { id: req.user.id },
        data: updateData,
        include: {
          _count: {
            select: {
              cards: true,
            },
          },
        },
      });

      logger.info('Profile updated successfully', {
        userId: updatedUser.id,
        updatedFields: Object.keys(updateData),
      });

      const response = {
        success: true,
        data: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name || undefined,
          avatarUrl: updatedUser.avatarUrl || undefined,
          preferences: updatedUser.preferences as any,
          cardCount: updatedUser._count.cards,
          lastActivity: updatedUser.updatedAt,
          createdAt: updatedUser.createdAt,
          updatedAt: updatedUser.updatedAt,
        },
        message: 'Profile updated successfully',
      };

      res.json(response);
    } catch (error: any) {
      logger.error('Profile update failed', { userId: req.user.id, error: error.message });

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError('Failed to update user profile', 500);
    }
  })
);

// POST /api/v1/auth/forgot-password
router.post(
  '/forgot-password',
  asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;

    if (!email) {
      throw new AppError('Email is required', 400);
    }

    try {
      logger.info('Forgot password initiated', { email });

      // Check if user exists in our database
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        // Don't reveal if user exists or not for security
        return res.json({
          success: true,
          data: {
            message: 'If an account with this email exists, a password reset link has been sent.',
          },
        });
      }

      // Initiate forgot password flow with Cognito
      await cognitoService.forgotPassword(email);

      res.json({
        success: true,
        data: {
          message: 'If an account with this email exists, a password reset link has been sent.',
        },
      });
    } catch (error: any) {
      logger.error('Forgot password failed', { email, error: error.message });

      // Always return success for security
      res.json({
        success: true,
        data: {
          message: 'If an account with this email exists, a password reset link has been sent.',
        },
      });
    }
  })
);

// POST /api/v1/auth/reset-password
router.post(
  '/reset-password',
  asyncHandler(async (req: Request, res: Response) => {
    const { email, confirmationCode, newPassword } = req.body;

    if (!email || !confirmationCode || !newPassword) {
      throw new AppError('Email, confirmation code, and new password are required', 400);
    }

    try {
      logger.info('Password reset confirmation', { email });

      // Confirm forgot password with Cognito
      await cognitoService.confirmForgotPassword(email, confirmationCode, newPassword);

      res.json({
        success: true,
        data: {
          message: 'Password reset successful. You can now log in with your new password.',
        },
      });
    } catch (error: any) {
      logger.error('Password reset failed', { email, error: error.message });

      if (error.message.includes('CodeMismatchException')) {
        throw new AppError('Invalid confirmation code', 400);
      } else if (error.message.includes('ExpiredCodeException')) {
        throw new AppError('Confirmation code has expired', 400);
      } else if (error.message.includes('InvalidPasswordException')) {
        throw new AppError('Password does not meet requirements', 400);
      }

      throw new AppError('Password reset failed. Please try again.', 400);
    }
  })
);

export default router;
