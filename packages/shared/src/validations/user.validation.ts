// User validation schemas
import { z } from 'zod';
import { 
  baseEntitySchema,
  uuidSchema,
  emailSchema,
  urlSchema,
  userPreferencesSchema,
  createStringSchema
} from './common.validation.js';

// Core user schema
export const userSchema = baseEntitySchema.extend({
  cognitoId: z.string().min(1, 'Cognito ID is required'),
  email: emailSchema,
  name: createStringSchema(1, 100).optional(),
  avatarUrl: urlSchema.optional(),
  preferences: userPreferencesSchema.default({}),
});

// User creation schema
export const createUserSchema = z.object({
  cognitoId: z.string().min(1, 'Cognito ID is required'),
  email: emailSchema,
  name: createStringSchema(1, 100).optional(),
  avatarUrl: urlSchema.optional(),
  preferences: userPreferencesSchema.default({}),
});

// User update schema
export const updateUserSchema = z.object({
  name: createStringSchema(1, 100).optional(),
  avatarUrl: urlSchema.optional(),
  preferences: userPreferencesSchema.partial().optional(),
}).refine(
  data => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update' }
);

// Authentication schemas
export const loginCredentialsSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters'),
});

export const registerDataSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`])/,
      'Password must contain at least one lowercase letter, one uppercase letter, one number, and one symbol'
    ),
  name: createStringSchema(1, 100),
  confirmPassword: z.string(),
}).refine(
  data => data.password === data.confirmPassword,
  {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }
);

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`])/,
      'Password must contain at least one lowercase letter, one uppercase letter, one number, and one symbol'
    ),
  confirmPassword: z.string(),
}).refine(
  data => data.newPassword === data.confirmPassword,
  {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }
).refine(
  data => data.currentPassword !== data.newPassword,
  {
    message: 'New password must be different from current password',
    path: ['newPassword'],
  }
);

export const resetPasswordSchema = z.object({
  email: emailSchema,
});

export const confirmResetPasswordSchema = z.object({
  email: emailSchema,
  resetToken: z.string().min(1, 'Reset token is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`])/,
      'Password must contain at least one lowercase letter, one uppercase letter, one number, and one symbol'
    ),
  confirmPassword: z.string(),
}).refine(
  data => data.newPassword === data.confirmPassword,
  {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }
);

// Refresh token schema
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// User session schema
export const userSessionSchema = z.object({
  user: userSchema,
  accessToken: z.string().min(1, 'Access token is required'),
  refreshToken: z.string().optional(),
  expiresAt: z.date(),
});

// User profile schema (extends user but excludes sensitive fields)
export const userProfileSchema = userSchema.omit({ cognitoId: true }).extend({
  cardCount: z.number().min(0).default(0),
  lastActivity: z.date().optional(),
});

// User stats schema
export const userStatsSchema = z.object({
  totalCards: z.number().min(0),
  cardsThisMonth: z.number().min(0),
  companiesTracked: z.number().min(0),
  recentActivity: z.array(z.object({
    id: uuidSchema,
    type: z.enum([
      'card_created',
      'card_updated',
      'card_enriched',
      'card_deleted',
      'card_exported',
      'card_imported',
      'profile_updated',
    ]),
    description: z.string(),
    timestamp: z.date(),
    metadata: z.record(z.any()).optional(),
  })),
});

// Legacy schemas for backward compatibility
export const userRegistrationSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`])/,
      'Password must contain at least one lowercase letter, one uppercase letter, one number, and one symbol'
    ),
  name: createStringSchema(1, 100),
});
export const userLoginSchema = loginCredentialsSchema;

// Validation functions
export const validateUserEmail = (email: string): boolean => {
  return emailSchema.safeParse(email).success;
};

export const validateUserName = (name: string): boolean => {
  return createStringSchema(1, 100).safeParse(name).success;
};

export const validatePassword = (password: string): boolean => {
  return z
    .string()
    .min(8)
    .max(128)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`])/)
    .safeParse(password).success;
};

export const validateUserPreferences = (preferences: any): boolean => {
  return userPreferencesSchema.safeParse(preferences).success;
};

// Export inferred types
export type User = z.infer<typeof userSchema>;
export type CreateUser = z.infer<typeof createUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type LoginCredentials = z.infer<typeof loginCredentialsSchema>;
export type RegisterData = z.infer<typeof registerDataSchema>;
export type ChangePassword = z.infer<typeof changePasswordSchema>;
export type ResetPassword = z.infer<typeof resetPasswordSchema>;
export type ConfirmResetPassword = z.infer<typeof confirmResetPasswordSchema>;
export type RefreshToken = z.infer<typeof refreshTokenSchema>;
export type UserSession = z.infer<typeof userSessionSchema>;
export type UserProfile = z.infer<typeof userProfileSchema>;
export type UserStats = z.infer<typeof userStatsSchema>;

// Legacy types for backward compatibility
export type UserRegistrationInput = z.infer<typeof userRegistrationSchema>;
export type UserLoginInput = z.infer<typeof userLoginSchema>;
export type UserProfileInput = z.infer<typeof updateUserSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;