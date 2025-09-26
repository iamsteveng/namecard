import { clsx } from 'clsx';
import { Upload, Camera, X, FileImage, AlertCircle } from 'lucide-react';
import { useState, useCallback, DragEvent, ChangeEvent, useRef } from 'react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  onCameraClick?: () => void;
  selectedFile?: File | null;
  onClearFile?: () => void;
  disabled?: boolean;
  maxSizeBytes?: number;
  acceptedFormats?: string[];
  className?: string;
}

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_FORMATS = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic'];

export default function FileUpload({
  onFileSelect,
  onCameraClick,
  selectedFile,
  onClearFile,
  disabled = false,
  maxSizeBytes = DEFAULT_MAX_SIZE,
  acceptedFormats = DEFAULT_FORMATS,
  className,
}: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) {
      return '0 Bytes';
    }
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Validate file
  const validateFile = (file: File): string | null => {
    // Check file type
    if (!acceptedFormats.includes(file.type.toLowerCase())) {
      const formats = acceptedFormats
        .map(f => f.split('/')[1]?.toUpperCase() || f.toUpperCase())
        .join(', ');
      return `Invalid file type. Supported formats: ${formats}`;
    }

    // Check file size
    if (file.size > maxSizeBytes) {
      return `File too large. Maximum size: ${formatFileSize(maxSizeBytes)}`;
    }

    return null;
  };

  // Create preview for image
  const createPreview = useCallback((file: File) => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => {
        setPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setPreview(null);
    }
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback(
    (file: File) => {
      setError(null);

      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      createPreview(file);
      onFileSelect(file);
    },
    [onFileSelect, maxSizeBytes, acceptedFormats, createPreview]
  );

  // Handle drag events
  const handleDrag = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      if (disabled) {
        return;
      }

      if (e.type === 'dragenter' || e.type === 'dragover') {
        setDragActive(true);
      } else if (e.type === 'dragleave') {
        setDragActive(false);
      }
    },
    [disabled]
  );

  // Handle drop
  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (disabled) {
        return;
      }

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0 && files[0]) {
        handleFileSelect(files[0]);
      }
    },
    [disabled, handleFileSelect]
  );

  // Handle file input change
  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      handleFileSelect(files[0]);
    }
  };

  // Clear file
  const handleClearFile = () => {
    setError(null);
    setPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClearFile?.();
  };

  // Click to select file
  const handleClick = () => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className={clsx('space-y-4', className)}>
      {/* Upload Area */}
      <div
        className={clsx(
          'relative border-2 border-dashed rounded-lg transition-all duration-200',
          dragActive
            ? 'border-blue-400 bg-blue-50'
            : error
              ? 'border-red-300 bg-red-50'
              : selectedFile
                ? 'border-green-300 bg-green-50'
                : 'border-gray-300 hover:border-gray-400',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedFormats.join(',')}
          onChange={handleInputChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={disabled}
        />

        <div className="p-8 text-center">
          {selectedFile ? (
            // Selected file preview
            <div className="space-y-4">
              {preview ? (
                <div className="relative inline-block">
                  <img
                    src={preview}
                    alt="Preview"
                    className="max-w-48 max-h-32 object-contain rounded-lg border border-gray-200"
                  />
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleClearFile();
                    }}
                    className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                    aria-label="Remove file"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <FileImage className="h-12 w-12 text-green-600 mx-auto" />
              )}

              <div>
                <h3 className="text-lg font-medium text-gray-900">{selectedFile.name}</h3>
                <p className="text-sm text-gray-500">
                  {formatFileSize(selectedFile.size)} • Ready to scan
                </p>
              </div>
            </div>
          ) : (
            // Upload prompt
            <div className="space-y-4">
              <Upload
                className={clsx(
                  'h-12 w-12 mx-auto',
                  error ? 'text-red-400' : dragActive ? 'text-blue-500' : 'text-gray-400'
                )}
              />

              <div>
                <h3 className="text-lg font-medium text-gray-900">
                  Choose a file or drag and drop
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Upload a business card image to extract contact information
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  type="button"
                  onClick={handleClick}
                  disabled={disabled}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors touch-manipulation"
                >
                  <Upload className="h-4 w-4" />
                  Choose File
                </button>

                {onCameraClick && (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      onCameraClick();
                    }}
                    disabled={disabled}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors touch-manipulation"
                  >
                    <Camera className="h-4 w-4" />
                    Use Camera
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* File format info */}
      <div className="text-center">
        <p className="text-xs text-gray-500">
          Supported formats:{' '}
          {acceptedFormats.map(f => f.split('/')[1]?.toUpperCase() || f.toUpperCase()).join(', ')}
          {' • '}
          Max size: {formatFileSize(maxSizeBytes)}
        </p>
      </div>
    </div>
  );
}
