// Card-specific types
import type { BaseEntity, CalendarSource } from './common.types.js';
import type { User } from './user.types.js';
import type { Company } from './company.types.js';

// Core Card interface matching Prisma schema
export interface Card extends BaseEntity {
  userId: string;
  originalImageUrl: string;
  processedImageUrl?: string;
  extractedText?: string;
  confidence?: number;

  // Extracted Information
  name?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;

  // Metadata and enrichment
  notes?: string;
  tags: string[];
  scanDate?: Date;
  lastEnrichmentDate?: Date;

  // Relations (populated when included)
  user?: User;
  companies?: CardCompany[];
  calendarEvents?: CalendarEvent[];
}

// Card creation/update types
export interface CreateCardData {
  userId: string;
  originalImageUrl: string;
  extractedText?: string;
  confidence?: number;
  name?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  notes?: string;
  tags?: string[];
  scanDate?: Date;
}

export interface UpdateCardData {
  name?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  notes?: string;
  tags?: string[];
  processedImageUrl?: string;
}

// Card scanning types
export interface ScanCardRequest {
  imageFile: File | Blob;
  userId: string;
}

export interface ScanCardResponse {
  card: Card;
  confidence: number;
  extractedText: string;
}

// Card enrichment types
export interface EnrichCardRequest {
  cardId: string;
  enrichmentType?: 'company' | 'news' | 'calendar' | 'all';
}

export interface EnrichCardResponse {
  cardId: string;
  enrichmentData: {
    companyInfo?: Company;
    newsArticles?: NewsArticle[];
    calendarEvents?: CalendarEvent[];
  };
  success: boolean;
}

// Related entities
export interface CardCompany {
  cardId: string;
  companyId: string;
  card?: Card;
  company?: Company;
}

export interface CalendarEvent extends BaseEntity {
  cardId: string;
  externalEventId?: string;
  title: string;
  eventDate?: Date;
  location?: string;
  attendees: string[];
  source: CalendarSource;
  card?: Card;
}

export interface NewsArticle extends BaseEntity {
  companyId: string;
  title: string;
  summary?: string;
  url?: string;
  publishedDate?: Date;
  source?: string;
  company?: Company;
}

// Card filtering and search types
export interface CardFilters {
  company?: string;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
  hasEmail?: boolean;
  hasPhone?: boolean;
  hasCompany?: boolean;
}

export interface CardSearchParams extends CardFilters {
  q?: string;
  userId?: string;
}

// Card export types
export type CardExportFormat = 'json' | 'csv' | 'vcard';

export interface CardExportRequest {
  cardIds?: string[];
  format: CardExportFormat;
  includeImages?: boolean;
}

export interface CardExportResponse {
  downloadUrl: string;
  expiresAt: Date;
  filename: string;
  format: CardExportFormat;
}

// Card import types
export interface CardImportRequest {
  file: File;
  format: 'json' | 'csv';
  userId: string;
}

export interface CardImportResponse {
  imported: number;
  failed: number;
  errors?: string[];
  cards: Card[];
}