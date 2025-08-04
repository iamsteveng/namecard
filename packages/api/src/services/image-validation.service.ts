import sharp from 'sharp';
import { AppError } from '../middleware/error.middleware.js';
import logger from '../utils/logger.js';

export interface ImageValidationConfig {
  maxFileSize: number; // bytes
  maxWidth: number;
  maxHeight: number;
  minWidth: number;
  minHeight: number;
  allowedFormats: string[];
  maxFiles: number;
  requireSquareAspect?: boolean;
  maxAspectRatio?: number; // width/height ratio
  lenientSecurity?: boolean; // For business cards and other legitimate use cases
}

export interface ImageValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metadata?: {
    format: string;
    width: number;
    height: number;
    size: number;
    aspectRatio: number;
    hasAlpha: boolean;
    channels: number;
    density?: number;
  };
}

export class ImageValidationService {
  private static readonly DEFAULT_CONFIG: ImageValidationConfig = {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxWidth: 4096,
    maxHeight: 4096,
    minWidth: 32,
    minHeight: 32,
    maxFiles: 5,
    maxAspectRatio: 10, // 10:1 ratio max
    allowedFormats: ['jpeg', 'jpg', 'png', 'gif', 'webp', 'bmp', 'tiff'],
  };

  /**
   * Validate image file buffer with comprehensive checks
   */
  static async validateImage(
    buffer: Buffer,
    originalName: string,
    config: Partial<ImageValidationConfig> = {}
  ): Promise<ImageValidationResult> {
    const validationConfig = { ...this.DEFAULT_CONFIG, ...config };
    const result: ImageValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    try {
      logger.debug('Starting image validation', {
        fileName: originalName,
        bufferSize: buffer.length,
      });

      // Step 1: Basic file size validation
      if (buffer.length > validationConfig.maxFileSize) {
        result.errors.push(
          `File size ${(buffer.length / 1024 / 1024).toFixed(2)}MB exceeds maximum allowed size of ${(validationConfig.maxFileSize / 1024 / 1024).toFixed(2)}MB`
        );
      }

      if (buffer.length === 0) {
        result.errors.push('File is empty');
        result.isValid = false;
        return result;
      }

      // Step 2: Try to process with Sharp to validate image format
      let image: sharp.Sharp;
      let metadata: sharp.Metadata;

      try {
        image = sharp(buffer);
        metadata = await image.metadata();
      } catch (error) {
        result.errors.push('Invalid image format or corrupted file');
        result.isValid = false;
        return result;
      }

      // Step 3: Extract and validate metadata
      if (!metadata.format) {
        result.errors.push('Unable to determine image format');
        result.isValid = false;
        return result;
      }

      // Check format against allowed list
      if (!validationConfig.allowedFormats.includes(metadata.format.toLowerCase())) {
        result.errors.push(
          `Format '${metadata.format}' not allowed. Supported formats: ${validationConfig.allowedFormats.join(', ')}`
        );
      }

      // Step 4: Dimension validation
      const width = metadata.width || 0;
      const height = metadata.height || 0;

      if (width === 0 || height === 0) {
        result.errors.push('Unable to determine image dimensions');
        result.isValid = false;
        return result;
      }

      if (width < validationConfig.minWidth || height < validationConfig.minHeight) {
        result.errors.push(
          `Image dimensions ${width}x${height} are too small. Minimum required: ${validationConfig.minWidth}x${validationConfig.minHeight}`
        );
      }

      if (width > validationConfig.maxWidth || height > validationConfig.maxHeight) {
        result.errors.push(
          `Image dimensions ${width}x${height} are too large. Maximum allowed: ${validationConfig.maxWidth}x${validationConfig.maxHeight}`
        );
      }

      // Step 5: Aspect ratio validation
      const aspectRatio = width / height;
      if (validationConfig.maxAspectRatio && aspectRatio > validationConfig.maxAspectRatio) {
        result.errors.push(
          `Image aspect ratio ${aspectRatio.toFixed(2)}:1 exceeds maximum allowed ratio of ${validationConfig.maxAspectRatio}:1`
        );
      }

      if (validationConfig.maxAspectRatio && (1 / aspectRatio) > validationConfig.maxAspectRatio) {
        result.errors.push(
          `Image aspect ratio 1:${(1 / aspectRatio).toFixed(2)} exceeds maximum allowed ratio of 1:${validationConfig.maxAspectRatio}`
        );
      }

      // Step 6: Square aspect ratio check if required
      if (validationConfig.requireSquareAspect && Math.abs(aspectRatio - 1) > 0.1) {
        result.errors.push('Image must have a square aspect ratio (1:1)');
      }

      // Step 7: Additional quality checks and warnings
      const channels = metadata.channels || 0;
      const hasAlpha = metadata.hasAlpha || false;

      // Warn about very large files that might be slow to process
      if (buffer.length > 5 * 1024 * 1024) {
        result.warnings.push('Large file size may result in slower processing');
      }

      // Warn about very high resolution images
      if (width * height > 16 * 1024 * 1024) { // 16MP
        result.warnings.push('Very high resolution image may require significant processing time');
      }

      // Warn about unusual color spaces
      if (metadata.space && !['srgb', 'rgb'].includes(metadata.space.toLowerCase())) {
        result.warnings.push(`Unusual color space detected: ${metadata.space}. Image may be converted to sRGB`);
      }

      // Step 8: Security checks
      await this.performSecurityChecks(buffer, metadata, result, validationConfig);

      // Step 9: Build metadata response
      result.metadata = {
        format: metadata.format as string,
        width,
        height,
        size: buffer.length,
        aspectRatio: Math.round(aspectRatio * 100) / 100,
        hasAlpha,
        channels,
        density: metadata.density || 72,
      };

      // Set final validation result
      result.isValid = result.errors.length === 0;

      logger.info('Image validation completed', {
        fileName: originalName,
        isValid: result.isValid,
        errors: result.errors.length,
        warnings: result.warnings.length,
        dimensions: `${width}x${height}`,
        format: metadata.format,
      });

      return result;

    } catch (error) {
      logger.error('Image validation failed', {
        fileName: originalName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      result.errors.push('Validation process failed');
      result.isValid = false;
      return result;
    }
  }

  /**
   * Validate multiple images in batch
   */
  static async validateImages(
    files: Array<{ buffer: Buffer; originalName: string }>,
    config: Partial<ImageValidationConfig> = {}
  ): Promise<{ results: ImageValidationResult[]; overallValid: boolean; summary: string }> {
    const validationConfig = { ...this.DEFAULT_CONFIG, ...config };
    
    // Check file count limit
    if (files.length > validationConfig.maxFiles) {
      throw new AppError(
        `Too many files. Maximum ${validationConfig.maxFiles} files allowed, received ${files.length}`,
        400
      );
    }

    const results: ImageValidationResult[] = [];
    let totalValid = 0;
    let totalErrors = 0;
    let totalWarnings = 0;

    // Validate each file
    for (const file of files) {
      const result = await this.validateImage(file.buffer, file.originalName, config);
      results.push(result);
      
      if (result.isValid) {
        totalValid++;
      }
      totalErrors += result.errors.length;
      totalWarnings += result.warnings.length;
    }

    const overallValid = totalValid === files.length;
    const summary = `${totalValid}/${files.length} files valid, ${totalErrors} errors, ${totalWarnings} warnings`;

    logger.info('Batch image validation completed', {
      totalFiles: files.length,
      validFiles: totalValid,
      totalErrors,
      totalWarnings,
      overallValid,
    });

    return {
      results,
      overallValid,
      summary,
    };
  }

  /**
   * Perform security checks on image data
   */
  private static async performSecurityChecks(
    buffer: Buffer,
    metadata: sharp.Metadata,
    result: ImageValidationResult,
    config: ImageValidationConfig
  ): Promise<void> {
    try {
      // Check 1: Look for suspicious file signatures in header only (first 512 bytes)
      const header = buffer.subarray(0, Math.min(512, buffer.length));
      
      // Check for embedded scripts or suspicious patterns only in header/metadata areas
      // This reduces false positives from binary image data
      const suspiciousPatterns = [
        Buffer.from('<script', 'utf8'),
        Buffer.from('javascript:', 'utf8'),
        Buffer.from('<?php', 'utf8'),
        Buffer.from('<%', 'utf8'),
      ];

      // Check for suspicious patterns - be more lenient for business cards
      if (config.lenientSecurity) {
        // For business cards, only check the first 512 bytes (header area) and just warn
        const headerToCheck = buffer.subarray(0, Math.min(512, buffer.length));
        for (const pattern of suspiciousPatterns) {
          if (headerToCheck.includes(pattern)) {
            result.warnings.push('Potential suspicious pattern detected in image header (likely false positive for business card)');
            logger.debug('Suspicious pattern detected in business card image header (lenient mode)', {
              pattern: pattern.toString(),
            });
            break; // Only warn once
          }
        }
      } else {
        // For other use cases, check first 1KB and treat as potential error
        const headerToCheck = buffer.subarray(0, Math.min(1024, buffer.length));
        for (const pattern of suspiciousPatterns) {
          if (headerToCheck.includes(pattern)) {
            result.warnings.push('Potential suspicious pattern detected in image header (may be false positive)');
            logger.warn('Suspicious pattern detected in image header', {
              pattern: pattern.toString(),
            });
            break; // Only warn once
          }
        }
      }

      // Additional check in header area for metadata issues
      for (const pattern of suspiciousPatterns) {
        if (header.includes(pattern)) {
          result.warnings.push('Potential embedded content detected in image metadata');
          break;
        }
      }

      // Check 2: Validate file signature matches format
      const formatSignatures: Record<string, Buffer[]> = {
        jpeg: [Buffer.from([0xFF, 0xD8, 0xFF])],
        png: [Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])],
        gif: [Buffer.from('GIF87a', 'ascii'), Buffer.from('GIF89a', 'ascii')],
        bmp: [Buffer.from([0x42, 0x4D])],
        webp: [Buffer.from('WEBP', 'ascii')],
      };

      if (metadata.format && formatSignatures[metadata.format]) {
        const expectedSignatures = formatSignatures[metadata.format];
        const matchesSignature = expectedSignatures.some(sig => 
          buffer.subarray(0, sig.length).equals(sig) || 
          buffer.includes(sig)
        );

        if (!matchesSignature) {
          result.warnings.push(`File signature doesn't match expected format for ${metadata.format}`);
        }
      }

      // Check 3: Reasonable file size for dimensions
      if (metadata.width && metadata.height) {
        const pixelCount = metadata.width * metadata.height;
        const bytesPerPixel = buffer.length / pixelCount;
        
        // Warn if compression seems unusual (too high or too low)
        if (bytesPerPixel < 0.1) {
          result.warnings.push('Unusually high compression detected');
        } else if (bytesPerPixel > 10) {
          result.warnings.push('Unusually low compression detected');
        }
      }

    } catch (error) {
      logger.warn('Security check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't fail validation for security check errors, just log them
    }
  }

  /**
   * Get validation config for different use cases
   */
  static getConfigForUseCase(useCase: 'business-card' | 'profile-avatar' | 'document' | 'general'): ImageValidationConfig {
    const baseConfig = { ...this.DEFAULT_CONFIG };

    switch (useCase) {
      case 'business-card':
        return {
          ...baseConfig,
          maxFileSize: 5 * 1024 * 1024, // 5MB for business cards
          maxWidth: 2048,
          maxHeight: 2048,
          minWidth: 200,
          minHeight: 200,
          maxAspectRatio: 2.5, // Business cards are typically rectangular
          allowedFormats: ['jpeg', 'jpg', 'png', 'webp'],
          lenientSecurity: true, // Business cards can have complex layouts that trigger false positives
        };

      case 'profile-avatar':
        return {
          ...baseConfig,
          maxFileSize: 2 * 1024 * 1024, // 2MB for avatars
          maxWidth: 1024,
          maxHeight: 1024,
          minWidth: 64,
          minHeight: 64,
          requireSquareAspect: true,
          allowedFormats: ['jpeg', 'jpg', 'png', 'webp'],
        };

      case 'document':
        return {
          ...baseConfig,
          maxFileSize: 20 * 1024 * 1024, // 20MB for documents
          maxWidth: 8192,
          maxHeight: 8192,
          minWidth: 100,
          minHeight: 100,
          maxAspectRatio: 5, // Documents can be quite rectangular
          allowedFormats: ['jpeg', 'jpg', 'png', 'tiff', 'webp'],
        };

      default:
        return baseConfig;
    }
  }
}

export default ImageValidationService;