// Validation utility functions
import { VALIDATION_PATTERNS } from '../constants/validation.constants.js';

export const isValidEmail = (email: string): boolean => {
  return VALIDATION_PATTERNS.EMAIL.test(email);
};

export const isValidPhone = (phone: string): boolean => {
  return VALIDATION_PATTERNS.PHONE.test(phone);
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