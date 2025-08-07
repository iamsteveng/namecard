/**
 * Enrichment Configuration
 * 
 * Configuration for company data enrichment sources and settings
 */

import { 
  EnrichmentSourceConfig, 
  EnrichmentSettings,
  EnrichmentSource 
} from '@namecard/shared/types/enrichment.types';

/**
 * Load enrichment source configurations from environment variables
 */
export function loadEnrichmentSourceConfigs(): EnrichmentSourceConfig[] {
  const configs: EnrichmentSourceConfig[] = [];

  // Clearbit configuration
  const clearbitConfig: EnrichmentSourceConfig = {
    source: 'clearbit',
    enabled: process.env.CLEARBIT_ENABLED === 'true',
    apiKey: process.env.CLEARBIT_API_KEY,
    baseUrl: process.env.CLEARBIT_BASE_URL || 'https://company-stream.clearbit.com/v2',
    rateLimit: {
      requestsPerMinute: parseInt(process.env.CLEARBIT_RATE_LIMIT_RPM || '100'),
      requestsPerDay: parseInt(process.env.CLEARBIT_RATE_LIMIT_RPD || '1000')
    },
    timeout: parseInt(process.env.CLEARBIT_TIMEOUT || '10000'),
    retryConfig: {
      maxRetries: parseInt(process.env.CLEARBIT_MAX_RETRIES || '3'),
      backoffMs: parseInt(process.env.CLEARBIT_BACKOFF_MS || '1000')
    }
  };
  configs.push(clearbitConfig);

  // LinkedIn configuration (future implementation)
  const linkedinConfig: EnrichmentSourceConfig = {
    source: 'linkedin',
    enabled: process.env.LINKEDIN_ENABLED === 'true',
    apiKey: process.env.LINKEDIN_API_KEY,
    baseUrl: process.env.LINKEDIN_BASE_URL || 'https://api.linkedin.com/v2',
    rateLimit: {
      requestsPerMinute: parseInt(process.env.LINKEDIN_RATE_LIMIT_RPM || '60'),
      requestsPerDay: parseInt(process.env.LINKEDIN_RATE_LIMIT_RPD || '500')
    },
    timeout: parseInt(process.env.LINKEDIN_TIMEOUT || '15000'),
    retryConfig: {
      maxRetries: parseInt(process.env.LINKEDIN_MAX_RETRIES || '2'),
      backoffMs: parseInt(process.env.LINKEDIN_BACKOFF_MS || '2000')
    }
  };
  configs.push(linkedinConfig);

  // Crunchbase configuration (future implementation)
  const crunchbaseConfig: EnrichmentSourceConfig = {
    source: 'crunchbase',
    enabled: process.env.CRUNCHBASE_ENABLED === 'true',
    apiKey: process.env.CRUNCHBASE_API_KEY,
    baseUrl: process.env.CRUNCHBASE_BASE_URL || 'https://api.crunchbase.com/api/v4',
    rateLimit: {
      requestsPerMinute: parseInt(process.env.CRUNCHBASE_RATE_LIMIT_RPM || '200'),
      requestsPerDay: parseInt(process.env.CRUNCHBASE_RATE_LIMIT_RPD || '5000')
    },
    timeout: parseInt(process.env.CRUNCHBASE_TIMEOUT || '12000'),
    retryConfig: {
      maxRetries: parseInt(process.env.CRUNCHBASE_MAX_RETRIES || '3'),
      backoffMs: parseInt(process.env.CRUNCHBASE_BACKOFF_MS || '1500')
    }
  };
  configs.push(crunchbaseConfig);

  // Perplexity AI configuration
  const perplexityConfig: EnrichmentSourceConfig = {
    source: 'perplexity',
    enabled: process.env.PERPLEXITY_ENABLED === 'true',
    apiKey: process.env.PERPLEXITY_API_KEY,
    baseUrl: process.env.PERPLEXITY_BASE_URL || 'https://api.perplexity.ai',
    rateLimit: {
      requestsPerMinute: parseInt(process.env.PERPLEXITY_RATE_LIMIT_RPM || '60'), // Conservative rate limit
      requestsPerDay: parseInt(process.env.PERPLEXITY_RATE_LIMIT_RPD || '1000')
    },
    timeout: parseInt(process.env.PERPLEXITY_TIMEOUT || '30000'), // 30 seconds for research
    retryConfig: {
      maxRetries: parseInt(process.env.PERPLEXITY_MAX_RETRIES || '2'),
      backoffMs: parseInt(process.env.PERPLEXITY_BACKOFF_MS || '3000')
    }
  };
  configs.push(perplexityConfig);

  return configs;
}

/**
 * Load enrichment settings from environment variables
 */
