import { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, X, RotateCcw } from 'lucide-react';
import { clsx } from 'clsx';

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onClose: () => void;
  className?: string;
}

export default function CameraCapture({ onCapture, onClose, className }: CameraCaptureProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Initialize camera
  const initializeCamera = useCallback(async () => {
    try {
      setError(null);
      
      // Stop existing stream if any
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error('Camera initialization error:', err);
      
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError('Camera access denied. Please allow camera permissions and try again.');
        } else if (err.name === 'NotFoundError') {
          setError('No camera found. Please ensure your device has a camera.');
        } else if (err.name === 'NotSupportedError') {
          setError('Camera not supported on this device.');
        } else {
          setError(`Camera error: ${err.message}`);
        }
      } else {
        setError('Failed to access camera. Please check your permissions.');
      }
    }
  }, [facingMode, stream]);

  // Initialize camera on mount
  useEffect(() => {
    initializeCamera();
    
    // Cleanup on unmount
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [initializeCamera]);

  // Flip camera between front and back
  const flipCamera = useCallback(() => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  }, []);

  // Capture photo
  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || isCapturing) {
      return;
    }

    setIsCapturing(true);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Canvas context not available');
      }

      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw current video frame to canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to capture image'));
          }
        }, 'image/jpeg', 0.9);
      });

      // Create file from blob
      const file = new File([blob], `business-card-${Date.now()}.jpg`, {
        type: 'image/jpeg',
      });

      onCapture(file);
    } catch (err) {
      console.error('Capture error:', err);
      setError('Failed to capture photo. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, onCapture]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault();
        capturePhoto();
      } else if (event.code === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [capturePhoto, onClose]);

  return (
    <div className={clsx('fixed inset-0 z-50 bg-black', className)}>
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 md:p-6 bg-gradient-to-b from-black/50 to-transparent pt-safe-top">
        <button
          onClick={onClose}
          className="p-2 text-white hover:bg-white/20 rounded-full transition-colors"
          aria-label="Close camera"
        >
          <X className="h-6 w-6" />
        </button>
        
        <h2 className="text-lg font-medium text-white">Scan Business Card</h2>
        
        <button
          onClick={flipCamera}
          className="p-2 text-white hover:bg-white/20 rounded-full transition-colors"
          aria-label="Flip camera"
        >
          <RotateCcw className="h-6 w-6" />
        </button>
      </div>

      {/* Video Preview */}
      <div className="relative w-full h-full flex items-center justify-center">
        {error ? (
          <div className="text-center text-white p-6">
            <div className="text-red-400 mb-4">
              <Camera className="h-16 w-16 mx-auto mb-4" />
              <p className="text-lg font-medium mb-2">Camera Error</p>
              <p className="text-sm opacity-90">{error}</p>
            </div>
            <button
              onClick={initializeCamera}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            
            {/* Overlay guide for business card positioning */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-4">
              <div className="relative">
                <div className="w-64 h-40 sm:w-80 sm:h-50 md:w-96 md:h-60 border-2 border-white/50 rounded-lg shadow-lg">
                  {/* Corner markers */}
                  <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-white"></div>
                  <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-white"></div>
                  <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-white"></div>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-white"></div>
                </div>
                <p className="text-white text-sm text-center mt-4 opacity-90">
                  Position business card within the frame
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Capture Controls */}
      {!error && (
        <div className="absolute bottom-0 left-0 right-0 z-10 p-4 md:p-6 bg-gradient-to-t from-black/50 to-transparent pb-safe-bottom">
          <div className="flex items-center justify-center">
            <button
              onClick={capturePhoto}
              disabled={isCapturing || !stream}
              className={clsx(
                'relative p-4 rounded-full transition-all duration-200',
                isCapturing || !stream
                  ? 'bg-gray-600 cursor-not-allowed'
                  : 'bg-white hover:bg-gray-100 active:scale-95 shadow-lg'
              )}
              aria-label="Capture photo"
            >
              {isCapturing ? (
                <div className="animate-spin">
                  <Camera className="h-8 w-8 text-gray-400" />
                </div>
              ) : (
                <Camera className="h-8 w-8 text-gray-900" />
              )}
            </button>
          </div>
          
          <p className="text-white text-sm text-center mt-4 opacity-90">
            Tap the camera button or press Space to capture
          </p>
        </div>
      )}

      {/* Hidden canvas for capturing */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}