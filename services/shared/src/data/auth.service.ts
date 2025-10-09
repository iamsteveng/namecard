import { randomUUID, createHash } from 'node:crypto';

import type { Prisma as PrismaTypes, PrismaClient, AuthSession, AuthUser } from '@prisma/client';
import bcrypt from 'bcryptjs';

import {
  disconnectPrisma,
  getPrismaClient,
  handlePrismaAuthFailure,
  Prisma,
} from './prisma';
import type { User } from '../types/user.types';
import type { UserPreferences } from '../types/common.types';
import type { UserSession } from '../types/user.types';

let prisma: PrismaClient | undefined;

const ACCESS_TOKEN_TTL_SECONDS = Number(process.env['AUTH_ACCESS_TOKEN_TTL'] ?? 3600);
const REFRESH_TOKEN_TTL_SECONDS = Number(
  process.env['AUTH_REFRESH_TOKEN_TTL'] ?? 60 * 60 * 24 * 30
);
const DEV_BYPASS_TOKEN = process.env['DEV_BYPASS_TOKEN'] ?? 'dev-bypass-token';

const DEMO_USER_ID = '11111111-1111-1111-1111-111111111111';
const DEMO_TENANT_ID = '22222222-2222-2222-2222-222222222222';
const DEMO_EMAIL = 'demo@namecard.app';
const DEMO_PASSWORD = 'DemoPass123!';
const DEMO_USER_NAME = 'Demo User';

const DB_RETRY_ATTEMPTS = 10;
const DB_RETRY_DELAY_MS = 1000;

async function executeWithDbRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < DB_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const client = getActivePrisma();
      await client.$connect();
      return await operation();
    } catch (error) {
      lastError = error;

      const prismaCode = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
      const prismaClientVersion = (error as any)?.clientVersion as string | undefined;
      const message = error instanceof Error ? error.message : String(error);
      console.warn('[auth.dbRetry] operation failed', {
        attempt,
        code: prismaCode,
        name: (error as any)?.name,
        message,
        clientVersion: prismaClientVersion,
      });

      const isInitializationError = error instanceof Prisma.PrismaClientInitializationError;
      const isNetworkFailure =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P1001';
      const isAuthFailure =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P1000';

      if (isAuthFailure) {
        const recovered = await handlePrismaAuthFailure();
        if (recovered) {
          prisma = undefined;
          await new Promise(resolve => setTimeout(resolve, DB_RETRY_DELAY_MS));
          continue;
        }
      }

      if (isInitializationError || isNetworkFailure) {
        await disconnectPrisma();
        prisma = undefined;
        await new Promise(resolve => setTimeout(resolve, DB_RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }

      throw error;
    }
  }

  throw lastError ?? new Error('Database unavailable');
}

function now(): Date {
  return new Date();
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function getActivePrisma(): PrismaClient {
  if (!prisma) {
    prisma = getPrismaClient();
  }
  return prisma;
}

function toUserPreferences(preferences: PrismaTypes.JsonValue | null | undefined): UserPreferences {
  if (!preferences || typeof preferences !== 'object') {
    return {};
  }
  return preferences as UserPreferences;
}

function toUser(record: AuthUser): User {
  const base: User = {
    id: record.id,
    cognitoId: `local-${record.id}`,
    email: record.email,
    preferences: toUserPreferences(record.preferences),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };

  if (record.name) {
    base.name = record.name;
  }

  if (record.avatarUrl) {
    base.avatarUrl = record.avatarUrl;
  }

  return base;
}

function buildSessionPayload(
  user: User,
  session: AuthSession,
  accessToken: string,
  refreshToken: string
): UserSession {
  return {
    user,
    accessToken,
    refreshToken,
    expiresAt: session.accessTokenExpiresAt,
  };
}

async function createSession(
  userId: string
): Promise<{ session: AuthSession; accessToken: string; refreshToken: string }> {
  const prisma = getActivePrisma();
  const issuedAt = now();
  const accessToken = `access_${randomUUID()}`;
  const refreshToken = `refresh_${randomUUID()}`;
  const accessTokenExpiresAt = new Date(issuedAt.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000);
  const refreshTokenExpiresAt = new Date(issuedAt.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000);

  const session = await prisma.authSession.create({
    data: {
      userId,
      accessTokenHash: hashToken(accessToken),
      refreshTokenHash: hashToken(refreshToken),
      issuedAt,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      createdAt: issuedAt,
      updatedAt: issuedAt,
    },
  });

  return { session, accessToken, refreshToken };
}

async function findUserByEmail(email: string): Promise<AuthUser | null> {
  return executeWithDbRetry(() => {
    const prisma = getActivePrisma();
    return prisma.authUser.findFirst({
      where: {
        email: {
          equals: email.trim().toLowerCase(),
          mode: 'insensitive',
        },
      },
    });
  });
}

export async function registerUser(input: {
  email: string;
  password: string;
  name: string;
}): Promise<UserSession> {
  const prisma = getActivePrisma();
  const existing = await findUserByEmail(input.email);
  if (existing) {
    throw new Error('A user with this email already exists');
  }

  const createdAt = now();
  const passwordHash = await bcrypt.hash(input.password, 10);

  const user = await prisma.authUser.create({
    data: {
      email: input.email.trim().toLowerCase(),
      passwordHash,
      name: input.name,
      tenantId: randomUUID(),
      preferences: {
        theme: 'light',
        notifications: true,
        emailUpdates: false,
        language: 'en',
        timezone: 'UTC',
      } satisfies UserPreferences,
      createdAt,
      updatedAt: createdAt,
    },
  });

  const { session, accessToken, refreshToken } = await createSession(user.id);
  return buildSessionPayload(toUser(user), session, accessToken, refreshToken);
}

export async function authenticateUser(credentials: {
  email: string;
  password: string;
}): Promise<UserSession> {
  const user = await findUserByEmail(credentials.email);
  if (!user) {
    throw new Error('Invalid credentials');
  }

  const passwordValid = await bcrypt.compare(credentials.password, user.passwordHash);
  if (!passwordValid) {
    throw new Error('Invalid credentials');
  }

  const { session, accessToken, refreshToken } = await createSession(user.id);
  return buildSessionPayload(toUser(user), session, accessToken, refreshToken);
}

export async function refreshSession(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
  const prisma = getActivePrisma();
  const session = await prisma.authSession.findFirst({
    where: {
      refreshTokenHash: hashToken(refreshToken),
      revokedAt: null,
      refreshTokenExpiresAt: { gt: now() },
    },
  });

  if (!session) {
    throw new Error('Refresh token invalid or expired');
  }

  const issuedAt = now();
  const accessToken = `access_${randomUUID()}`;
  const newRefreshToken = `refresh_${randomUUID()}`;
  const accessTokenExpiresAt = new Date(issuedAt.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000);
  const refreshTokenExpiresAt = new Date(issuedAt.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000);

  await prisma.authSession.update({
    where: { id: session.id },
    data: {
      accessTokenHash: hashToken(accessToken),
      refreshTokenHash: hashToken(newRefreshToken),
      issuedAt,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      revokedAt: null,
      updatedAt: issuedAt,
    },
  });

  return {
    accessToken,
    refreshToken: newRefreshToken,
    expiresAt: accessTokenExpiresAt,
  };
}

export async function revokeAccessToken(accessToken: string): Promise<void> {
  const prisma = getActivePrisma();
  await prisma.authSession.updateMany({
    where: {
      accessTokenHash: hashToken(accessToken),
      revokedAt: null,
    },
    data: {
      revokedAt: now(),
      updatedAt: now(),
    },
  });
}

export async function getUserForAccessToken(accessToken: string): Promise<User | null> {
  const session = await executeWithDbRetry(() =>
    {
      const prisma = getActivePrisma();
      return prisma.authSession.findFirst({
        where: {
          accessTokenHash: hashToken(accessToken),
          revokedAt: null,
          accessTokenExpiresAt: { gt: now() },
        },
        include: {
          user: true,
        },
      });
    }
  );

  if (!session?.user) {
    return null;
  }

  return toUser(session.user);
}

export async function getUserProfile(userId: string): Promise<User> {
  const prisma = getActivePrisma();
  const user = await prisma.authUser.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error('User not found');
  }
  return toUser(user);
}

