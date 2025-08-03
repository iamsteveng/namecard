import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import logger from '../utils/logger.js';
import { env } from '../config/env.js';
import * as crypto from 'crypto';
import * as path from 'path';

// S3 client configuration
const s3Client = new S3Client({
  region: env.s3.region,
  ...(env.aws.accessKeyId && env.aws.secretAccessKey && {
    credentials: {
      accessKeyId: env.aws.accessKeyId,
      secretAccessKey: env.aws.secretAccessKey,
    },
  }),
});

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

export class S3Service {
  private readonly bucketName: string;
  private readonly region: string;
  private readonly cdnDomain: string;
  private readonly urlExpirationTime = 3600; // 1 hour default

  constructor() {
    this.bucketName = env.s3.bucketName;
    this.region = env.s3.region;
    this.cdnDomain = env.s3.cdnDomain || '';

    logger.info('S3Service initialized', {
      bucket: this.bucketName,
      region: this.region,
      cdnDomain: this.cdnDomain,
    });
  }

  /**
   * Generate a unique S3 key for file storage
   */
  private generateFileKey(
    originalName: string,
    options: S3UploadOptions = {}
  ): string {
    const { userId, purpose = 'storage', variant } = options;
    
    // Extract file extension
    const ext = path.extname(originalName).toLowerCase();
    const basename = path.basename(originalName, ext);
    
    // Generate unique identifier
    const timestamp = Date.now();
    const randomId = crypto.randomBytes(8).toString('hex');
    const uniqueId = `${timestamp}_${randomId}`;
    
    // Construct key with organized folder structure
    let keyPath = 'images';
    
    if (userId) {
      keyPath += `/users/${userId}`;
    }
    
    keyPath += `/${purpose}`;
    
    if (variant) {
      keyPath += `/${variant}`;
    }
    
    keyPath += `/${uniqueId}_${basename}${ext}`;
    
    return keyPath;
  }

