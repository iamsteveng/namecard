/**
 * S3 Storage Types
 * 
 * Shared types for S3 file storage operations across the application
 */

export interface S3UploadResult {
  key: string;
  url: string;
  bucket: string;
  contentType: string;
  size: number;
  etag: string;
  metadata?: Record<string, string>;
}

export interface S3UploadOptions {
  userId?: string;
  purpose?: 'storage' | 'ocr' | 'thumbnail' | 'avatar' | 'web-display';
  variant?: string;
  originalName?: string;
  contentType?: string;
  metadata?: Record<string, string>;
  isPublic?: boolean;
  expiresIn?: number; // TTL in seconds for temporary files
}

export interface S3FileInfo {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface S3BatchUploadResult {
  name: string;
  result?: S3UploadResult;
  error?: string;
}

export interface S3HealthStatus {
  status: 'healthy' | 'unhealthy';
  details: {
    bucket?: string;
    region?: string;
    responseTime?: string;
    error?: string;
    timestamp: string;
  };
}

export interface S3Config {
  bucketName: string;
  region: string;
  urlExpirationTime: number;
  maxFileSize: number;
  allowedContentTypes: string[];
  cdnDomain?: string;
}

export interface S3ConfigSummary {
  configured: boolean;
  bucket?: string;
  region?: string;
  cdnEnabled: boolean;
  maxFileSize: number;
  errors?: string[];
}

// Storage purposes for file organization
export type S3StoragePurpose = 'storage' | 'ocr' | 'thumbnail' | 'avatar' | 'web-display';

// File processing variants
export type S3FileVariant = 'original' | 'compressed' | 'watermarked' | 'cropped';

// S3 operation types
export type S3Operation = 'upload' | 'download' | 'delete' | 'list' | 'info';

// S3 URL types
export interface S3UrlOptions {
  expiresIn?: number;
  responseContentType?: string;
  responseContentDisposition?: string;
}

export interface S3SignedUrl {
  url: string;
  expiresAt: Date;
  expiresIn: number;
}

// File listing options
export interface S3ListOptions {
  prefix?: string;
  maxKeys?: number;
  continuationToken?: string;
}

export interface S3ListResult {
  files: S3FileInfo[];
  isTruncated: boolean;
  nextContinuationToken?: string;
  totalCount: number;
}

// S3 error types
export interface S3Error {
  code: string;
  message: string;
  key?: string;
  operation?: S3Operation;
  details?: any;
}

// Upload progress tracking
export interface S3UploadProgress {
  key: string;
  loaded: number;
  total: number;
  percentage: number;
  speed?: number;
  timeRemaining?: number;
}

// Batch upload progress
export interface S3BatchUploadProgress {
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  currentFile?: string;
  overallProgress: number;
  files: Array<{
    name: string;
    status: 'pending' | 'uploading' | 'completed' | 'failed';
    progress?: S3UploadProgress;
    error?: string;
  }>;
}

// CDN integration
export interface S3CDNOptions {
  domain: string;
  pathPrefix?: string;
  useHttps?: boolean;
  cacheTTL?: number;
}

export interface S3CDNUrl {
  originalUrl: string;
  cdnUrl: string;
  cacheable: boolean;
  ttl?: number;
}

// File metadata extraction
export interface S3FileMetadata {
  originalName: string;
  uploadTimestamp: string;
  fileSize: number;
  userId?: string;
  purpose?: S3StoragePurpose;
  variant?: string;
  contentType: string;
  checksum?: string;
  tags?: string[];
  customMetadata?: Record<string, string>;
}

// Security and access control
export interface S3AccessPolicy {
  isPublic: boolean;
  allowedOperations: S3Operation[];
  ipWhitelist?: string[];
  referrerWhitelist?: string[];
  timeRestriction?: {
    validFrom: Date;
    validUntil: Date;
  };
}

// Storage analytics
export interface S3StorageAnalytics {
  totalFiles: number;
  totalSize: number;
  averageFileSize: number;
  filesByPurpose: Record<S3StoragePurpose, number>;
  filesByType: Record<string, number>;
  storageUsageByUser: Record<string, number>;
  uploadTrends: Array<{
    date: string;
    uploads: number;
    totalSize: number;
  }>;
}

// Export defaults for backwards compatibility
export default {} as {
  S3UploadResult: typeof S3UploadResult;
  S3UploadOptions: typeof S3UploadOptions;
  S3FileInfo: typeof S3FileInfo;
  S3BatchUploadResult: typeof S3BatchUploadResult;
  S3HealthStatus: typeof S3HealthStatus;
  S3Config: typeof S3Config;
  S3ConfigSummary: typeof S3ConfigSummary;
  S3Error: typeof S3Error;
  S3UploadProgress: typeof S3UploadProgress;
  S3BatchUploadProgress: typeof S3BatchUploadProgress;
  S3CDNOptions: typeof S3CDNOptions;
  S3CDNUrl: typeof S3CDNUrl;
  S3FileMetadata: typeof S3FileMetadata;
  S3AccessPolicy: typeof S3AccessPolicy;
  S3StorageAnalytics: typeof S3StorageAnalytics;
};