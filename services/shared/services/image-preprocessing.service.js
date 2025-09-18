"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImagePreprocessingService = void 0;
const sharp_1 = __importDefault(require("sharp"));
const lambdaLogger_1 = __importDefault(require("../utils/lambdaLogger"));
class ImagePreprocessingService {
    /**
     * Process image with specified options
     */
    static async processImage(inputBuffer, options = {}) {
        const startTime = Date.now();
        const optimizations = [];
        const warnings = [];
        try {
            // Merge with default options based on purpose
            const purpose = options.purpose || 'storage';
            const defaultOptions = this.DEFAULT_OPTIONS[purpose] || this.DEFAULT_OPTIONS.storage;
            const finalOptions = { ...defaultOptions, ...options };
            lambdaLogger_1.default.info('Starting image preprocessing', {
                purpose: finalOptions.purpose,
                inputSize: inputBuffer.length,
                targetFormat: finalOptions.format,
            });
            // Get original metadata
            const originalImage = (0, sharp_1.default)(inputBuffer);
            const originalMetadata = await originalImage.metadata();
            if (!originalMetadata.width || !originalMetadata.height || !originalMetadata.format) {
                throw new Error('Unable to read image metadata');
            }
            // Start processing pipeline
            let processedImage = originalImage.clone();
            // 1. Handle rotation based on EXIF orientation
            if (originalMetadata.orientation && originalMetadata.orientation > 1) {
                processedImage = processedImage.rotate();
                optimizations.push('Auto-rotated based on EXIF orientation');
            }
            // 2. Resize if needed
            const { resizedImage, resizeApplied, actualDimensions } = await this.applyResizing(processedImage, originalMetadata, finalOptions);
            processedImage = resizedImage;
            if (resizeApplied && actualDimensions) {
                optimizations.push(`Resized to fit ${actualDimensions.width}x${actualDimensions.height}`);
            }
            // 3. Apply purpose-specific enhancements
            processedImage = await this.applyPurposeSpecificEnhancements(processedImage, finalOptions, optimizations, warnings);
            // 4. Remove metadata if requested
            if (finalOptions.removeMetadata) {
                processedImage = processedImage.withMetadata({});
                optimizations.push('Removed EXIF metadata for privacy');
            }
            // 5. Set output format and quality
            const { finalImage, outputFormat } = await this.applyOutputFormat(processedImage, originalMetadata.format, finalOptions, optimizations);
            // Get final buffer
            const outputBuffer = await finalImage.toBuffer();
            const processedMetadata = await (0, sharp_1.default)(outputBuffer).metadata();
            const processingTime = Date.now() - startTime;
            const compressionRatio = ((inputBuffer.length - outputBuffer.length) / inputBuffer.length) * 100;
            lambdaLogger_1.default.info('Image preprocessing completed', {
                purpose: finalOptions.purpose,
                originalSize: inputBuffer.length,
                processedSize: outputBuffer.length,
                compressionRatio: `${compressionRatio.toFixed(1)}%`,
                processingTime: `${processingTime}ms`,
                optimizations: optimizations.length,
            });
            return {
                buffer: outputBuffer,
                metadata: {
                    originalSize: inputBuffer.length,
                    processedSize: outputBuffer.length,
                    compressionRatio: Math.round(compressionRatio * 100) / 100,
                    originalFormat: originalMetadata.format,
                    outputFormat,
                    originalDimensions: {
                        width: originalMetadata.width,
                        height: originalMetadata.height,
                    },
                    processedDimensions: {
                        width: processedMetadata.width || 0,
                        height: processedMetadata.height || 0,
                    },
                    processingTime,
                },
                optimizations,
                warnings,
            };
        }
        catch (error) {
            const processingTime = Date.now() - startTime;
            lambdaLogger_1.default.error('Image preprocessing failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
                processingTime: `${processingTime}ms`,
            });
            throw new Error(`Image preprocessing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Apply resizing logic
     */
    static async applyResizing(image, metadata, options) {
        if (!metadata.width || !metadata.height || !options.maxWidth || !options.maxHeight) {
            return { resizedImage: image, resizeApplied: false };
        }
        const needsResize = metadata.width > options.maxWidth || metadata.height > options.maxHeight;
        if (!needsResize) {
            return { resizedImage: image, resizeApplied: false };
        }
        const resizedImage = image.resize(options.maxWidth, options.maxHeight, {
            fit: options.maintainAspectRatio !== false ? 'inside' : 'fill',
            withoutEnlargement: true,
            kernel: sharp_1.default.kernel.lanczos3, // High quality resampling
        });
        // Calculate actual dimensions based on aspect ratio preservation
        const originalAspectRatio = metadata.width / metadata.height;
        const maxAspectRatio = options.maxWidth / options.maxHeight;
        let actualWidth, actualHeight;
        if (originalAspectRatio > maxAspectRatio) {
            // Width is the limiting factor
            actualWidth = options.maxWidth;
            actualHeight = Math.round(options.maxWidth / originalAspectRatio);
        }
        else {
            // Height is the limiting factor
            actualHeight = options.maxHeight;
            actualWidth = Math.round(options.maxHeight * originalAspectRatio);
        }
        const actualDimensions = { width: actualWidth, height: actualHeight };
        return { resizedImage, resizeApplied: true, actualDimensions };
    }
    /**
     * Apply purpose-specific image enhancements
     */
    static async applyPurposeSpecificEnhancements(image, options, optimizations, 
    // eslint-disable-next-line no-unused-vars
    _warnings) {
        let processedImage = image;
        switch (options.purpose) {
            case 'ocr':
                // Optimize for OCR readability
                processedImage = processedImage.grayscale().normalize().sharpen(1, 1, 2);
                optimizations.push('Applied OCR optimizations (grayscale, normalize, sharpen)');
                break;
            case 'avatar':
                // Optimize for profile pictures
                processedImage = processedImage
                    .blur(0.3) // Slight blur to smooth skin
                    .sharpen(0.5, 1, 2);
                optimizations.push('Applied avatar optimizations (slight blur and sharpen)');
                break;
            case 'thumbnail':
                // Optimize for small previews
                processedImage = processedImage.sharpen(0.8, 1, 2); // Extra sharpening for small images
                optimizations.push('Applied thumbnail sharpening for clarity at small sizes');
                break;
            case 'web-display':
                // Optimize for web viewing
                processedImage = processedImage.sharpen(0.5, 1, 2);
                optimizations.push('Applied web display optimizations');
                break;
            case 'storage':
            default:
                // Minimal processing for archival storage
                processedImage = processedImage.sharpen(0.3, 1, 1); // Light sharpening
                optimizations.push('Applied storage optimizations (light sharpening)');
                break;
        }
        return processedImage;
    }
    /**
     * Apply output format and compression
     */
    static async applyOutputFormat(image, originalFormat, options, optimizations) {
        let outputFormat = options.format || 'auto';
        // Auto-select format if requested
        if (outputFormat === 'auto') {
            outputFormat = this.selectOptimalFormat(originalFormat, options.purpose);
            optimizations.push(`Auto-selected ${outputFormat} format for ${options.purpose}`);
        }
        let finalImage;
        switch (outputFormat) {
            case 'jpeg':
                finalImage = image.jpeg({
                    quality: options.quality || 85,
                    progressive: true,
                    mozjpeg: true, // Use mozjpeg encoder for better compression
                });
                break;
            case 'webp':
                finalImage = image.webp({
                    quality: options.quality || 80,
                    effort: options.optimize ? 6 : 3, // Higher effort for better compression
                });
                break;
            case 'png':
                finalImage = image.png({
                    quality: options.quality || 90,
                    progressive: true,
                    compressionLevel: options.optimize ? 9 : 6,
                });
                break;
            default:
                throw new Error(`Unsupported output format: ${outputFormat}`);
        }
        return { finalImage, outputFormat };
    }
    /**
     * Select optimal format based on purpose and original format
     */
    static selectOptimalFormat(originalFormat, purpose) {
        // For OCR, always use JPEG for consistency
        if (purpose === 'ocr') {
            return 'jpeg';
        }
        // For images with transparency, preserve as PNG or upgrade to WebP
        if (originalFormat === 'png') {
            return purpose === 'web-display' ? 'webp' : 'png';
        }
        // For thumbnails and web display, prefer WebP for better compression
        if (purpose === 'thumbnail' || purpose === 'web-display') {
            return 'webp';
        }
        // Default to JPEG for photographs
        return 'jpeg';
    }
    /**
     * Process multiple images in batch
     */
    static async processBatch(images, options = {}) {
        const results = new Array(images.length);
        lambdaLogger_1.default.info('Starting batch image preprocessing', {
            imageCount: images.length,
            purpose: options.purpose || 'storage',
        });
        // Process images while maintaining order
        const promises = images.map(async (image, index) => {
            try {
                const result = await this.processImage(image.buffer, options);
                results[index] = { name: image.name, result };
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                lambdaLogger_1.default.error('Batch processing failed for image', {
                    imageName: image.name,
                    error: errorMessage,
                });
                results[index] = { name: image.name, error: errorMessage };
            }
        });
        await Promise.all(promises);
        lambdaLogger_1.default.info('Batch image preprocessing completed', {
            totalImages: images.length,
            successfulImages: results.filter(r => r.result).length,
            failedImages: results.filter(r => r.error).length,
        });
        return results;
    }
    /**
     * Get preprocessing options for specific use case
     */
    static getOptionsForUseCase(useCase) {
        return { ...this.DEFAULT_OPTIONS[useCase] };
    }
    /**
     * Create multiple variants of an image for different purposes
     */
    static async createVariants(inputBuffer, variants) {
        const results = {};
        lambdaLogger_1.default.info('Creating image variants', {
            inputSize: inputBuffer.length,
            variantCount: variants.length,
        });
        // Process variants in parallel
        const promises = variants.map(async (variant) => {
            try {
                const result = await this.processImage(inputBuffer, variant.options);
                results[variant.name] = result;
            }
            catch (error) {
                lambdaLogger_1.default.error('Variant creation failed', {
                    variantName: variant.name,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
                throw error;
            }
        });
        await Promise.all(promises);
        lambdaLogger_1.default.info('Image variants created successfully', {
            variantNames: Object.keys(results),
        });
        return results;
    }
}
exports.ImagePreprocessingService = ImagePreprocessingService;
ImagePreprocessingService.DEFAULT_OPTIONS = {
    storage: {
        purpose: 'storage',
        quality: 85,
        maxWidth: 2048,
        maxHeight: 2048,
        format: 'jpeg',
        optimize: true,
        removeMetadata: true,
    },
    ocr: {
        purpose: 'ocr',
        quality: 95,
        maxWidth: 3000,
        maxHeight: 3000,
        format: 'jpeg',
        optimize: false, // Preserve quality for OCR
        removeMetadata: true,
    },
    thumbnail: {
        purpose: 'thumbnail',
        quality: 75,
        maxWidth: 300,
        maxHeight: 300,
        format: 'webp',
        optimize: true,
        removeMetadata: true,
    },
    avatar: {
        purpose: 'avatar',
        quality: 80,
        maxWidth: 512,
        maxHeight: 512,
        format: 'webp',
        optimize: true,
        removeMetadata: true,
    },
    'web-display': {
        purpose: 'web-display',
        quality: 80,
        maxWidth: 1920,
        maxHeight: 1080,
        format: 'webp',
        optimize: true,
        removeMetadata: true,
    },
};
exports.default = ImagePreprocessingService;
