/**
 * Frontend Enrichment Types
 *
 * Types for enrichment UI components and integration
 */

import type {
  CompanyEnrichmentData,
  PersonEnrichmentData,
  BusinessCardEnrichmentData,
  EnrichmentStatus,
  EnrichmentSource,
} from '@namecard/shared/types/enrichment.types';

export interface EnrichmentUIState {
  isEnriching: boolean;
  status: EnrichmentStatus;
  error?: string;
  lastEnrichmentDate?: Date;
}

export interface EnrichCardRequest {
  cardId: string;
  sources?: EnrichmentSource[];
  forceRefresh?: boolean;
}

export interface EnrichCardResponse {
  success: boolean;
  data?: {
    cardId: string;
    companyData?: CompanyEnrichmentData;
    status: EnrichmentStatus;
    sources: EnrichmentSource[];
    confidence: number;
    processingTime: number;
    enrichmentDate: Date;
  };
  error?: string;
  message?: string;
}

export interface CompanyInfoProps {
  companyData: CompanyEnrichmentData | undefined;
  personData?: PersonEnrichmentData;
  enrichmentData?: BusinessCardEnrichmentData;
  isLoading?: boolean;
  onEnrich?: () => void;
  showEnrichButton?: boolean;
}

export interface EnrichmentButtonProps {
  cardId?: string;
  company: string | undefined;
  domain: string | undefined;
  onEnrichmentStart?: () => void;
  onEnrichmentComplete?: (data: CompanyEnrichmentData) => void;
  onEnrichmentError?: (error: string) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary' | 'outline';
}

export interface EnrichmentStatusIndicatorProps {
  status: EnrichmentStatus;
  lastEnrichmentDate?: Date;
  confidence?: number;
  sources?: EnrichmentSource[];
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
}

// Helper functions for UI
export function getEnrichmentStatusColor(status: EnrichmentStatus): string {
  switch (status) {
    case 'enriched':
      return 'text-green-700 bg-green-100';
    case 'partial':
      return 'text-yellow-700 bg-yellow-100';
    case 'failed':
      return 'text-red-700 bg-red-100';
    case 'pending':
      return 'text-blue-700 bg-blue-100';
    case 'skipped':
      return 'text-gray-700 bg-gray-100';
    default:
      return 'text-gray-700 bg-gray-100';
  }
}

export function getEnrichmentStatusText(status: EnrichmentStatus): string {
  switch (status) {
    case 'enriched':
      return 'Enriched';
    case 'partial':
      return 'Partial Data';
    case 'failed':
      return 'Failed';
    case 'pending':
      return 'Enriching...';
    case 'skipped':
      return 'Not Enriched';
    default:
      return 'Unknown';
  }
}

export function formatEnrichmentSources(sources: EnrichmentSource[]): string {
  if (!sources || sources.length === 0) {
    return 'No sources';
  }
  return sources.map(source => source.charAt(0).toUpperCase() + source.slice(1)).join(', ');
}
