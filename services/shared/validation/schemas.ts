// Joi validation schemas for API requests
import Joi from 'joi';

// Common schemas
export const emailSchema = Joi.string().email().required().messages({
  'string.email': 'Please provide a valid email address',
  'string.empty': 'Email is required',
});

export const passwordSchema = Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required().messages({
  'string.min': 'Password must be at least 8 characters long',
  'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  'string.empty': 'Password is required',
});

export const uuidSchema = Joi.string().uuid().required().messages({
  'string.guid': 'Please provide a valid UUID',
  'string.empty': 'ID is required',
});

// Auth schemas
export const loginSchema = Joi.object({
  email: emailSchema,
  password: Joi.string().required().messages({
    'string.empty': 'Password is required',
  }),
});

export const registerSchema = Joi.object({
  email: emailSchema,
  password: passwordSchema,
  name: Joi.string().min(2).max(100).optional().messages({
    'string.min': 'Name must be at least 2 characters long',
    'string.max': 'Name cannot exceed 100 characters',
  }),
});

export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required().messages({
    'string.empty': 'Refresh token is required',
  }),
});

// Business card schemas
export const createCardSchema = Joi.object({
  name: Joi.string().max(200).optional(),
  title: Joi.string().max(200).optional(),
  company: Joi.string().max(200).optional(),
  email: Joi.string().email().optional(),
  phone: Joi.string().max(50).optional(),
  website: Joi.string().uri().optional(),
  address: Joi.string().max(500).optional(),
  notes: Joi.string().max(1000).optional(),
  imageUrl: Joi.string().uri().optional(),
  rawText: Joi.string().max(5000).optional(),
  confidence: Joi.number().min(0).max(100).optional(),
});

export const updateCardSchema = Joi.object({
  name: Joi.string().max(200).optional(),
  title: Joi.string().max(200).optional(),
  company: Joi.string().max(200).optional(),
  email: Joi.string().email().optional(),
  phone: Joi.string().max(50).optional(),
  website: Joi.string().uri().optional(),
  address: Joi.string().max(500).optional(),
  notes: Joi.string().max(1000).optional(),
}).min(1).messages({
  'object.min': 'At least one field must be provided for update',
});

// Upload schemas
export const uploadSingleSchema = Joi.object({
  file: Joi.any().required().messages({
    'any.required': 'File is required',
  }),
  userId: uuidSchema.optional(),
});

export const presignedUrlSchema = Joi.object({
  filename: Joi.string().required().messages({
    'string.empty': 'Filename is required',
  }),
  contentType: Joi.string().valid(
    'image/jpeg',
    'image/png', 
    'image/heic',
    'image/webp'
  ).required().messages({
    'any.only': 'Content type must be one of: image/jpeg, image/png, image/heic, image/webp',
  }),
  size: Joi.number().max(10485760).required().messages({
    'number.max': 'File size cannot exceed 10MB',
    'any.required': 'File size is required',
  }),
});

// OCR schemas
export const extractTextSchema = Joi.object({
  imageUrl: Joi.string().uri().required().messages({
    'string.uri': 'Please provide a valid image URL',
    'string.empty': 'Image URL is required',
  }),
  cardId: uuidSchema.optional(),
});

export const analyzeCardSchema = Joi.object({
  imageUrl: Joi.string().uri().required().messages({
    'string.uri': 'Please provide a valid image URL',
    'string.empty': 'Image URL is required',
  }),
  userId: uuidSchema.optional(),
});

// Enrichment schemas
export const enrichCardSchema = Joi.object({
  cardId: uuidSchema,
  company: Joi.string().min(1).max(200).required().messages({
    'string.empty': 'Company name is required',
    'string.max': 'Company name cannot exceed 200 characters',
  }),
  force: Joi.boolean().optional().default(false),
});

export const perplexityLookupSchema = Joi.object({
  company: Joi.string().min(1).max(200).required().messages({
    'string.empty': 'Company name is required',
    'string.max': 'Company name cannot exceed 200 characters',
  }),
  website: Joi.string().uri().optional(),
  location: Joi.string().max(200).optional(),
});

// Search schemas
export const searchCardsSchema = Joi.object({
  q: Joi.string().max(200).optional(),
  company: Joi.string().max(200).optional(),
  name: Joi.string().max(200).optional(),
  title: Joi.string().max(200).optional(),
  limit: Joi.number().min(1).max(100).default(20).optional(),
  offset: Joi.number().min(0).default(0).optional(),
});

// Query parameter schemas
export const paginationSchema = Joi.object({
  limit: Joi.number().min(1).max(100).default(20).optional(),
  offset: Joi.number().min(0).default(0).optional(),
});

export const idParamSchema = Joi.object({
  id: uuidSchema,
});