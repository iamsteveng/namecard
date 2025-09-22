import cognitoService from './cognito.service';
import getPrismaClient from '../lib/lambdaPrisma';
import logger from '../utils/lambdaLogger';

export interface AuthenticatedUser {
  id: string;
  cognitoId: string;
  email: string;
  name?: string;
}

/**
 * Extract and verify JWT token from Authorization header
 */
export async function verifyAuthToken(authHeader: string | undefined): Promise<AuthenticatedUser | null> {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  
  try {
    // Verify token with Cognito service
    const cognitoUser = await cognitoService.verifyToken(token);

    try {
      // Attempt to resolve persisted user for additional metadata
      const prisma = await getPrismaClient();

      const user = await prisma.user.findUnique({
        where: { cognitoId: cognitoUser.sub },
        select: { id: true, cognitoId: true, email: true, name: true },
      });

      if (user) {
        return {
          id: user.id,
          cognitoId: user.cognitoId,
          email: user.email,
          name: user.name || undefined,
        };
      }

      logger.warn('verifyAuthToken: user not found in database, falling back to token payload', {
        cognitoSub: cognitoUser.sub,
      });
    } catch (dbError) {
      const message = dbError instanceof Error ? dbError.message : String(dbError);
      logger.warn('verifyAuthToken: database lookup failed, falling back to token payload', {
        error: message,
        isPrismaInitError: message.includes('did not initialize yet'),
      });
    }

    return {
      id: cognitoUser.sub,
      cognitoId: cognitoUser.sub,
      email: cognitoUser.email ?? '',
      name: cognitoUser.name || undefined,
    };
  } catch (error) {
    logger.error('verifyAuthToken failed', error instanceof Error ? error : undefined);
    return null;
  }
}

/**
 * Simplified token verification for development/testing
 * Note: This should only be used for development purposes
 */
export async function verifyAuthTokenSimple(authHeader: string | undefined): Promise<AuthenticatedUser | null> {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  
  try {
    // For development purposes, we'll decode without verification
    // In production, use proper JWT verification
    const payload = token.split('.')[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const decoded = JSON.parse(Buffer.from(padded, 'base64').toString());
    logger.info('verifyAuthTokenSimple decoded token', {
      hasSub: Boolean(decoded?.sub),
      hasEmail: Boolean(decoded?.email),
    });
    
    const userId = (decoded.sub as string) || (decoded['custom:userId'] as string);
    if (!userId) {
      logger.warn('verifyAuthTokenSimple missing user identifier');
      return null;
    }

    return {
      id: userId,
      cognitoId: userId,
      email: (decoded.email as string) ?? '',
      name: (decoded.name as string) || undefined,
    };
  } catch (error) {
    logger.error('verifyAuthTokenSimple failed', error instanceof Error ? error : undefined);
    return null;
  }
}
