// Card-specific types
import type { BaseEntity } from './common.types.js';

export interface Card extends BaseEntity {
  userId: string;
  originalImageUrl: string;
  processedImageUrl?: string;
  extractedText: string;
  confidence: number;

  // Extracted Information
  name?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;

  // Enrichment Data
  companyInfo?: CompanyInfo;
  calendarContext?: CalendarContext;
  notes: string;
  tags: string[];

  // Metadata
  scanDate: Date;
  lastEnrichmentDate?: Date;
}

export interface CompanyInfo {
  id: string;
  name: string;
  industry: string;
  size?: string;
  headquarters?: string;
  website?: string;
  description?: string;
  recentNews: NewsItem[];
  lastUpdated: Date;
}

export interface CalendarContext {
  eventId: string;
  eventTitle: string;
  eventDate: Date;
  eventLocation?: string;
  attendees?: string[];
  source: 'google' | 'outlook' | 'manual';
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  publishedDate: Date;
  source: string;
}