export async function getTenantForUser(userId: string): Promise<string> {
  const prisma = getActivePrisma();
  const user = await prisma.authUser.findUnique({
    where: { id: userId },
    select: { tenantId: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  return user.tenantId;
}

export async function ensureDemoUser(seed: {
  userId: string;
  email: string;
  name: string;
  password: string;
  tenantId: string;
  avatarUrl?: string;
  preferences?: UserPreferences;
}): Promise<User> {
  const existing = await executeWithDbRetry(() =>
    {
      const prisma = getActivePrisma();
      return prisma.authUser.findUnique({ where: { id: seed.userId } });
    }
  );
  if (existing) {
    return toUser(existing);
  }

  const passwordHash = await bcrypt.hash(seed.password, 10);
  const createdAt = now();

  const user = await executeWithDbRetry(() =>
    {
      const prisma = getActivePrisma();
      return prisma.authUser.create({
        data: {
          id: seed.userId,
          email: seed.email.trim().toLowerCase(),
          name: seed.name,
          passwordHash,
          tenantId: seed.tenantId,
          avatarUrl: seed.avatarUrl ?? null,
          preferences: seed.preferences ?? {
            theme: 'light',
            notifications: true,
            emailUpdates: true,
            language: 'en',
            timezone: 'UTC',
          },
          createdAt,
          updatedAt: createdAt,
        },
      });
    }
  );

  return toUser(user);
}

export async function ensureDefaultDemoUser(): Promise<User> {
  return ensureDemoUser({
    userId: DEMO_USER_ID,
    email: DEMO_EMAIL,
    name: DEMO_USER_NAME,
    password: DEMO_PASSWORD,
    tenantId: DEMO_TENANT_ID,
    avatarUrl: 'https://cdn.namecard.app/avatars/demo-user.png',
    preferences: {
      theme: 'light',
      notifications: true,
      emailUpdates: true,
      language: 'en',
      timezone: 'UTC',
    },
  });
}

export async function resolveUserFromToken(token: string | undefined): Promise<User | null> {
  if (!token) {
    return null;
  }

  if (token === DEV_BYPASS_TOKEN) {
    return ensureDefaultDemoUser();
  }

  return getUserForAccessToken(token);
}

export { DEV_BYPASS_TOKEN, DEMO_USER_ID, DEMO_TENANT_ID };

export async function getAuthServiceMetrics(): Promise<{
  activeSessions: number;
  knownUsers: number;
}> {
  const prisma = getActivePrisma();
  const [activeSessions, knownUsers] = await Promise.all([
    prisma.authSession.count({
      where: {
        revokedAt: null,
        accessTokenExpiresAt: { gt: now() },
      },
    }),
    prisma.authUser.count(),
  ]);

  return {
    activeSessions,
    knownUsers,
  };
}
