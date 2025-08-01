import { Router, Request, Response } from 'express';
import multer from 'multer';
import 'express-async-errors';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { textractService } from '../services/textract.service.js';
import logger from '../utils/logger.js';
import type { 
  OCRScanResponse, 
  OCRProcessingOptions,
  BusinessCardData,
  OCRResult 
} from '@namecard/shared';

const router = Router();

// Configure multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB default
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/heic,image/webp').split(',');
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed types: ${allowedTypes.join(', ')}`));
    }
  },
});

// Custom Request interface for authenticated requests with file upload
interface AuthenticatedScanRequest extends Request {
  user?: {
    id: string;
    email: string;
    cognitoId: string;
  };
  file?: Express.Multer.File;
}

/**
 * @route POST /api/v1/scan/text
 * @desc Extract text from image using basic OCR (faster)
 * @access Private
 */
router.post('/text', 
  authenticateToken,
  upload.single('image'),
  async (req: AuthenticatedScanRequest, res: Response) => {
    const startTime = Date.now();
    
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No image file provided',
          timestamp: new Date().toISOString(),
        });
      }

      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'User authentication required',
          timestamp: new Date().toISOString(),
        });
      }

      logger.info('Starting basic OCR text extraction', {
        userId: req.user.id,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      });

      // Extract text using basic OCR
      const ocrResult = await textractService.detectText(req.file.buffer, req.file.mimetype);
      const processingTime = Date.now() - startTime;

      logger.info('OCR text extraction completed', {
        userId: req.user.id,
        processingTime,
        confidence: ocrResult.confidence.toFixed(1),
        textLength: ocrResult.rawText.length,
      });

      const response = {
        success: true,
        data: {
          ocrResult,
          processingTime,
        },
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      
      logger.error('OCR text extraction failed', {
        userId: req.user?.id,
        error: error.message,
        processingTime,
      });

      res.status(500).json({
        success: false,
        error: error.message || 'OCR processing failed',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * @route POST /api/v1/scan/analyze
 * @desc Analyze document structure and extract text (more detailed)
 * @access Private
 */
router.post('/analyze',
  authenticateToken,
  upload.single('image'),
  async (req: AuthenticatedScanRequest, res: Response) => {
    const startTime = Date.now();
    
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No image file provided',
          timestamp: new Date().toISOString(),
        });
      }

      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'User authentication required',
          timestamp: new Date().toISOString(),
        });
      }

      logger.info('Starting document analysis OCR', {
        userId: req.user.id,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      });

      // Extract text using document analysis (more detailed)
      const ocrResult = await textractService.extractText(req.file.buffer, req.file.mimetype);
      const processingTime = Date.now() - startTime;

      logger.info('Document analysis OCR completed', {
        userId: req.user.id,
        processingTime,
        confidence: ocrResult.confidence.toFixed(1),
        totalBlocks: ocrResult.blocks.length,
        textLength: ocrResult.rawText.length,
      });

      const response = {
        success: true,
        data: {
          ocrResult,
          processingTime,
        },
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Document analysis OCR failed', {
        userId: req.user?.id,
        error: error.message,
        processingTime,
      });

      res.status(500).json({
        success: false,
        error: error.message || 'Document analysis failed',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * @route POST /api/v1/scan/business-card
 * @desc Scan and parse business card data
 * @access Private
 */
router.post('/business-card',
  authenticateToken,
  upload.single('image'),
  async (req: AuthenticatedScanRequest, res: Response) => {
    const startTime = Date.now();
    
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No image file provided',
          timestamp: new Date().toISOString(),
        });
      }

      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'User authentication required',
          timestamp: new Date().toISOString(),
        });
      }

      // Parse processing options from request body
      const options: OCRProcessingOptions = {
        useAnalyzeDocument: req.body.useAnalyzeDocument !== 'false', // Default to true
        enhanceImage: req.body.enhanceImage !== 'false', // Default to true
        minConfidence: parseInt(req.body.minConfidence) || 50,
        extractStructuredData: req.body.extractStructuredData !== 'false', // Default to true
      };

      logger.info('Starting business card scanning', {
        userId: req.user.id,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        options,
      });

      // Extract text using the appropriate method
      const ocrResult = options.useAnalyzeDocument 
        ? await textractService.extractText(req.file.buffer, req.file.mimetype)
        : await textractService.detectText(req.file.buffer, req.file.mimetype);

      // Parse business card data
      const businessCardData = textractService.parseBusinessCard(ocrResult);
      const processingTime = Date.now() - startTime;

      logger.info('Business card scanning completed', {
        userId: req.user.id,
        processingTime,
        confidence: ocrResult.confidence.toFixed(1),
        extractedFields: Object.keys(businessCardData).filter(key => key !== 'rawText' && key !== 'confidence').length,
        hasName: !!businessCardData.name,
        hasEmail: !!businessCardData.email,
        hasCompany: !!businessCardData.company,
      });

      const response: OCRScanResponse = {
        success: true,
        data: {
          cardId: `temp_${Date.now()}`, // Temporary ID until saved to database
          extractedData: businessCardData,
          ocrResult,
          processingTime,
        },
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Business card scanning failed', {
        userId: req.user?.id,
        error: error.message,
        processingTime,
      });

      res.status(500).json({
        success: false,
        error: error.message || 'Business card scanning failed',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * @route GET /api/v1/scan/health
 * @desc Check OCR service health
 * @access Private
 */
router.get('/health',
  authenticateToken,
  async (req: AuthenticatedScanRequest, res: Response) => {
    try {
      logger.info('Checking OCR service health', {
        userId: req.user?.id,
      });

      const healthCheck = await textractService.healthCheck();

      res.status(healthCheck.status === 'healthy' ? 200 : 503).json({
        success: healthCheck.status === 'healthy',
        data: healthCheck,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('OCR health check failed', {
        userId: req.user?.id,
        error: error.message,
      });

      res.status(503).json({
        success: false,
        error: 'OCR service health check failed',
        details: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * @route GET /api/v1/scan/info
 * @desc Get OCR service information and capabilities
 * @access Private
 */
router.get('/info',
  authenticateToken,
  async (req: Request, res: Response) => {
    const allowedTypes = (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/heic,image/webp').split(',');
    const maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '10485760');

    res.status(200).json({
      success: true,
      data: {
        service: 'AWS Textract OCR',
        version: '1.0.0',
        capabilities: {
          textDetection: true,
          documentAnalysis: true,
          businessCardParsing: true,
          imagePreprocessing: true,
        },
        limits: {
          maxFileSize,
          allowedTypes,
          maxImageDimension: 3000,
        },
        endpoints: {
          textExtraction: '/api/v1/scan/text',
          documentAnalysis: '/api/v1/scan/analyze', 
          businessCardScanning: '/api/v1/scan/business-card',
          healthCheck: '/api/v1/scan/health',
        },
      },
      timestamp: new Date().toISOString(),
    });
  }
);

export default router;