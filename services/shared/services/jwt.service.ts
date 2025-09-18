import cognitoService from './cognito.service';
import getPrismaClient from '../lib/lambdaPrisma';

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
    
    // Get user from database using Cognito ID
    const prisma = await getPrismaClient();
    
    const user = await prisma.user.findUnique({
      where: { cognitoId: cognitoUser.sub },
      select: { id: true, cognitoId: true, email: true, name: true },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      cognitoId: user.cognitoId,
      email: user.email,
      name: user.name || undefined,
    };
  } catch (error) {
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
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
    
    const prisma = await getPrismaClient();
    
    const user = await prisma.user.findUnique({
      where: { cognitoId: decoded.sub },
      select: { id: true, cognitoId: true, email: true, name: true },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      cognitoId: user.cognitoId,
      email: user.email,
      name: user.name || undefined,
    };
  } catch (error) {
    return null;
  }
}