export function loadEnrichmentSettings(): EnrichmentSettings {
  // Parse enabled sources from environment
  const enabledSourcesEnv = process.env.ENRICHMENT_ENABLED_SOURCES || 'clearbit';
  const enabledSources = enabledSourcesEnv.split(',').map(s => s.trim()) as EnrichmentSource[];

  return {
    enabledSources,
    autoEnrichNewCards: process.env.AUTO_ENRICH_NEW_CARDS === 'true',
    batchSize: parseInt(process.env.ENRICHMENT_BATCH_SIZE || '10'),
    maxConcurrentJobs: parseInt(process.env.ENRICHMENT_MAX_CONCURRENT || '5'),
    retryFailedJobsAfterMs: parseInt(process.env.ENRICHMENT_RETRY_DELAY || '300000'), // 5 minutes
    cleanupCompletedJobsAfterMs: parseInt(process.env.ENRICHMENT_CLEANUP_DELAY || '86400000'), // 24 hours
    defaultConfidenceThreshold: parseFloat(process.env.ENRICHMENT_MIN_CONFIDENCE || '0.7'),
    
    sourcePreferences: {
      clearbit: {
        weight: parseFloat(process.env.CLEARBIT_WEIGHT || '1.0'),
        trustLevel: parseInt(process.env.CLEARBIT_TRUST_LEVEL || '90')
      },
      linkedin: {
        weight: parseFloat(process.env.LINKEDIN_WEIGHT || '0.9'),
        trustLevel: parseInt(process.env.LINKEDIN_TRUST_LEVEL || '95')
      },
      crunchbase: {
        weight: parseFloat(process.env.CRUNCHBASE_WEIGHT || '0.8'),
        trustLevel: parseInt(process.env.CRUNCHBASE_TRUST_LEVEL || '85')
      },
      manual: {
        weight: parseFloat(process.env.MANUAL_WEIGHT || '1.0'),
        trustLevel: parseInt(process.env.MANUAL_TRUST_LEVEL || '100')
      },
      opencorporates: {
        weight: parseFloat(process.env.OPENCORPORATES_WEIGHT || '0.7'),
        trustLevel: parseInt(process.env.OPENCORPORATES_TRUST_LEVEL || '80')
      },
      perplexity: {
        weight: parseFloat(process.env.PERPLEXITY_WEIGHT || '0.9'),
        trustLevel: parseInt(process.env.PERPLEXITY_TRUST_LEVEL || '88')
      }
    }
  };
}

/**
 * Validate enrichment configuration
 */
export function validateEnrichmentConfig(
  sourceConfigs: EnrichmentSourceConfig[], 
  settings: EnrichmentSettings
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check if at least one source is enabled
  const enabledSources = sourceConfigs.filter(config => config.enabled);
  if (enabledSources.length === 0) {
    errors.push('No enrichment sources are enabled');
  }

  // Validate each enabled source has required configuration
  for (const config of enabledSources) {
    if (!config.apiKey && config.source !== 'manual') {
      errors.push(`Missing API key for ${config.source}`);
    }
    
    if (!config.baseUrl) {
      errors.push(`Missing base URL for ${config.source}`);
    }

    if (config.rateLimit) {
      if (config.rateLimit.requestsPerMinute <= 0) {
        errors.push(`Invalid rate limit for ${config.source}: requestsPerMinute must be > 0`);
      }
      if (config.rateLimit.requestsPerDay <= 0) {
        errors.push(`Invalid rate limit for ${config.source}: requestsPerDay must be > 0`);
      }
    }
  }

  // Validate settings
  if (settings.batchSize <= 0) {
    errors.push('Batch size must be greater than 0');
  }

  if (settings.maxConcurrentJobs <= 0) {
    errors.push('Max concurrent jobs must be greater than 0');
  }

  if (settings.defaultConfidenceThreshold < 0 || settings.defaultConfidenceThreshold > 1) {
    errors.push('Default confidence threshold must be between 0 and 1');
  }

  // Validate source preferences
  for (const [source, prefs] of Object.entries(settings.sourcePreferences)) {
    if (prefs && typeof prefs === 'object') {
      if ('weight' in prefs && (prefs.weight < 0 || prefs.weight > 1)) {
        errors.push(`Source weight for ${source} must be between 0 and 1`);
      }
      if ('trustLevel' in prefs && (prefs.trustLevel < 0 || prefs.trustLevel > 100)) {
        errors.push(`Trust level for ${source} must be between 0 and 100`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get default development configuration for testing
 */
export function getDefaultDevConfig(): {
  sourceConfigs: EnrichmentSourceConfig[];
  settings: EnrichmentSettings;
} {
  const sourceConfigs: EnrichmentSourceConfig[] = [
    {
      source: 'clearbit',
      enabled: false, // Disabled by default for development
      apiKey: 'test-key',
      baseUrl: 'https://company-stream.clearbit.com/v2',
      rateLimit: {
        requestsPerMinute: 10,
        requestsPerDay: 100
      },
      timeout: 5000,
      retryConfig: {
        maxRetries: 2,
        backoffMs: 1000
      }
    }
  ];

  const settings: EnrichmentSettings = {
    enabledSources: [],
    autoEnrichNewCards: false,
    batchSize: 5,
    maxConcurrentJobs: 2,
    retryFailedJobsAfterMs: 60000, // 1 minute
    cleanupCompletedJobsAfterMs: 3600000, // 1 hour
    defaultConfidenceThreshold: 0.5,
    sourcePreferences: {
      clearbit: { weight: 1.0, trustLevel: 90 },
      linkedin: { weight: 0.9, trustLevel: 95 },
      crunchbase: { weight: 0.8, trustLevel: 85 },
      manual: { weight: 1.0, trustLevel: 100 },
      opencorporates: { weight: 0.7, trustLevel: 80 },
      perplexity: { weight: 0.9, trustLevel: 88 }
    }
  };

  return { sourceConfigs, settings };
}