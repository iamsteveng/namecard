"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.textractService = void 0;
const client_textract_1 = require("@aws-sdk/client-textract");
const sharp_1 = __importDefault(require("sharp"));
const env_1 = require("../config/env");
const lambdaLogger_1 = __importDefault(require("../utils/lambdaLogger"));
// AWS Textract configuration
const textractClient = new client_textract_1.TextractClient({
    region: env_1.env.aws?.region || 'us-east-1',
    // For local development, use dummy credentials
    ...(env_1.env.isDevelopment && {
        credentials: {
            accessKeyId: 'dummy',
            secretAccessKey: 'dummy',
        },
        endpoint: 'http://localhost:4566', // LocalStack endpoint for testing
    }),
});
class TextractService {
    constructor() {
        this.maxImageSize = 10 * 1024 * 1024; // 10MB limit
        this.supportedFormats = ['image/jpeg', 'image/png', 'image/webp'];
        this.minConfidence = 50; // Minimum confidence threshold
    }
    /**
     * Preprocess image for optimal OCR results
     */
    async preprocessImage(imageBuffer) {
        try {
            const image = (0, sharp_1.default)(imageBuffer);
            const metadata = await image.metadata();
            lambdaLogger_1.default.info('Preprocessing image for OCR', {
                originalSize: imageBuffer.length,
                format: metadata.format,
                dimensions: `${metadata.width}x${metadata.height}`,
            });
            // Resize if too large (max 3000px on longest side)
            let processed = image;
            if (metadata.width && metadata.height) {
                const maxDimension = Math.max(metadata.width, metadata.height);
                if (maxDimension > 3000) {
                    processed = image.resize(3000, 3000, {
                        fit: 'inside',
                        withoutEnlargement: true,
                    });
                }
            }
            // Enhance for OCR: convert to grayscale, increase contrast, sharpen
            const result = await processed
                .grayscale()
                .normalize()
                .sharpen(1, 1, 2)
                .jpeg({ quality: 95 }) // High quality JPEG for OCR
                .toBuffer();
            lambdaLogger_1.default.info('Image preprocessing completed', {
                processedSize: result.length,
                compressionRatio: (((imageBuffer.length - result.length) / imageBuffer.length) * 100).toFixed(1) + '%',
            });
            return result;
        }
        catch (error) {
            lambdaLogger_1.default.error('Image preprocessing failed', { error: error.message });
            throw new Error(`Image preprocessing failed: ${error.message}`);
        }
    }
    /**
     * Validate image before processing
     */
    validateImage(imageBuffer, mimeType) {
        if (imageBuffer.length > this.maxImageSize) {
            throw new Error(`Image size ${imageBuffer.length} bytes exceeds maximum allowed size of ${this.maxImageSize} bytes`);
        }
        if (!this.supportedFormats.includes(mimeType)) {
            throw new Error(`Unsupported image format: ${mimeType}. Supported formats: ${this.supportedFormats.join(', ')}`);
        }
        if (imageBuffer.length < 1024) {
            throw new Error('Image file appears to be too small or corrupted');
        }
    }
    /**
     * Convert AWS Textract Block to our TextractBlock format
     */
    convertBlock(block) {
        const converted = {
            id: block.Id || '',
            blockType: block.BlockType || '',
            text: block.Text || '',
            confidence: block.Confidence || 0,
        };
        // Convert geometry if present
        if (block.Geometry) {
            converted.geometry = {};
            if (block.Geometry.BoundingBox) {
                const bb = block.Geometry.BoundingBox;
                converted.geometry.boundingBox = {
                    width: bb.Width || 0,
                    height: bb.Height || 0,
                    left: bb.Left || 0,
                    top: bb.Top || 0,
                };
            }
            if (block.Geometry.Polygon) {
                converted.geometry.polygon = block.Geometry.Polygon.map(point => ({
                    x: point.X || 0,
                    y: point.Y || 0,
                }));
            }
        }
        // Convert relationships if present
        if (block.Relationships) {
            converted.relationships = block.Relationships.map(rel => ({
                type: rel.Type || '',
                ids: rel.Ids || [],
            }));
        }
        return converted;
    }
    /**
     * Extract text using AWS Textract Analyze Document API
     */
    async extractText(imageBuffer, mimeType) {
        const startTime = Date.now();
        try {
            // Validate and preprocess image
            this.validateImage(imageBuffer, mimeType);
            const processedImage = await this.preprocessImage(imageBuffer);
            lambdaLogger_1.default.info('Starting Textract analysis', {
                imageSize: processedImage.length,
                mimeType,
            });
            // Use AnalyzeDocument for better structured text extraction
            const command = new client_textract_1.AnalyzeDocumentCommand({
                Document: {
                    Bytes: processedImage,
                },
                FeatureTypes: ['TABLES', 'FORMS'], // Extract structured content
            });
            const response = await textractClient.send(command);
            const processingTime = Date.now() - startTime;
            if (!response.Blocks || response.Blocks.length === 0) {
                throw new Error('No text detected in the image');
            }
            // Convert blocks and calculate metrics
            const blocks = response.Blocks.map(block => this.convertBlock(block));
            const textBlocks = blocks.filter(block => block.blockType === 'LINE' && block.text);
            const rawText = textBlocks.map(block => block.text).join('\n');
            // Calculate average confidence for text blocks
            const confidenceScores = textBlocks
                .map(block => block.confidence)
                .filter((confidence) => confidence !== undefined);
            const averageConfidence = confidenceScores.length > 0
                ? confidenceScores.reduce((sum, conf) => sum + conf, 0) / confidenceScores.length
                : 0;
            // Get image dimensions from Sharp
            const imageMetadata = await (0, sharp_1.default)(processedImage).metadata();
            const result = {
                blocks,
                rawText,
                confidence: averageConfidence,
                metadata: {
                    processingTime,
                    imageSize: {
                        width: imageMetadata.width || 0,
                        height: imageMetadata.height || 0,
                    },
                    totalBlocks: blocks.length,
                },
            };
            lambdaLogger_1.default.info('Textract analysis completed', {
                processingTime,
                totalBlocks: blocks.length,
                textBlocks: textBlocks.length,
                averageConfidence: averageConfidence.toFixed(1),
                extractedLength: rawText.length,
            });
            return result;
        }
        catch (error) {
            const processingTime = Date.now() - startTime;
            lambdaLogger_1.default.error('Textract analysis failed', {
                error: error.message,
                processingTime,
                errorCode: error.code,
            });
            // Handle specific AWS Textract errors
            if (error.name === 'InvalidParameterException') {
                throw new Error('Invalid image format or corrupted image file');
            }
            else if (error.name === 'DocumentTooLargeException') {
                throw new Error('Image file is too large for processing');
            }
            else if (error.name === 'UnsupportedDocumentException') {
                throw new Error('Unsupported image format');
            }
            else if (error.name === 'ThrottlingException') {
                throw new Error('Too many requests. Please try again later.');
            }
            else if (error.name === 'AccessDeniedException') {
                throw new Error('AWS credentials invalid or insufficient permissions');
            }
            throw error;
        }
    }
    /**
     * Simple text detection using DetectDocumentText (faster, basic OCR)
     */
    async detectText(imageBuffer, mimeType) {
        const startTime = Date.now();
        try {
            this.validateImage(imageBuffer, mimeType);
            const processedImage = await this.preprocessImage(imageBuffer);
            lambdaLogger_1.default.info('Starting Textract text detection', {
                imageSize: processedImage.length,
                mimeType,
            });
            const command = new client_textract_1.DetectDocumentTextCommand({
                Document: {
                    Bytes: processedImage,
                },
            });
            const response = await textractClient.send(command);
            const processingTime = Date.now() - startTime;
            if (!response.Blocks || response.Blocks.length === 0) {
                throw new Error('No text detected in the image');
            }
            // Convert and process results
            const blocks = response.Blocks.map(block => this.convertBlock(block));
            const textBlocks = blocks.filter(block => block.blockType === 'LINE' && block.text);
            const rawText = textBlocks.map(block => block.text).join('\n');
            const confidenceScores = textBlocks
                .map(block => block.confidence)
                .filter((confidence) => confidence !== undefined);
            const averageConfidence = confidenceScores.length > 0
                ? confidenceScores.reduce((sum, conf) => sum + conf, 0) / confidenceScores.length
                : 0;
            const imageMetadata = await (0, sharp_1.default)(processedImage).metadata();
            const result = {
                blocks,
                rawText,
                confidence: averageConfidence,
                metadata: {
                    processingTime,
                    imageSize: {
                        width: imageMetadata.width || 0,
                        height: imageMetadata.height || 0,
                    },
                    totalBlocks: blocks.length,
                },
            };
            lambdaLogger_1.default.info('Textract text detection completed', {
                processingTime,
                totalBlocks: blocks.length,
                textBlocks: textBlocks.length,
                averageConfidence: averageConfidence.toFixed(1),
            });
            return result;
        }
        catch (error) {
            const processingTime = Date.now() - startTime;
            lambdaLogger_1.default.error('Textract text detection failed', {
                error: error.message,
                processingTime,
            });
            throw error;
        }
    }
    /**
     * Parse business card data from OCR results
     */
    parseBusinessCard(ocrResult) {
        const { rawText, confidence } = ocrResult;
        const lines = rawText
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
        lambdaLogger_1.default.info('Parsing business card data', {
            totalLines: lines.length,
            confidence: confidence.toFixed(1),
        });
        const result = {
            rawText,
            confidence,
        };
        // Email detection (highest confidence)
        const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
        const emails = rawText.match(emailRegex);
        if (emails && emails.length > 0) {
            result.email = {
                text: emails[0],
                confidence: 95, // High confidence for regex matches
            };
        }
        // Phone number detection
        const phoneRegex = /(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;
        const phones = rawText.match(phoneRegex);
        if (phones && phones.length > 0) {
            result.phone = {
                text: phones[0].replace(/[^\d+]/g, '').replace(/^1/, '+1'),
                confidence: 90,
            };
        }
        // Website detection
        const websiteRegex = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}/g;
        const websites = rawText.match(websiteRegex);
        if (websites && websites.length > 0) {
            const website = websites[0];
            if (!website.includes('@')) {
                // Exclude emails
                result.website = {
                    text: website.startsWith('http') ? website : `https://${website}`,
                    confidence: 85,
                };
            }
        }
        // Company name detection (look for lines with keywords or all caps)
        const companyKeywords = [
            'inc',
            'llc',
            'corp',
            'ltd',
            'company',
            'group',
            'solutions',
            'technologies',
            'consulting',
        ];
        for (const line of lines) {
            const lowerLine = line.toLowerCase();
            if (companyKeywords.some(keyword => lowerLine.includes(keyword)) ||
                (line.length > 3 && line === line.toUpperCase() && !/\d/.test(line))) {
                result.company = {
                    text: line,
                    confidence: 75,
                };
                break;
            }
        }
        // Job title detection (common patterns)
        const titleKeywords = [
            'ceo',
            'cto',
            'cfo',
            'director',
            'manager',
            'senior',
            'junior',
            'lead',
            'head',
            'chief',
            'president',
            'vice',
            'engineer',
            'developer',
            'analyst',
            'consultant',
            'specialist',
        ];
        for (const line of lines) {
            const lowerLine = line.toLowerCase();
            if (titleKeywords.some(keyword => lowerLine.includes(keyword))) {
                result.jobTitle = {
                    text: line,
                    confidence: 70,
                };
                break;
            }
        }
        // Name detection (usually first line that's not company/title and contains spaces)
        for (const line of lines) {
            if (line.includes(' ') &&
                line.length > 3 &&
                line.length < 50 &&
                !line.includes('@') &&
                !/\d/.test(line) &&
                line !== result.company?.text &&
                line !== result.jobTitle?.text) {
                result.name = {
                    text: line,
                    confidence: 60,
                };
                break;
            }
        }
        lambdaLogger_1.default.info('Business card parsing completed', {
            extractedFields: Object.keys(result).filter(key => key !== 'rawText' && key !== 'confidence')
                .length,
            name: result.name?.text || 'not found',
            email: result.email?.text || 'not found',
            company: result.company?.text || 'not found',
        });
        return result;
    }
    /**
     * Health check for Textract service
     */
    async healthCheck() {
        try {
            // Create a simple test image with text
            const testImage = await (0, sharp_1.default)({
                create: {
                    width: 100,
                    height: 50,
                    channels: 3,
                    background: { r: 255, g: 255, b: 255 },
                },
            })
                .png()
                .composite([
                {
                    input: Buffer.from(`<svg><text x="10" y="30" font-family="Arial" font-size="20">TEST</text></svg>`),
                    top: 0,
                    left: 0,
                },
            ])
                .toBuffer();
            const startTime = Date.now();
            await this.detectText(testImage, 'image/png');
            const responseTime = Date.now() - startTime;
            return {
                status: 'healthy',
                details: {
                    responseTime,
                    region: env_1.env.aws?.region || 'local',
                    timestamp: new Date().toISOString(),
                },
            };
        }
        catch (error) {
            return {
                status: 'unhealthy',
                details: {
                    error: error.message,
                    region: env_1.env.aws?.region || 'local',
                    timestamp: new Date().toISOString(),
                },
            };
        }
    }
}
// Export singleton instance
exports.textractService = new TextractService();
exports.default = exports.textractService;
