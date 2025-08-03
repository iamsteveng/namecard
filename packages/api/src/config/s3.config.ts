import logger from '../utils/logger.js';

export interface S3Config {
  bucketName: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  urlExpirationTime: number;
  maxFileSize: number;
  allowedContentTypes: string[];
  cdnDomain?: string;
}

export interface S3ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  config?: S3Config;
}

/**
 * Validate S3 configuration from environment variables
 */
export function validateS3Config(): S3ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required environment variables
  const bucketName = process.env['S3_BUCKET_NAME'];
  const region = process.env['S3_REGION'] || process.env['AWS_REGION'];
  const accessKeyId = process.env['AWS_ACCESS_KEY_ID'];
  const secretAccessKey = process.env['AWS_SECRET_ACCESS_KEY'];

  // Check required variables
  if (!bucketName) {
    errors.push('S3_BUCKET_NAME environment variable is required');
  }

  if (!region) {
    errors.push('S3_REGION or AWS_REGION environment variable is required');
  }

  if (!accessKeyId) {
    errors.push('AWS_ACCESS_KEY_ID environment variable is required');
  }

  if (!secretAccessKey) {
    errors.push('AWS_SECRET_ACCESS_KEY environment variable is required');
  }

  // Validate bucket name format
  if (bucketName) {
    const bucketNameRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
    if (!bucketNameRegex.test(bucketName) || bucketName.length < 3 || bucketName.length > 63) {
      errors.push('S3_BUCKET_NAME must be 3-63 characters, lowercase, and contain only letters, numbers, and hyphens');
    }

    if (bucketName.includes('..') || bucketName.includes('.-') || bucketName.includes('-.')) {
      errors.push('S3_BUCKET_NAME cannot contain consecutive periods or hyphens adjacent to periods');
    }
  }

  // Validate region format
  if (region) {
    const regionRegex = /^[a-z]{2}-[a-z]+-\d{1}$/;
    if (!regionRegex.test(region)) {
      warnings.push(`AWS region '${region}' may not be valid. Expected format: 'us-east-1'`);
    }
  }

  // Optional configuration with defaults
  const urlExpirationTime = parseInt(process.env['S3_URL_EXPIRATION'] || '3600', 10);
  const maxFileSize = parseInt(process.env['MAX_FILE_SIZE'] || '10485760', 10); // 10MB default
  const cdnDomain = process.env['S3_CDN_DOMAIN'];

  // Validate optional numeric values
  if (isNaN(urlExpirationTime) || urlExpirationTime < 1) {
    warnings.push('S3_URL_EXPIRATION should be a positive number (seconds)');
  }

  if (isNaN(maxFileSize) || maxFileSize < 1024) {
    warnings.push('MAX_FILE_SIZE should be at least 1024 bytes');
  }

  // Define allowed content types
  const allowedContentTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/tiff',
    'image/heic',
    'image/heif',
  ];

  const isValid = errors.length === 0;

  const result: S3ValidationResult = {
    isValid,
    errors,
    warnings,
  };

  if (isValid) {
    result.config = {
      bucketName: bucketName!,
      region: region!,
      accessKeyId: accessKeyId!,
      secretAccessKey: secretAccessKey!,
      urlExpirationTime,
      maxFileSize,
      allowedContentTypes,
      ...(cdnDomain && { cdnDomain }),
    };
  }

  return result;
}

/**
 * Get validated S3 configuration or throw error
 */
export function getS3Config(): S3Config {
  const validation = validateS3Config();

  if (!validation.isValid) {
    const errorMessage = `S3 configuration validation failed: ${validation.errors.join(', ')}`;
    logger.error('S3 configuration validation failed', {
      errors: validation.errors,
      warnings: validation.warnings,
    });
    throw new Error(errorMessage);
  }

  if (validation.warnings.length > 0) {
    logger.warn('S3 configuration warnings', {
      warnings: validation.warnings,
    });
  }

  logger.info('S3 configuration validated successfully', {
    bucket: validation.config!.bucketName,
    region: validation.config!.region,
    urlExpiration: validation.config!.urlExpirationTime,
    maxFileSize: validation.config!.maxFileSize,
    cdnDomain: validation.config!.cdnDomain || 'none',
  });

  return validation.config!;
}

/**
 * Check if S3 is properly configured
 */
export function isS3Configured(): boolean {
  try {
    getS3Config();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get S3 configuration summary for health checks
 */
export function getS3ConfigSummary(): {
  configured: boolean;
  bucket?: string;
  region?: string;
  cdnEnabled: boolean;
  maxFileSize: number;
  errors?: string[];
} {
  const validation = validateS3Config();

  if (validation.isValid && validation.config) {
    return {
      configured: true,
      bucket: validation.config.bucketName,
      region: validation.config.region,
      cdnEnabled: !!validation.config.cdnDomain,
      maxFileSize: validation.config.maxFileSize,
    };
  } else {
    return {
      configured: false,
      cdnEnabled: false,
      maxFileSize: parseInt(process.env['MAX_FILE_SIZE'] || '10485760', 10),
      errors: validation.errors,
    };
  }
}

export default { validateS3Config, getS3Config, isS3Configured, getS3ConfigSummary };