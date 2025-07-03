// User validation schemas
import { z } from 'zod';
import { VALIDATION_LIMITS } from '../constants/validation.constants.js';

export const userRegistrationSchema = z.object({
  email: z
    .string()
    .email()
    .min(VALIDATION_LIMITS.EMAIL.MIN_LENGTH)
    .max(VALIDATION_LIMITS.EMAIL.MAX_LENGTH),
  password: z
    .string()
    .min(VALIDATION_LIMITS.PASSWORD.MIN_LENGTH)
    .max(VALIDATION_LIMITS.PASSWORD.MAX_LENGTH),
  name: z.string().min(VALIDATION_LIMITS.NAME.MIN_LENGTH).max(VALIDATION_LIMITS.NAME.MAX_LENGTH),
});

export const userLoginSchema = z.object({
  email: z
    .string()
    .email()
    .min(VALIDATION_LIMITS.EMAIL.MIN_LENGTH)
    .max(VALIDATION_LIMITS.EMAIL.MAX_LENGTH),
  password: z
    .string()
    .min(VALIDATION_LIMITS.PASSWORD.MIN_LENGTH)
    .max(VALIDATION_LIMITS.PASSWORD.MAX_LENGTH),
});

export const userProfileSchema = z.object({
  name: z
    .string()
    .min(VALIDATION_LIMITS.NAME.MIN_LENGTH)
    .max(VALIDATION_LIMITS.NAME.MAX_LENGTH)
    .optional(),
  avatarUrl: z.string().url().optional(),
  preferences: z.record(z.any()).optional(),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(VALIDATION_LIMITS.PASSWORD.MIN_LENGTH),
    newPassword: z
      .string()
      .min(VALIDATION_LIMITS.PASSWORD.MIN_LENGTH)
      .max(VALIDATION_LIMITS.PASSWORD.MAX_LENGTH),
    confirmPassword: z
      .string()
      .min(VALIDATION_LIMITS.PASSWORD.MIN_LENGTH)
      .max(VALIDATION_LIMITS.PASSWORD.MAX_LENGTH),
  })
  .refine(data => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export type UserRegistrationInput = z.infer<typeof userRegistrationSchema>;
export type UserLoginInput = z.infer<typeof userLoginSchema>;
export type UserProfileInput = z.infer<typeof userProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