  /**
   * Upload a single file to S3
   */
  async uploadFile(
    buffer: Buffer,
    originalName: string,
    options: S3UploadOptions = {}
  ): Promise<S3UploadResult> {
    const startTime = Date.now();
    
    try {
      const key = this.generateFileKey(originalName, options);
      const contentType = options.contentType || this.getContentTypeFromExtension(originalName);
      
      logger.info('Starting S3 upload', {
        key,
        size: buffer.length,
        contentType,
        bucket: this.bucketName,
        userId: options.userId,
        purpose: options.purpose,
      });

      // Prepare metadata
      const metadata: Record<string, string> = {
        'original-name': originalName,
        'upload-timestamp': new Date().toISOString(),
        'file-size': buffer.length.toString(),
        ...(options.userId && { 'user-id': options.userId }),
        ...(options.purpose && { 'purpose': options.purpose }),
        ...(options.variant && { 'variant': options.variant }),
        ...(options.metadata || {}),
      };

      // Configure upload parameters
      const uploadParams: PutObjectCommandInput = {
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        Metadata: metadata,
        ...(options.isPublic && { ACL: 'public-read' }),
        ...(options.expiresIn && {
          Expires: new Date(Date.now() + options.expiresIn * 1000),
        }),
      };

      // Execute upload
      const command = new PutObjectCommand(uploadParams);
      const response = await s3Client.send(command);
      
      const uploadTime = Date.now() - startTime;
      
      // Construct file URL (prefer CDN URL if available)
      const url = this.getCDNUrl(key);

      const result: S3UploadResult = {
        key,
        url,
        bucket: this.bucketName,
        contentType,
        size: buffer.length,
        etag: response.ETag || '',
        metadata,
      };

      logger.info('S3 upload completed', {
        key,
        size: buffer.length,
        uploadTime: `${uploadTime}ms`,
        etag: response.ETag,
      });

      return result;
    } catch (error) {
      const uploadTime = Date.now() - startTime;
      
      logger.error('S3 upload failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        fileName: originalName,
        size: buffer.length,
        uploadTime: `${uploadTime}ms`,
      });

      throw new Error(`S3 upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Upload multiple files in batch
   */
  async uploadFiles(
    files: Array<{ buffer: Buffer; name: string; options?: S3UploadOptions }>
  ): Promise<Array<{ name: string; result?: S3UploadResult; error?: string }>> {
    logger.info('Starting batch S3 upload', { fileCount: files.length });

    // Process uploads in parallel with concurrency limit
    const concurrencyLimit = 3;
    const results: Array<{ name: string; result?: S3UploadResult; error?: string }> = [];

    for (let i = 0; i < files.length; i += concurrencyLimit) {
      const batch = files.slice(i, i + concurrencyLimit);
      
      const batchPromises = batch.map(async (file) => {
        try {
          const result = await this.uploadFile(file.buffer, file.name, file.options || {});
          return { name: file.name, result };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error('Batch upload failed for file', {
            fileName: file.name,
            error: errorMessage,
          });
          return { name: file.name, error: errorMessage };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    const successCount = results.filter(r => r.result).length;
    const errorCount = results.filter(r => r.error).length;

    logger.info('Batch S3 upload completed', {
      totalFiles: files.length,
      successful: successCount,
      failed: errorCount,
    });

    return results;
  }

  /**
   * Get a presigned URL for secure file download
   */
  async getSignedDownloadUrl(
    key: string,
    expiresIn: number = this.urlExpirationTime
  ): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
      
      logger.debug('Generated signed download URL', {
        key,
        expiresIn: `${expiresIn}s`,
      });

      return signedUrl;
    } catch (error) {
      logger.error('Failed to generate signed download URL', {
        error: error instanceof Error ? error.message : 'Unknown error',
        key,
      });

      throw new Error(`Failed to generate signed download URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get file information without downloading
   */
  async getFileInfo(key: string): Promise<S3FileInfo> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await s3Client.send(command);

      return {
        key,
        size: response.ContentLength || 0,
        lastModified: response.LastModified || new Date(),
        etag: response.ETag || '',
        ...(response.ContentType && { contentType: response.ContentType }),
        ...(response.Metadata && { metadata: response.Metadata }),
      };
    } catch (error) {
      logger.error('Failed to get file info', {
        error: error instanceof Error ? error.message : 'Unknown error',
        key,
      });

      throw new Error(`Failed to get file info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a file from S3
   */
  async deleteFile(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await s3Client.send(command);

      logger.info('File deleted from S3', { key });
    } catch (error) {
      logger.error('Failed to delete file', {
        error: error instanceof Error ? error.message : 'Unknown error',
        key,
      });

      throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List files in a specific folder/prefix
   */
  async listFiles(
    prefix?: string,
    maxKeys: number = 1000
  ): Promise<S3FileInfo[]> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: maxKeys,
      });

      const response = await s3Client.send(command);

      const files: S3FileInfo[] = (response.Contents || []).map(object => ({
        key: object.Key || '',
        size: object.Size || 0,
        lastModified: object.LastModified || new Date(),
        etag: object.ETag || '',
      }));

      logger.debug('Listed S3 files', {
        prefix,
        count: files.length,
        truncated: response.IsTruncated,
      });

      return files;
    } catch (error) {
      logger.error('Failed to list files', {
        error: error instanceof Error ? error.message : 'Unknown error',
        prefix,
      });

      throw new Error(`Failed to list files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if S3 service is healthy
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: any }> {
    try {
      // Try to list objects in the bucket (minimal operation)
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        MaxKeys: 1,
      });

      const startTime = Date.now();
      await s3Client.send(command);
      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        details: {
          bucket: this.bucketName,
          region: this.region,
          responseTime: `${responseTime}ms`,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          bucket: this.bucketName,
          region: this.region,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * Get content type from file extension
   */
  private getContentTypeFromExtension(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.tiff': 'image/tiff',
      '.tif': 'image/tiff',
      '.heic': 'image/heic',
      '.heif': 'image/heif',
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Generate CDN-style URL for public files
   */
  getCDNUrl(key: string): string {
    // Use CloudFront CDN if configured, otherwise fall back to direct S3 URL
    if (this.cdnDomain) {
      return `https://${this.cdnDomain}/${key}`;
    }
    return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
  }

  /**
   * Get bucket information
   */
  getBucketInfo(): { name: string; region: string; baseUrl: string; cdnUrl?: string } {
    return {
      name: this.bucketName,
      region: this.region,
      baseUrl: `https://${this.bucketName}.s3.${this.region}.amazonaws.com`,
      ...(this.cdnDomain && { cdnUrl: `https://${this.cdnDomain}` }),
    };
  }
}

// Export singleton instance
export const s3Service = new S3Service();
export default s3Service;