import { useState } from 'react';
import { Sparkles, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { useMutation } from '@tanstack/react-query';
import type { EnrichmentButtonProps, EnrichCardRequest, EnrichCardResponse } from '../../types/enrichment.types';
import type { CompanyEnrichmentData } from '@namecard/shared/types/enrichment.types';
import enrichmentService from '../../services/enrichment.service';
import { useAuthStore } from '../../store/auth.store';

export default function EnrichmentButton({
  cardId,
  company,
  // domain, // unused
  onEnrichmentStart,
  onEnrichmentComplete,
  onEnrichmentError,
  disabled = false,
  size = 'md',
  variant = 'primary'
}: EnrichmentButtonProps) {
  const [lastEnrichment, setLastEnrichment] = useState<Date | null>(null);
  const [enrichmentData, setEnrichmentData] = useState<CompanyEnrichmentData | null>(null);
  
  const { session } = useAuthStore();
  const accessToken = session?.accessToken;

  const enrichMutation = useMutation({
    mutationFn: async () => {
      if (!accessToken || !cardId) {
        throw new Error('Missing required data for enrichment');
      }

      const request: EnrichCardRequest = {
        cardId,
        sources: ['perplexity'], // Use Perplexity AI for enrichment
        forceRefresh: false
      };

      return enrichmentService.enrichCard(request, accessToken);
    },
    onMutate: () => {
      onEnrichmentStart?.();
    },
    onSuccess: (response: EnrichCardResponse) => {
      if (response.success && response.data?.companyData) {
        setEnrichmentData(response.data.companyData);
        setLastEnrichment(new Date(response.data.enrichmentDate));
        onEnrichmentComplete?.(response.data.companyData);
      } else {
        throw new Error(response.error || 'Enrichment failed');
      }
    },
    onError: (error: Error) => {
      onEnrichmentError?.(error.message);
    }
  });

  const handleEnrich = () => {
    if (!cardId || !company) {
      onEnrichmentError?.('Card ID and company name are required for enrichment');
      return;
    }
    enrichMutation.mutate();
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'sm': return 'px-3 py-1.5 text-sm';
      case 'lg': return 'px-6 py-3 text-lg';
      default: return 'px-4 py-2 text-base';
    }
  };

  const getVariantClasses = () => {
    if (disabled || enrichMutation.isPending) {
      return 'bg-gray-300 text-gray-500 cursor-not-allowed';
    }

    switch (variant) {
      case 'secondary':
        return 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300';
      case 'outline':
        return 'bg-transparent text-blue-600 hover:bg-blue-50 border border-blue-300';
      default:
        return 'bg-blue-600 text-white hover:bg-blue-700';
    }
  };

  const getIconSize = () => {
    switch (size) {
      case 'sm': return 'h-4 w-4';
      case 'lg': return 'h-6 w-6';
      default: return 'h-5 w-5';
    }
  };

  // If we have recent enrichment data, show success state
  if (lastEnrichment && enrichmentData && !enrichMutation.isPending) {
    const isRecent = (Date.now() - lastEnrichment.getTime()) < 60000; // Within 1 minute
    
    if (isRecent) {
      return (
        <button
          onClick={handleEnrich}
          disabled={disabled}
          className={clsx(
            'inline-flex items-center gap-2 rounded-lg font-medium transition-colors',
            getSizeClasses(),
            'bg-green-100 text-green-700 hover:bg-green-200'
          )}
        >
          <CheckCircle className={getIconSize()} />
          Enriched
        </button>
      );
    }
  }

  return (
    <button
      onClick={handleEnrich}
      disabled={disabled || enrichMutation.isPending || !accessToken}
      className={clsx(
        'inline-flex items-center gap-2 rounded-lg font-medium transition-colors',
        getSizeClasses(),
        getVariantClasses()
      )}
    >
      {enrichMutation.isPending ? (
        <>
          <Loader2 className={clsx(getIconSize(), 'animate-spin')} />
          Enriching...
        </>
      ) : enrichMutation.isError ? (
        <>
          <AlertCircle className={getIconSize()} />
          Try Again
        </>
      ) : (
        <>
          <Sparkles className={getIconSize()} />
          Enrich Card
        </>
      )}
    </button>
  );
}

// Helper hook for enrichment status
export function useEnrichmentStatus(_cardId?: string) {
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichmentData, setEnrichmentData] = useState<CompanyEnrichmentData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleEnrichmentStart = () => {
    setIsEnriching(true);
    setError(null);
  };

  const handleEnrichmentComplete = (data: CompanyEnrichmentData) => {
    setIsEnriching(false);
    setEnrichmentData(data);
    setError(null);
  };

  const handleEnrichmentError = (errorMessage: string) => {
    setIsEnriching(false);
    setError(errorMessage);
  };

  return {
    isEnriching,
    enrichmentData,
    error,
    handleEnrichmentStart,
    handleEnrichmentComplete,
    handleEnrichmentError,
    clearError: () => setError(null)
  };
}