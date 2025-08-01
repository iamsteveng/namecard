// OCR and Textract related types

export interface TextractBlock {
  id: string;
  blockType: string;
  text?: string;
  confidence?: number;
  geometry?: {
    boundingBox?: {
      width: number;
      height: number;
      left: number;
      top: number;
    };
    polygon?: Array<{ x: number; y: number }>;
  };
  relationships?: Array<{
    type: string;
    ids: string[];
  }>;
}

export interface OCRResult {
  blocks: TextractBlock[];
  rawText: string;
  confidence: number;
  metadata: {
    processingTime: number;
    imageSize: {
      width: number;
      height: number;
    };
    totalBlocks: number;
  };
}

export interface BusinessCardData {
  name?: { text: string; confidence: number };
  jobTitle?: { text: string; confidence: number };
  company?: { text: string; confidence: number };
  email?: { text: string; confidence: number };
  phone?: { text: string; confidence: number };
  website?: { text: string; confidence: number };
  address?: { text: string; confidence: number };
  rawText: string;
  confidence: number;
}

export interface OCRProcessingOptions {
  useAnalyzeDocument?: boolean; // Use AnalyzeDocument vs DetectText
  enhanceImage?: boolean; // Apply image preprocessing
  minConfidence?: number; // Minimum confidence threshold
  extractStructuredData?: boolean; // Parse business card fields
}

export interface OCRProcessingResult {
  success: boolean;
  data?: {
    ocrResult: OCRResult;
    businessCardData?: BusinessCardData;
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  processingTime: number;
  timestamp: string;
}

// API Request/Response types for OCR scanning
export interface OCRScanRequest {
  image: Buffer;
  mimeType: string;
  options?: OCRProcessingOptions;
}

export interface OCRScanResponse {
  success: boolean;
  data?: {
    cardId: string;
    extractedData: BusinessCardData;
    ocrResult: OCRResult;
    processingTime: number;
  };
  error?: string;
  timestamp: string;
}

export interface OCRHealthCheck {
  status: 'healthy' | 'unhealthy';
  details: {
    responseTime?: number;
    error?: string;
    region: string;
    timestamp: string;
  };
}