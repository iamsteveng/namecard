import { randomBytes } from 'node:crypto';
import { basename, extname } from 'node:path';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type DeleteObjectCommandInput,
  type GetObjectCommandInput,
  type HeadObjectCommandInput,
  type ListObjectsV2CommandInput,
  type PutObjectCommandInput,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { env } from '../config/env.js';
import logger from '../utils/lambdaLogger.js';

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
  purpose?: 'storage' | 'ocr' | 'thumbnail' | 'avatar' | 'web-display' | 'original';
  variant?: string;
  originalName?: string;
  contentType?: string;
  metadata?: Record<string, string>;
  isPublic?: boolean;
  expiresIn?: number;
}

export interface S3FileInfo {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
  contentType?: string;
  metadata?: Record<string, string>;
}

function resolveRegion(): string {
  return (
    process.env['S3_REGION'] ||
    process.env['AWS_REGION'] ||
    env.s3.region ||
    env.aws.region ||
    'us-east-1'
  );
}

function resolveBucket(): string | undefined {
  return process.env['S3_BUCKET_NAME'] || env.s3.bucketName;
}

function resolveCdnDomain(): string {
  return process.env['S3_CDN_DOMAIN'] || env.s3.cdnDomain || '';
}

const s3Client = new S3Client({
  region: resolveRegion(),
});

export class S3Service {
  private readonly bucketName: string | undefined;
  private readonly region: string;
  private readonly cdnDomain: string;
  private readonly urlExpirationTime = 3600;

  constructor() {
    this.bucketName = resolveBucket();
    this.region = resolveRegion();
    this.cdnDomain = resolveCdnDomain();

    if (!this.bucketName) {
      logger.warn('S3Service initialized without bucket name. Upload operations will fail.');
    } else {
      logger.debug('S3Service initialized', {
        bucket: this.bucketName,
        region: this.region,
        cdnDomain: this.cdnDomain || undefined,
      });
    }
  }

  private ensureBucket(): string {
    const bucket = this.bucketName || resolveBucket();
    if (!bucket) {
      throw new Error('S3 bucket name is not configured. Set S3_BUCKET_NAME environment variable.');
    }
    return bucket;
  }

  private generateFileKey(originalName: string, options: S3UploadOptions = {}): string {
    const { userId, purpose = 'storage', variant } = options;

    const ext = extname(originalName) || '.bin';
    const base = basename(originalName, ext) || 'file';

    const timestamp = Date.now();
    const randomId = randomBytes(6).toString('hex');
    const uniqueId = `${timestamp}_${randomId}`;

    let keyPath = 'images';

    if (userId) {
      keyPath += `/users/${userId}`;
    }

    keyPath += `/${purpose}`;

    if (variant) {
      keyPath += `/${variant}`;
    }

    keyPath += `/${uniqueId}_${base}${ext}`;

    return keyPath.replace(/\\/g, '/');
  }

