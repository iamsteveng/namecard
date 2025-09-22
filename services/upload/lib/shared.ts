import {
  GetQueueUrlCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { v4 as uuidv4 } from 'uuid';

import {
  logger,
  ImagePreprocessingService,
  s3Service,
  ImageValidationService,
} from '@namecard/serverless-shared';
import type {
  S3UploadOptions,
  S3UploadResult,
} from '@namecard/serverless-shared';

const sqsClient = new SQSClient({});
const configuredQueueUrl = process.env['OCR_QUEUE_URL']?.trim();
const stage = process.env['STAGE'] || process.env['NODE_ENV'] || 'staging';
const configuredQueueName = process.env['OCR_QUEUE_NAME']?.trim();
const defaultQueueName = `namecard-ocr-queue-${stage}`;
const isOffline = process.env['IS_OFFLINE'] === 'true' || stage === 'local';

let resolvedQueueUrl: string | undefined;
let attemptedQueueResolution = false;

function extractQueueNameFromUrl(url: string | undefined) {
  if (!url) return undefined;
  try {
    const parts = url.split('/');
    return parts[parts.length - 1] || undefined;
  } catch (error) {
    logger.debug('Failed to extract queue name from URL', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

async function resolveOcrQueueUrl(): Promise<string | undefined> {
  if (resolvedQueueUrl) return resolvedQueueUrl;

  const queueStage = stage || 'staging';
  const queueNameFromUrl = extractQueueNameFromUrl(configuredQueueUrl);
  const expectedStageMatch = queueNameFromUrl?.includes(queueStage);

  if (configuredQueueUrl && expectedStageMatch) {
    resolvedQueueUrl = configuredQueueUrl;
    return resolvedQueueUrl;
  }

  if (configuredQueueUrl && !expectedStageMatch) {
    logger.warn('Configured OCR queue URL does not match current stage', {
      configuredQueueUrl,
      queueNameFromUrl,
      queueStage,
    });
  }

  if (isOffline) {
    logger.debug('Skipping OCR queue resolution in offline/local mode', {
      configuredQueueUrl,
      stage: queueStage,
    });
    return configuredQueueUrl;
  }

  if (!attemptedQueueResolution) {
    attemptedQueueResolution = true;

    const queueName = configuredQueueName || defaultQueueName;

    try {
      const response = await sqsClient.send(
        new GetQueueUrlCommand({ QueueName: queueName })
      );

      if (response.QueueUrl) {
        resolvedQueueUrl = response.QueueUrl;
        logger.info('Resolved OCR queue URL via GetQueueUrl', {
          queueName,
          resolvedQueueUrl,
        });
        return resolvedQueueUrl;
      }

      logger.error('GetQueueUrl returned no URL for OCR queue', undefined, { queueName });
    } catch (error) {
      logger.error(
        'Failed to resolve OCR queue URL via GetQueueUrl',
        error instanceof Error ? error : undefined,
        {
          queueName,
        }
      );
    }
  }

  if (configuredQueueUrl) {
    logger.warn('Falling back to configured OCR queue URL despite stage mismatch', {
      configuredQueueUrl,
      queueStage,
    });
    resolvedQueueUrl = configuredQueueUrl;
    return resolvedQueueUrl;
  }

  logger.debug('No OCR queue URL could be resolved', {
    queueStage,
    configuredQueueName,
  });
  return undefined;
}

export type ValidationResult = Awaited<ReturnType<typeof ImageValidationService.validateImage>>;
export type PreprocessResult = Awaited<ReturnType<typeof ImagePreprocessingService.processImage>>;

export interface VariantUploadInfo {
  upload: S3UploadResult;
  metadata: PreprocessResult['metadata'];
  optimizations: string[];
  warnings: string[];
}

export interface ProcessImageBufferOptions {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  userId: string;
  validationResult: ValidationResult;
}

export interface ProcessedImage {
  imageId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  userId: string;
  validation: ValidationResult;
  storageResult: PreprocessResult;
  originalUpload: S3UploadResult;
  storageUpload: S3UploadResult;
  variantUploads: Record<string, VariantUploadInfo>;
}

export function mapVariantToPurpose(name: string): NonNullable<S3UploadOptions['purpose']> {
  switch (name) {
    case 'ocr':
      return 'ocr';
    case 'thumbnail':
      return 'thumbnail';
    case 'web':
      return 'web-display';
    case 'original':
      return 'original';
    default:
      return 'storage';
  }
}

export function buildVariantSummary(
  upload: S3UploadResult | undefined,
  metadata?: PreprocessResult['metadata'],
  optimizations: string[] = []
) {
  if (!upload || !metadata) return undefined;

  return {
    size: metadata.processedSize,
    format: metadata.outputFormat,
    dimensions: metadata.processedDimensions,
    compressionRatio: metadata.compressionRatio,
    processingTime: metadata.processingTime,
    optimizations,
    url: upload.url,
    key: upload.key,
  };
}

export async function processImageBuffer(options: ProcessImageBufferOptions): Promise<ProcessedImage> {
  const { buffer, fileName, mimeType, userId, validationResult } = options;

  const storageOptions = ImagePreprocessingService.getOptionsForUseCase('storage');
  const storageResult = await ImagePreprocessingService.processImage(buffer, storageOptions);

  const variantResults = await ImagePreprocessingService.createVariants(buffer, [
    { name: 'ocr', options: { purpose: 'ocr' } },
    { name: 'thumbnail', options: { purpose: 'thumbnail' } },
    { name: 'web', options: { purpose: 'web-display' } },
  ]);

  const originalUpload = await s3Service.uploadFile(buffer, fileName, {
    userId,
    purpose: 'original',
    variant: 'raw',
    contentType: mimeType,
    originalName: fileName,
  });

  const storageUpload = await s3Service.uploadFile(storageResult.buffer, fileName, {
    userId,
    purpose: 'storage',
    variant: 'optimized',
    contentType: s3Service.mapFormatToMime(storageResult.metadata.outputFormat),
    originalName: fileName,
  });

  const variantUploads: Record<string, VariantUploadInfo> = {};

  for (const [name, result] of Object.entries(variantResults)) {
    const upload = await s3Service.uploadFile(result.buffer, fileName, {
      userId,
      purpose: mapVariantToPurpose(name),
      variant: name,
      contentType: s3Service.mapFormatToMime(result.metadata.outputFormat),
      originalName: fileName,
    });

    variantUploads[name] = {
      upload,
      metadata: result.metadata,
      optimizations: result.optimizations,
      warnings: result.warnings,
    };
  }

  return {
    imageId: uuidv4(),
    fileName,
    mimeType,
    fileSize: buffer.length,
    userId,
    validation: validationResult,
    storageResult,
    originalUpload,
    storageUpload,
    variantUploads,
  };
}

export function buildUploadResponse(processed: ProcessedImage) {
  return {
    id: processed.imageId,
    originalName: processed.fileName,
    size: processed.fileSize,
    mimeType: processed.mimeType,
    uploadedAt: new Date().toISOString(),
    uploadedBy: processed.userId,
    status: 'processed',
    files: [
      {
        id: processed.imageId,
        key: processed.storageUpload.key,
        bucket: processed.storageUpload.bucket,
        url: processed.storageUpload.url,
        originalKey: processed.originalUpload.key,
        variants: {
          original: processed.originalUpload.url,
          optimized: processed.storageUpload.url,
          ocr: processed.variantUploads['ocr']?.upload.url || processed.storageUpload.url,
          thumbnail:
            processed.variantUploads['thumbnail']?.upload.url || processed.storageUpload.url,
          web: processed.variantUploads['web']?.upload.url || processed.storageUpload.url,
        },
      },
    ],
    validation: {
      isValid: processed.validation.isValid,
      warnings: processed.validation.warnings,
      metadata: processed.validation.metadata,
    },
    processing: {
      primaryResult: {
        size: processed.storageResult.metadata.processedSize,
        format: processed.storageResult.metadata.outputFormat,
        dimensions: processed.storageResult.metadata.processedDimensions,
        compressionRatio: processed.storageResult.metadata.compressionRatio,
        processingTime: processed.storageResult.metadata.processingTime,
        optimizations: processed.storageResult.optimizations,
        warnings: processed.storageResult.warnings,
      },
      variants: {
        ocr: buildVariantSummary(
          processed.variantUploads['ocr']?.upload,
          processed.variantUploads['ocr']?.metadata,
          processed.variantUploads['ocr']?.optimizations
        ),
        thumbnail: buildVariantSummary(
          processed.variantUploads['thumbnail']?.upload,
          processed.variantUploads['thumbnail']?.metadata,
          processed.variantUploads['thumbnail']?.optimizations
        ),
        web: buildVariantSummary(
          processed.variantUploads['web']?.upload,
          processed.variantUploads['web']?.metadata,
          processed.variantUploads['web']?.optimizations
        ),
      },
    },
    storage: {
      original: processed.originalUpload,
      optimized: processed.storageUpload,
      variants: Object.fromEntries(
        Object.entries(processed.variantUploads).map(([name, value]) => [name, value.upload])
      ),
    },
  };
}

export function buildOcrQueuePayload(processed: ProcessedImage, requestId: string) {
  return {
    type: 'OCR_REQUEST',
    version: '2025-01-01',
    stage: process.env['STAGE'] || 'staging',
    requestId,
    imageId: processed.imageId,
    userId: processed.userId,
    bucket: processed.storageUpload.bucket,
    originalKey: processed.originalUpload.key,
    optimizedKey: processed.storageUpload.key,
    ocrKey: processed.variantUploads['ocr']?.upload.key || processed.storageUpload.key,
    mimeType:
      processed.variantUploads['ocr']?.upload.contentType || processed.mimeType,
    uploadedAt: new Date().toISOString(),
    metadata: {
      validationWarnings: processed.validation.warnings,
    },
  };
}

export async function enqueueOcrJob(payload: Record<string, unknown>) {
  const queueUrl = await resolveOcrQueueUrl();

  if (!queueUrl) {
    logger.debug('Skipping OCR queue enqueue: no queue URL available', {
      stage,
    });
    return;
  }

  try {
    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(payload),
      })
    );
    logger.debug('OCR job enqueued', { queueUrl });
  } catch (error) {
    logger.error('Failed to enqueue OCR job', error instanceof Error ? error : undefined, {
      queueUrl,
    });
  }
}
