// Validation utility functions
import { VALIDATION_PATTERNS } from '../constants/validation.constants.js';

export const isValidEmail = (email: string): boolean => {
  return VALIDATION_PATTERNS.EMAIL.test(email);
};

export const isValidPhone = (phone: string): boolean => {
  // Remove all non-digit characters except + at the beginning
  const cleaned = phone.replace(/[^\d+]/g, '');
  // Check if it has 10-15 digits, optionally starting with +
  return /^\+?\d{10,15}$/.test(cleaned);
};

export const isValidUrl = (url: string): boolean => {
  return VALIDATION_PATTERNS.URL.test(url);
};

export const isValidUuid = (uuid: string): boolean => {
  return VALIDATION_PATTERNS.UUID.test(uuid);
};

export const sanitizeString = (input: string): string => {
  return input.trim().replace(/\s+/g, ' ');
};

export const isValidFileType = (fileType: string, allowedTypes: string[]): boolean => {
  return allowedTypes.includes(fileType);
};

export const isValidFileSize = (fileSize: number, maxSize: number): boolean => {
  return fileSize <= maxSize;
};

export const sanitizeInput = (input: string): string => {
  return input
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
};

export const validateRequired = (value: unknown): boolean => {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  return true;
};
