import { clsx } from 'clsx';
import { Upload, Camera, File, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useState, useCallback, DragEvent, ChangeEvent } from 'react';

type ScanStatus = 'idle' | 'uploading' | 'processing' | 'success' | 'error';

export default function Scan() {
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);

  const handleDrag = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      setSelectedFile(files[0]);
    }
  }, []);

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      setSelectedFile(files[0]);
    }
  };

  const handleScan = async () => {
    if (!selectedFile) {
      return;
    }

    setStatus('uploading');
    setProgress(0);

    // Simulate upload progress
    const uploadInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(uploadInterval);
          setStatus('processing');

          // Simulate processing
          setTimeout(() => {
            setStatus('success');
            setProgress(100);
          }, 2000);

          return 100;
        }
        return prev + 10;
      });
    }, 200);
  };

  const resetScan = () => {
    setStatus('idle');
    setSelectedFile(null);
    setProgress(0);
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'uploading':
      case 'processing':
        return <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />;
      case 'success':
        return <CheckCircle className="h-8 w-8 text-green-600" />;
      case 'error':
        return <AlertCircle className="h-8 w-8 text-red-600" />;
      default:
        return <Upload className="h-8 w-8 text-gray-400" />;
    }
  };

  const getStatusMessage = () => {
    switch (status) {
      case 'uploading':
        return `Uploading... ${progress}%`;
      case 'processing':
        return 'Processing business card...';
      case 'success':
        return 'Business card scanned successfully!';
      case 'error':
        return 'Failed to process business card';
      default:
        return 'Upload a business card to get started';
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Scan Business Card</h1>
        <p className="mt-2 text-gray-600">
          Upload a photo of a business card to extract contact information automatically.
        </p>
      </div>

      {/* Upload Area */}
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div
          className={clsx(
            'relative border-2 border-dashed rounded-lg p-12 text-center transition-colors',
            dragActive
              ? 'border-blue-400 bg-blue-50'
              : status === 'success'
                ? 'border-green-300 bg-green-50'
                : status === 'error'
                  ? 'border-red-300 bg-red-50'
                  : 'border-gray-300 hover:border-gray-400'
          )}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={status === 'uploading' || status === 'processing'}
          />

          <div className="space-y-4">
            {getStatusIcon()}

            <div>
              <h3 className="text-lg font-medium text-gray-900">
                {selectedFile ? selectedFile.name : 'Choose a file or drag and drop'}
              </h3>
              <p className="text-gray-500">{getStatusMessage()}</p>
            </div>

            {selectedFile && status === 'idle' && (
              <div className="flex gap-3 justify-center">
                <button
                  onClick={handleScan}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Camera className="h-4 w-4" />
                  Scan Card
                </button>
                <button
                  onClick={resetScan}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Reset
                </button>
              </div>
            )}

            {status === 'success' && (
              <button
                onClick={resetScan}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Upload className="h-4 w-4" />
                Scan Another Card
              </button>
            )}

            {(status === 'uploading' || status === 'processing') && (
              <div className="w-full max-w-xs mx-auto">
                <div className="bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* File Format Info */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            Supported formats: JPG, PNG, HEIC, WebP (max 10MB)
          </p>
        </div>
      </div>

      {/* Tips */}
      <div className="bg-blue-50 rounded-lg p-6">
        <h3 className="text-lg font-medium text-blue-900 mb-3">
          <File className="inline h-5 w-5 mr-2" />
          Tips for best results
        </h3>
        <ul className="space-y-2 text-sm text-blue-800">
          <li>• Ensure the business card is well-lit and in focus</li>
          <li>• Place the card on a flat, contrasting surface</li>
          <li>• Avoid shadows and reflections on the card</li>
          <li>• Make sure all text is clearly visible and not cut off</li>
        </ul>
      </div>

      {/* Recent Scans - Placeholder */}
      {status === 'success' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Extracted Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value="John Smith"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                readOnly
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                value="Senior Developer"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                readOnly
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
              <input
                type="text"
                value="Tech Corp"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                readOnly
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value="john.smith@techcorp.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                readOnly
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="tel"
                value="+1 (555) 123-4567"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                readOnly
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
              <input
                type="url"
                value="https://techcorp.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                readOnly
              />
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              Save Contact
            </button>
            <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
              Edit Information
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
