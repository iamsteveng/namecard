// import path from 'path'; // Currently unused

import { Router, Request, Response } from 'express';
import multer from 'multer';

import { authenticateToken } from '../middleware/auth.middleware.js';
import { AppError } from '../middleware/error.middleware.js';
import ImagePreprocessingService from '../services/image-preprocessing.service.js';
import ImageValidationService from '../services/image-validation.service.js';
import logger from '../utils/logger.js';

const router: Router = Router();

// Configure multer for memory storage (we'll process files in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5, // Maximum 5 files at once
  },
  fileFilter: (req, file, cb) => {
    // Allow common image formats
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/bmp',
      'image/tiff',
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(`Invalid file type: ${file.mimetype}. Only image files are allowed.`, 400));
    }
  },
});

/**
 * @route POST /api/v1/upload/image
 * @desc Upload a single image file
 * @access Private (requires JWT token)
 */
router.post(
  '/image',
  authenticateToken,
  upload.single('image'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        throw new AppError('No image file provided', 400);
      }

      const { file, user } = req;

      logger.info('Image upload received', {
        userId: user?.id,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
      });

      // Comprehensive image validation
      const validationConfig = ImageValidationService.getConfigForUseCase('business-card');
      const validationResult = await ImageValidationService.validateImage(
        file.buffer,
        file.originalname,
        validationConfig
      );

      // Return validation errors if image is invalid
      if (!validationResult.isValid) {
        throw new AppError(`Image validation failed: ${validationResult.errors.join(', ')}`, 400);
      }

      // Apply image preprocessing for business card optimization
      const preprocessingOptions = ImagePreprocessingService.getOptionsForUseCase('storage');
      const preprocessingResult = await ImagePreprocessingService.processImage(
        file.buffer,
        preprocessingOptions
      );

      // Create variants for different use cases
      const variants = await ImagePreprocessingService.createVariants(file.buffer, [
        { name: 'original', options: { purpose: 'storage' } },
        { name: 'ocr', options: { purpose: 'ocr' } },
        { name: 'thumbnail', options: { purpose: 'thumbnail' } },
        { name: 'web', options: { purpose: 'web-display' } },
      ]);

      // Build response with validation and preprocessing metadata
      const response = {
        success: true,
        message: 'Image uploaded, validated, and processed successfully',
        data: {
          id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          originalName: file.originalname,
          size: file.size,
          mimeType: file.mimetype,
          uploadedAt: new Date().toISOString(),
          uploadedBy: user?.id,
          status: 'processed',
          validation: {
            isValid: validationResult.isValid,
            warnings: validationResult.warnings,
            metadata: validationResult.metadata,
          },
          processing: {
            primaryResult: {
              size: preprocessingResult.metadata.processedSize,
              format: preprocessingResult.metadata.outputFormat,
              dimensions: preprocessingResult.metadata.processedDimensions,
              compressionRatio: preprocessingResult.metadata.compressionRatio,
              processingTime: preprocessingResult.metadata.processingTime,
              optimizations: preprocessingResult.optimizations,
              warnings: preprocessingResult.warnings,
            },
            variants: Object.keys(variants).reduce(
              (acc, key) => {
                const variant = variants[key];
                acc[key] = {
                  size: variant.metadata.processedSize,
                  format: variant.metadata.outputFormat,
                  dimensions: variant.metadata.processedDimensions,
                  compressionRatio: variant.metadata.compressionRatio,
                  optimizations: variant.optimizations,
                };
                return acc;
              },
              {} as Record<string, any>
            ),
          },
        },
      };

      // Log warnings if any
      if (validationResult.warnings.length > 0) {
        logger.warn('Image validation warnings', {
          userId: user?.id,
          fileName: file.originalname,
          warnings: validationResult.warnings,
        });
      }

      logger.info('Image upload completed', {
        userId: user?.id,
        fileId: response.data.id,
        fileName: file.originalname,
        validation: {
          isValid: validationResult.isValid,
          warnings: validationResult.warnings.length,
          dimensions: validationResult.metadata
            ? `${validationResult.metadata.width}x${validationResult.metadata.height}`
            : 'unknown',
        },
      });

      res.status(201).json(response);
    } catch (error) {
      logger.error('Image upload failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.id,
        fileName: req.file?.originalname,
      });

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError('Image upload failed', 500);
    }
  }
);

/**
 * @route POST /api/v1/upload/images
 * @desc Upload multiple image files
 * @access Private (requires JWT token)
 */
