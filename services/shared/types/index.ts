// Shared TypeScript interfaces and types
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

// Lambda handler types
export type LambdaHandler = (
  event: APIGatewayProxyEvent,
  context: Context
) => Promise<APIGatewayProxyResult>;

// Common API response interface
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string | undefined;
  timestamp: string;
  requestId: string;
}

// User types
export interface User {
  id: string;
  email: string;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthToken {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

// Business card types
export interface BusinessCard {
  id: string;
  userId: string;
  name?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  notes?: string;
  imageUrl?: string;
  rawText?: string;
  confidence?: number;
  enrichmentData?: EnrichmentData;
  createdAt: Date;
  updatedAt: Date;
}

// OCR result types
export interface OcrResult {
  text: string;
  confidence: number;
  blocks: OcrBlock[];
  extractedData: ExtractedCardData;
}

export interface OcrBlock {
  text: string;
  confidence: number;
  boundingBox: BoundingBox;
  type: 'LINE' | 'WORD';
}

export interface BoundingBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ExtractedCardData {
  name?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
}

// Enrichment types
export interface EnrichmentData {
  companyInfo?: CompanyInfo;
  socialMedia?: SocialMediaInfo;
  source: string;
  confidence: number;
  lastUpdated: Date;
}

export interface CompanyInfo {
  name: string;
  description?: string;
  website?: string;
  industry?: string;
  size?: string;
  founded?: string;
  location?: string;
  logo?: string;
}

export interface SocialMediaInfo {
  linkedin?: string;
  twitter?: string;
  facebook?: string;
  instagram?: string;
}

// Validation error types
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

// Upload types
export interface UploadResult {
  url: string;
  key: string;
  bucket: string;
  size: number;
  contentType: string;
}

// Search types
export interface SearchQuery {
  q?: string;
  company?: string;
  name?: string;
  title?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// Event types for async processing
export interface OcrQueueMessage {
  cardId: string;
  imageUrl: string;
  userId: string;
  requestId: string;
}

export interface EnrichmentQueueMessage {
  cardId: string;
  company: string;
  userId: string;
  requestId: string;
}