  private getContentTypeFromExtension(name: string): string {
    const ext = extname(name).toLowerCase();
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.webp':
        return 'image/webp';
      case '.gif':
        return 'image/gif';
      case '.heic':
        return 'image/heic';
      case '.tiff':
      case '.tif':
        return 'image/tiff';
      default:
        return 'application/octet-stream';
    }
  }

  private formatToMime(format: string | undefined): string {
    if (!format) return 'application/octet-stream';
    switch (format.toLowerCase()) {
      case 'jpeg':
      case 'jpg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'gif':
        return 'image/gif';
      case 'tiff':
        return 'image/tiff';
      case 'heic':
        return 'image/heic';
      default:
        return 'application/octet-stream';
    }
  }

  private getCDNUrl(key: string): string {
    if (this.cdnDomain) {
      return `https://${this.cdnDomain.replace(/\/$/, '')}/${key}`;
    }

    const bucket = this.ensureBucket();
    return `https://${bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  async uploadFile(
    buffer: Buffer,
    originalName: string,
    options: S3UploadOptions = {}
  ): Promise<S3UploadResult> {
    const bucket = this.ensureBucket();
    const key = this.generateFileKey(originalName, options);
    const contentType =
      options.contentType ||
      this.getContentTypeFromExtension(options.originalName || originalName);

    const metadata: Record<string, string> = {
      'original-name': options.originalName || originalName,
      'upload-timestamp': new Date().toISOString(),
      'file-size': buffer.length.toString(),
      ...(options.userId && { 'user-id': options.userId }),
      ...(options.purpose && { purpose: options.purpose }),
      ...(options.variant && { variant: options.variant }),
      ...(options.metadata || {}),
    };

    const params: PutObjectCommandInput = {
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      Metadata: metadata,
      ...(options.isPublic && { ACL: 'public-read' }),
      ...(options.expiresIn && { Expires: new Date(Date.now() + options.expiresIn * 1000) }),
    };

    try {
      const start = Date.now();
      const result = await s3Client.send(new PutObjectCommand(params));
      const duration = Date.now() - start;

      logger.info('S3 upload completed', {
        key,
        bucket,
        size: buffer.length,
        duration,
      });

      return {
        key,
        url: this.getCDNUrl(key),
        bucket,
        contentType,
        size: buffer.length,
        etag: result.ETag || '',
        metadata,
      };
    } catch (error) {
      logger.error('S3 upload failed', error instanceof Error ? error : undefined, {
        bucket,
        key,
      });
      throw error;
    }
  }

  async uploadFiles(
    files: Array<{ buffer: Buffer; name: string; options?: S3UploadOptions }>
  ): Promise<Array<{ name: string; result?: S3UploadResult; error?: string }>> {
    const results: Array<{ name: string; result?: S3UploadResult; error?: string }> = [];

    for (const file of files) {
      try {
        const result = await this.uploadFile(file.buffer, file.name, file.options || {});
        results.push({ name: file.name, result });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Batch S3 upload failed', error instanceof Error ? error : undefined, {
          fileName: file.name,
        });
        results.push({ name: file.name, error: message });
      }
    }

    return results;
  }

  async getFileInfo(key: string): Promise<S3FileInfo> {
    const bucket = this.ensureBucket();
    const params: HeadObjectCommandInput = {
      Bucket: bucket,
      Key: key,
    };

    const response = await s3Client.send(new HeadObjectCommand(params));

    return {
      key,
      size: response.ContentLength || 0,
      lastModified: response.LastModified || new Date(),
      etag: response.ETag || '',
      contentType: response.ContentType,
      metadata: response.Metadata,
    };
  }

  async deleteFile(key: string): Promise<void> {
    const bucket = this.ensureBucket();
    const params: DeleteObjectCommandInput = {
      Bucket: bucket,
      Key: key,
    };

    await s3Client.send(new DeleteObjectCommand(params));
  }

  async listFiles(prefix?: string, maxKeys = 1000): Promise<S3FileInfo[]> {
    const bucket = this.ensureBucket();
    const params: ListObjectsV2CommandInput = {
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: maxKeys,
    };

    const response = await s3Client.send(new ListObjectsV2Command(params));

    return (response.Contents || []).map(object => ({
      key: object.Key || '',
      size: object.Size || 0,
      lastModified: object.LastModified || new Date(),
      etag: object.ETag || '',
    }));
  }

  async getSignedDownloadUrl(key: string, expiresIn?: number): Promise<string> {
    const bucket = this.ensureBucket();
    const params: GetObjectCommandInput = {
      Bucket: bucket,
      Key: key,
    };

    return getSignedUrl(s3Client, new GetObjectCommand(params), {
      expiresIn: expiresIn || this.urlExpirationTime,
    });
  }

  async downloadFile(key: string, bucketOverride?: string): Promise<Buffer> {
    const bucket = bucketOverride || this.ensureBucket();
    const params: GetObjectCommandInput = {
      Bucket: bucket,
      Key: key,
    };

    const response = await s3Client.send(new GetObjectCommand(params));

    if (!response.Body) {
      throw new Error(`S3 object ${key} has no body`);
    }

    if (response.Body instanceof Buffer) {
      return response.Body;
    }

    if (typeof response.Body === 'string') {
      return Buffer.from(response.Body);
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  mapFormatToMime(format: string | undefined): string {
    return this.formatToMime(format);
  }
}

export const s3Service = new S3Service();
