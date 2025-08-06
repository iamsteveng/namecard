import { useState, useCallback } from 'react';
import { File, AlertCircle, Loader2, Camera as CameraIcon, Scan as ScanIcon } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import CameraCapture from '../components/CameraCapture';
import FileUpload from '../components/FileUpload';
import CardResults, { type EditedCardData } from '../components/CardResults';
import cardsService, { type ScanCardResponse } from '../services/cards.service';
import { useAuthStore } from '../store/auth.store';

type ScanStatus = 'idle' | 'uploading' | 'processing' | 'success' | 'error';

export default function Scan() {
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [showCamera, setShowCamera] = useState(false);
  const [scanResult, setScanResult] = useState<ScanCardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const { session } = useAuthStore();
  const accessToken = session?.accessToken;

  // Scan mutation
  const scanMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!accessToken) {
        throw new Error('Not authenticated');
      }

      setStatus('uploading');
      setProgress(0);
      setError(null);

      return cardsService.scanCard(
        file,
        accessToken,
        {
          minConfidence: 0.8,
          saveOriginalImage: true,
          saveProcessedImage: false,
          skipDuplicateCheck: false,
          useAnalyzeDocument: true,
          enhanceImage: true,
        },
        (progress) => {
          setProgress(progress);
          if (progress >= 100) {
            setStatus('processing');
          }
        }
      );
    },
    onSuccess: (result) => {
      setScanResult(result);
      setStatus('success');
      setProgress(100);
    },
    onError: (error) => {
      setError(error.message);
      setStatus('error');
      setProgress(0);
    },
  });

  // Save card mutation
  const saveCardMutation = useMutation({
    mutationFn: async (editedData: EditedCardData) => {
      if (!accessToken || !scanResult?.data?.cardId) {
        throw new Error('Missing required data');
      }

      return cardsService.updateCard(
        scanResult.data.cardId,
        editedData,
        accessToken
      );
    },
    onSuccess: () => {
      // Card saved successfully - could show a toast or redirect
      console.log('Card saved successfully');
    },
    onError: (error) => {
      setError(`Failed to save card: ${error.message}`);
    },
  });

  // Handle file selection
  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
    setError(null);
  }, []);

  // Handle camera capture
  const handleCameraCapture = useCallback((file: File) => {
    setShowCamera(false);
    setSelectedFile(file);
    setError(null);
  }, []);

  // Start scanning
  const handleScan = useCallback(() => {
    if (selectedFile) {
      scanMutation.mutate(selectedFile);
    }
  }, [selectedFile, scanMutation]);

  // Reset to start over
  const resetScan = useCallback(() => {
    setStatus('idle');
    setSelectedFile(null);
    setProgress(0);
    setScanResult(null);
    setError(null);
  }, []);

  // Handle save card
  const handleSaveCard = useCallback((editedData: EditedCardData) => {
    saveCardMutation.mutate(editedData);
  }, [saveCardMutation]);

  // Show camera modal
  if (showCamera) {
    return (
      <CameraCapture
        onCapture={handleCameraCapture}
        onClose={() => setShowCamera(false)}
      />
    );
  }

  return (
    <div className="space-y-6 md:space-y-8 px-4 md:px-0">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Scan Business Card</h1>
        <p className="mt-2 text-gray-600">
          Upload a photo or use your camera to extract contact information automatically.
        </p>
      </div>

      {/* Main Content */}
      {status === 'success' && scanResult ? (
        // Show results
        <CardResults
          result={scanResult}
          onSave={handleSaveCard}
          onCancel={resetScan}
          onScanAnother={resetScan}
          isSaving={saveCardMutation.isPending}
        />
      ) : (
        // Show upload/scan interface
        <div className="bg-white rounded-lg border border-gray-200 p-4 md:p-8">
          {/* File Upload Component */}
          <FileUpload
            onFileSelect={handleFileSelect}
            onCameraClick={() => setShowCamera(true)}
            selectedFile={selectedFile}
            onClearFile={() => setSelectedFile(null)}
            disabled={status === 'uploading' || status === 'processing'}
          />

          {/* Error Message */}
          {error && (
            <div className="mt-6 flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-800">Scan Failed</p>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          {/* Progress and Status */}
          {(status === 'uploading' || status === 'processing') && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-center gap-3">
                <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
                <span className="text-lg font-medium text-gray-900">
                  {status === 'uploading' ? `Uploading... ${progress}%` : 'Processing business card...'}
                </span>
              </div>
              
              <div className="w-full max-w-md mx-auto">
                <div className="bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <p className="text-center text-sm text-gray-500">
                {status === 'uploading' 
                  ? 'Uploading your image securely...' 
                  : 'Extracting contact information using AI...'
                }
              </p>
            </div>
          )}

          {/* Scan Button */}
          {selectedFile && status === 'idle' && (
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={handleScan}
                disabled={scanMutation.isPending}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors touch-manipulation"
              >
                <ScanIcon className="h-5 w-5" />
                Scan Business Card
              </button>
              <button
                onClick={resetScan}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors touch-manipulation"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tips Section */}
      <div className="bg-blue-50 rounded-lg p-4 md:p-6">
        <h3 className="text-lg font-medium text-blue-900 mb-3">
          <File className="inline h-5 w-5 mr-2" />
          Tips for best results
        </h3>
        <ul className="space-y-2 text-sm text-blue-800">
          <li>• Ensure the business card is well-lit and in focus</li>
          <li>• Place the card on a flat, contrasting surface</li>
          <li>• Avoid shadows and reflections on the card</li>
          <li>• Make sure all text is clearly visible and not cut off</li>
          <li>• Supported formats: JPG, PNG, WebP, HEIC (max 10MB)</li>
        </ul>
      </div>

      {/* Quick Stats - if user has scanned cards before */}
      {status === 'idle' && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 md:p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => setShowCamera(true)}
              className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors touch-manipulation"
            >
              <CameraIcon className="h-6 w-6 text-blue-600" />
              <div className="text-left">
                <div className="font-medium text-gray-900">Use Camera</div>
                <div className="text-sm text-gray-500">Take a photo directly</div>
              </div>
            </button>
            <a
              href="/cards"
              className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors touch-manipulation"
            >
              <File className="h-6 w-6 text-green-600" />
              <div className="text-left">
                <div className="font-medium text-gray-900">View Cards</div>
                <div className="text-sm text-gray-500">Manage saved contacts</div>
              </div>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}