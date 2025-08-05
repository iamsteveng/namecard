import { useState } from 'react';
import { Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import type { BusinessCardData } from '@namecard/shared/types/textract.types';
import type { Card, CreateCardData } from '@namecard/shared/types/card.types';
import Button from '../Button';
import OCRValidation from '../ocr/OCRValidation';
import cardService from '../../services/card.service';
import { useAuthStore } from '../../store/auth.store';

type ScanStep = 'upload' | 'processing' | 'validation' | 'complete' | 'error';

interface ScanWorkflowProps {
  onComplete?: (card: Card) => void;
  onCancel?: () => void;
}

interface ProcessingState {
  step: ScanStep;
  file?: File;
  imageUrl?: string;
  ocrData?: BusinessCardData;
  savedCard?: Card;
  error?: string;
  progress: number;
}

export default function ScanWorkflow({ onComplete, onCancel }: ScanWorkflowProps) {
  const { session } = useAuthStore();
  const [state, setState] = useState<ProcessingState>({
    step: 'upload',
    progress: 0,
  });

  const handleFileSelect = async (file: File) => {
    if (!session?.accessToken) {
      setState(prev => ({ ...prev, step: 'error', error: 'Authentication required' }));
      return;
    }

    setState(prev => ({ 
      ...prev, 
      step: 'processing', 
      file, 
      imageUrl: URL.createObjectURL(file),
      progress: 10
    }));

    try {
      // Simulate progress updates
      setState(prev => ({ ...prev, progress: 30 }));
      
      // Upload and process the image
      const { imageData, ocrData } = await cardService.uploadAndProcessCard(file, session.accessToken);
      
      setState(prev => ({ ...prev, progress: 80 }));
      
      // Move to validation step
      setState(prev => ({ 
        ...prev, 
        step: 'validation', 
        ocrData,
        imageUrl: imageData.files[0]?.variants.web || imageData.files[0]?.url || '', // Use web-optimized version for display
        progress: 100 
      }));
      
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        step: 'error', 
        error: error instanceof Error ? error.message : 'Processing failed',
        progress: 0
      }));
    }
  };

  const handleValidationSave = async (validatedData: Omit<CreateCardData, 'userId'>) => {
    if (!session?.accessToken || !state.file) {
      setState(prev => ({ ...prev, step: 'error', error: 'Missing required data' }));
      return;
    }

    setState(prev => ({ ...prev, step: 'processing', progress: 20 }));

    try {
      // Extract the fields we need to pass separately
      const { originalImageUrl, extractedText, confidence, scanDate, ...restData } = validatedData;
      
      // Save the card
      const savedCard = await cardService.scanAndSaveCard(
        state.file,
        restData,
        session.accessToken
      );

      setState(prev => ({ 
        ...prev, 
        step: 'complete', 
        savedCard,
        progress: 100 
      }));

      if (onComplete) {
        onComplete(savedCard);
      }
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        step: 'error', 
        error: error instanceof Error ? error.message : 'Failed to save card',
        progress: 0
      }));
    }
  };

  const handleValidationCancel = () => {
    setState({ step: 'upload', progress: 0 });
  };

  const handleRetry = () => {
    setState({ step: 'upload', progress: 0 });
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      setState({ step: 'upload', progress: 0 });
    }
  };

  const renderContent = () => {
    switch (state.step) {
      case 'upload':
        return (
          <FileUpload 
            onFileSelect={handleFileSelect}
            onCancel={handleCancel}
          />
        );

      case 'processing':
        return (
          <ProcessingStep 
            progress={state.progress}
            imageUrl={state.imageUrl || ''}
          />
        );

      case 'validation':
        return state.ocrData && state.imageUrl ? (
          <OCRValidation
            extractedData={state.ocrData}
            originalImageUrl={state.imageUrl}
            onSave={handleValidationSave}
            onCancel={handleValidationCancel}
          />
        ) : (
          <ErrorStep 
            error="Missing OCR data" 
            onRetry={handleRetry}
            onCancel={handleCancel}
          />
        );

      case 'complete':
        return (
          <CompleteStep 
            card={state.savedCard!}
            onDone={() => onComplete?.(state.savedCard!)}
            onScanAnother={handleRetry}
          />
        );

      case 'error':
        return (
          <ErrorStep 
            error={state.error!} 
            onRetry={handleRetry}
            onCancel={handleCancel}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Progress Bar */}
        {state.step !== 'upload' && state.step !== 'error' && (
          <div className="mb-8">
            <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
              <span>Scanning Progress</span>
              <span>{state.progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${state.progress}%` }}
              />
            </div>
          </div>
        )}
        
        {renderContent()}
      </div>
    </div>
  );
}

// File Upload Component
interface FileUploadProps {
  onFileSelect: (file: File) => void;
  onCancel: () => void;
}

function FileUpload({ onFileSelect, onCancel }: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (files && files[0]) {
      const file = files[0];
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }
      
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB');
        return;
      }
      
      onFileSelect(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Scan Business Card</h1>
        <p className="text-gray-600">
          Upload an image of a business card to extract contact information
        </p>
      </div>

      <div
        className={`relative border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
          dragActive 
            ? 'border-blue-400 bg-blue-50' 
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragEnter={() => setDragActive(true)}
        onDragLeave={() => setDragActive(false)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Drop your business card image here
        </h3>
        <p className="text-gray-600 mb-6">
          or click to browse files
        </p>
        
        <input
          type="file"
          accept="image/*"
          onChange={handleChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        
        <Button variant="primary">
          Choose File
        </Button>
        
        <p className="text-sm text-gray-500 mt-4">
          Supports: JPG, PNG, GIF (max 10MB)
        </p>
      </div>

      <div className="flex justify-center mt-8">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// Processing Step Component
interface ProcessingStepProps {
  progress: number;
  imageUrl: string;
}

function ProcessingStep({ progress, imageUrl }: ProcessingStepProps) {
  const getStepMessage = (progress: number) => {
    if (progress < 30) return 'Uploading image...';
    if (progress < 60) return 'Processing with OCR...';
    if (progress < 90) return 'Extracting business card data...';
    return 'Preparing validation...';
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-8 text-center">
      <div className="flex justify-center mb-6">
        <div className="relative">
          {imageUrl && (
            <img 
              src={imageUrl} 
              alt="Business card" 
              className="w-64 h-40 object-contain rounded-lg border"
            />
          )}
          <div className="absolute inset-0 bg-blue-600 bg-opacity-10 rounded-lg flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        </div>
      </div>
      
      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        Processing Business Card
      </h2>
      <p className="text-gray-600 mb-6">
        {getStepMessage(progress)}
      </p>
      
      <div className="w-full bg-gray-200 rounded-full h-3">
        <div 
          className="bg-blue-600 h-3 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// Complete Step Component
interface CompleteStepProps {
  card: Card;
  onDone: () => void;
  onScanAnother: () => void;
}

function CompleteStep({ card, onDone, onScanAnother }: CompleteStepProps) {
  return (
    <div className="bg-white rounded-lg shadow-lg p-8 text-center">
      <CheckCircle className="mx-auto h-16 w-16 text-green-500 mb-6" />
      
      <h2 className="text-2xl font-bold text-gray-900 mb-2">
        Business Card Saved!
      </h2>
      <p className="text-gray-600 mb-8">
        {card.name ? `${card.name}'s` : 'The'} business card has been successfully processed and saved.
      </p>
      
      <div className="bg-gray-50 rounded-lg p-6 mb-8 text-left">
        <h3 className="font-semibold text-gray-900 mb-4">Extracted Information:</h3>
        <div className="space-y-2 text-sm">
          {card.name && <div><strong>Name:</strong> {card.name}</div>}
          {card.title && <div><strong>Title:</strong> {card.title}</div>}
          {card.company && <div><strong>Company:</strong> {card.company}</div>}
          {card.email && <div><strong>Email:</strong> {card.email}</div>}
          {card.phone && <div><strong>Phone:</strong> {card.phone}</div>}
          {card.website && <div><strong>Website:</strong> {card.website}</div>}
        </div>
      </div>
      
      <div className="flex gap-4 justify-center">
        <Button variant="secondary" onClick={onScanAnother}>
          Scan Another Card
        </Button>
        <Button variant="primary" onClick={onDone}>
          View All Cards
        </Button>
      </div>
    </div>
  );
}

// Error Step Component
interface ErrorStepProps {
  error: string;
  onRetry: () => void;
  onCancel: () => void;
}

function ErrorStep({ error, onRetry, onCancel }: ErrorStepProps) {
  return (
    <div className="bg-white rounded-lg shadow-lg p-8 text-center">
      <AlertCircle className="mx-auto h-16 w-16 text-red-500 mb-6" />
      
      <h2 className="text-2xl font-bold text-gray-900 mb-2">
        Processing Failed
      </h2>
      <p className="text-gray-600 mb-2">
        We encountered an error while processing your business card.
      </p>
      <p className="text-red-600 text-sm mb-8 bg-red-50 p-3 rounded border">
        {error}
      </p>
      
      <div className="flex gap-4 justify-center">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onRetry}>
          Try Again
        </Button>
      </div>
    </div>
  );
}