router.post(
  '/images',
  authenticateToken,
  upload.array('images', 5),
  async (req: Request, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        throw new AppError('No image files provided', 400);
      }

      const { user } = req;

      logger.info('Multiple images upload received', {
        userId: user?.id,
        fileCount: files.length,
        totalSize: files.reduce((sum, file) => sum + file.size, 0),
      });

      // Comprehensive batch validation
      const validationConfig = ImageValidationService.getConfigForUseCase('business-card');
      const fileData = files.map(file => ({
        buffer: file.buffer,
        originalName: file.originalname,
      }));

      const batchValidationResult = await ImageValidationService.validateImages(
        fileData,
        validationConfig
      );

      // Check if batch validation failed
      if (!batchValidationResult.overallValid) {
        const invalidFiles = batchValidationResult.results
          .map((result, index) => ({
            file: files[index].originalname,
            errors: result.errors,
          }))
          .filter(item => item.errors.length > 0);

        const errorMessage = invalidFiles
          .map(item => `${item.file}: ${item.errors.join(', ')}`)
          .join('; ');

        throw new AppError(
          `Batch validation failed for ${invalidFiles.length} file(s): ${errorMessage}`,
          400
        );
      }

      // Process each file with validation and preprocessing
      const imageData = files.map(file => ({
        buffer: file.buffer,
        name: file.originalname,
      }));

      // Batch preprocessing for efficiency
      const batchProcessingResults = await ImagePreprocessingService.processBatch(imageData, {
        purpose: 'storage',
      });

      const uploadedFiles = files.map((file, index) => {
        const validationResult = batchValidationResult.results[index];
        const processingResult = batchProcessingResults.find(r => r.name === file.originalname);

        logger.debug('Processing file in batch', {
          index: index + 1,
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          isValid: validationResult.isValid,
          warnings: validationResult.warnings.length,
          processed: !!processingResult?.result,
        });

        const baseData = {
          id: `temp_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
          originalName: file.originalname,
          size: file.size,
          mimeType: file.mimetype,
          uploadedAt: new Date().toISOString(),
          validation: {
            isValid: validationResult.isValid,
            warnings: validationResult.warnings,
            metadata: validationResult.metadata,
          },
        };

        // Add processing results if successful
        if (processingResult?.result) {
          return {
            ...baseData,
            status: 'processed',
            processing: {
              size: processingResult.result.metadata.processedSize,
              format: processingResult.result.metadata.outputFormat,
              dimensions: processingResult.result.metadata.processedDimensions,
              compressionRatio: processingResult.result.metadata.compressionRatio,
              processingTime: processingResult.result.metadata.processingTime,
              optimizations: processingResult.result.optimizations,
              warnings: processingResult.result.warnings,
            },
          };
        } else {
          return {
            ...baseData,
            status: 'validated',
            processing: {
              error: processingResult?.error || 'Processing failed',
            },
          };
        }
      });

      const processedFiles = uploadedFiles.filter(f => f.status === 'processed').length;
      const processingErrors = uploadedFiles.filter(
        f => f.status === 'validated' && f.processing?.error
      ).length;

      const response = {
        success: true,
        message: `${files.length} images uploaded, validated, and processed successfully`,
        data: {
          files: uploadedFiles,
          totalFiles: files.length,
          validFiles: batchValidationResult.results.filter(r => r.isValid).length,
          processedFiles,
          processingErrors,
          totalSize: files.reduce((sum, file) => sum + file.size, 0),
          uploadedBy: user?.id,
          validation: {
            summary: batchValidationResult.summary,
            overallValid: batchValidationResult.overallValid,
          },
          processing: {
            summary: `${processedFiles}/${files.length} files processed successfully`,
            totalProcessingTime: batchProcessingResults
              .filter(r => r.result)
              .reduce((sum, r) => sum + (r.result?.metadata.processingTime || 0), 0),
          },
        },
      };

      logger.info('Multiple images upload completed', {
        userId: user?.id,
        fileCount: files.length,
        fileIds: uploadedFiles.map(f => f.id),
      });

      res.status(201).json(response);
    } catch (error) {
      logger.error('Multiple images upload failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.id,
        fileCount: req.files ? (req.files as Express.Multer.File[]).length : 0,
      });

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError('Multiple images upload failed', 500);
    }
  }
);

/**
 * @route GET /api/v1/upload/health
 * @desc Health check for upload service
 * @access Public
 */
router.get('/health', (req: Request, res: Response) => {
  const businessCardConfig = ImageValidationService.getConfigForUseCase('business-card');
  const storageOptions = ImagePreprocessingService.getOptionsForUseCase('storage');

  res.json({
    success: true,
    service: 'Upload Service with Advanced Validation',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    features: {
      singleUpload: true,
      multipleUpload: true,
      batchValidation: true,
      batchProcessing: true,
      comprehensiveValidation: true,
      imagePreprocessing: true,
      variantGeneration: true,
      securityChecks: true,
      maxFileSize: `${(businessCardConfig.maxFileSize / 1024 / 1024).toFixed(0)}MB`,
      maxFiles: businessCardConfig.maxFiles,
      supportedFormats: businessCardConfig.allowedFormats,
      validation: {
        imageDimensions: true,
        aspectRatio: true,
        fileSignature: true,
        contentSecurity: true,
        qualityAnalysis: true,
      },
      preprocessing: {
        purposes: ['storage', 'ocr', 'thumbnail', 'avatar', 'web-display'],
        optimizations: ['resizing', 'format-conversion', 'compression', 'enhancement'],
        outputFormats: ['jpeg', 'png', 'webp'],
        variantCreation: true,
        batchProcessing: true,
        qualityControl: true,
      },
      useCases: ['business-card', 'profile-avatar', 'document', 'general'],
    },
    performance: {
      defaultQuality: storageOptions.quality,
      maxDimensions: `${storageOptions.maxWidth}x${storageOptions.maxHeight}`,
      concurrentProcessing: 3,
      autoFormatSelection: true,
      metadataRemoval: storageOptions.removeMetadata,
    },
  });
});

export default router;
