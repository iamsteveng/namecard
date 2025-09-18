// Authentication utilities for Lambda functions
import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { AuthToken } from '../types/index.js';

// Extract JWT token from Authorization header
export function extractTokenFromEvent(event: APIGatewayProxyEvent): string | null {
  const authHeader = event.headers.Authorization || event.headers.authorization;
  
  if (!authHeader) {
    return null;
  }

  // Handle "Bearer <token>" format
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Handle direct token
  return authHeader;
}

// Verify JWT token
export function verifyJwtToken(token: string, secret?: string): AuthToken | null {
  try {
    const jwtSecret = secret || process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET not configured');
      return null;
    }

    const decoded = jwt.verify(token, jwtSecret) as AuthToken;
    return decoded;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
}

// Generate JWT token
export function generateJwtToken(
  payload: Omit<AuthToken, 'iat' | 'exp'>,
  expiresIn: string = '24h'
): string {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET not configured');
  }

  return jwt.sign(payload as any, jwtSecret as Secret, { expiresIn } as SignOptions);
}

// Extract and verify user from event
export async function getUserFromEvent(event: APIGatewayProxyEvent): Promise<AuthToken | null> {
  const token = extractTokenFromEvent(event);
  if (!token) {
    return null;
  }

  return verifyJwtToken(token);
}

// Check if user is authenticated
export async function requireAuth(event: APIGatewayProxyEvent): Promise<AuthToken> {
  const user = await getUserFromEvent(event);
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}

// Extract user ID from authenticated request
export async function getUserId(event: APIGatewayProxyEvent): Promise<string> {
  const user = await requireAuth(event);
  return user.userId;
}
