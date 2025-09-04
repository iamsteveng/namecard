// User-related types
import type { BaseEntity, UserPreferences } from './common.types';

// Core User interface matching Prisma schema
export interface User extends BaseEntity {
  cognitoId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  preferences: UserPreferences;
}

// User creation/update types
export interface CreateUserData {
  cognitoId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  preferences?: UserPreferences;
}

export interface UpdateUserData {
  name?: string;
  avatarUrl?: string;
  preferences?: Partial<UserPreferences>;
}

// User authentication types
export interface UserSession {
  user: User;
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
}

// User profile types
export interface UserProfile extends Omit<User, 'cognitoId'> {
  cardCount: number;
  lastActivity?: Date;
}

export interface UserStats {
  totalCards: number;
  cardsThisMonth: number;
  companiesTracked: number;
  recentActivity: ActivityItem[];
}

export interface ActivityItem {
  id: string;
  type: 'card_created' | 'card_updated' | 'card_enriched';
  description: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}
