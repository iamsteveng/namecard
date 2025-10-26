import { randomUUID } from 'node:crypto';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const FIVE_MINUTES = 5 * 60;

interface StoreScanImageOptions {
  buffer: Buffer;
  contentType?: string;
  tenantId: string;
  originalFileName?: string;
}

export interface StoredImageInfo {
  bucket: string;
  key: string;
  url: string;
  expiresInSeconds: number;
}

let s3Client: S3Client | null = null;

const resolveRegion = () => process.env['S3_REGION'] ?? process.env['AWS_REGION'] ?? 'us-east-1';

const getS3Client = () => {
  if (!s3Client) {
    s3Client = new S3Client({ region: resolveRegion() });
  }
  return s3Client;
};

const sanitizeFileName = (fileName?: string) => {
  if (!fileName) {
    return 'upload.jpg';
  }

  const name = fileName.split(/[\\/]/).pop() ?? 'upload.jpg';
  return name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-120) || 'upload.jpg';
};

const buildObjectKey = (tenantId: string, fileName?: string) => {
  const sanitized = sanitizeFileName(fileName);
  return `cards/${tenantId}/${randomUUID()}/${sanitized}`;
};

const resolveCdnDomain = () => process.env['S3_CDN_DOMAIN'];

const buildPublicUrl = (bucket: string, key: string): string => {
  const cdnDomain = resolveCdnDomain();
  if (cdnDomain) {
    const normalizedKey = key.replace(/^\//, '');
    return `https://${cdnDomain}/${normalizedKey}`;
  }

  const region = resolveRegion();
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
};

export const storeScanImage = async (
  options: StoreScanImageOptions
): Promise<StoredImageInfo | null> => {
  const bucket = process.env['S3_BUCKET_NAME'];
  if (!bucket) {
    return null;
  }

  const key = buildObjectKey(options.tenantId, options.originalFileName);
  const client = getS3Client();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: options.buffer,
      ContentType: options.contentType ?? 'image/jpeg',
      CacheControl: `public, max-age=${FIVE_MINUTES}`,
    })
  );

  return {
    bucket,
    key,
    url: buildPublicUrl(bucket, key),
    expiresInSeconds: FIVE_MINUTES,
  };
};
