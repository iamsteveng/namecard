import { CheckCircle2, Loader2, AlertCircle, X } from 'lucide-react';
import { clsx } from 'clsx';

interface EnrichmentStatusToastProps {
  status: 'idle' | 'enriching' | 'success' | 'error';
  onDismiss?: () => void;
  className?: string;
}

export default function EnrichmentStatusToast({ 
  status, 
  onDismiss, 
  className 
}: EnrichmentStatusToastProps) {
  if (status === 'idle') return null;

  const getStatusConfig = () => {
    switch (status) {
      case 'enriching':
        return {
          icon: <Loader2 className="h-5 w-5 animate-spin text-blue-600" />,
          title: 'Enriching Card Data',
          message: 'Gathering company information and insights...',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
          textColor: 'text-blue-900'
        };
      case 'success':
        return {
          icon: <CheckCircle2 className="h-5 w-5 text-green-600" />,
          title: 'Enrichment Complete',
          message: 'Card data has been successfully enriched with additional information.',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          textColor: 'text-green-900'
        };
      case 'error':
        return {
          icon: <AlertCircle className="h-5 w-5 text-red-600" />,
          title: 'Enrichment Failed',
          message: 'Unable to enrich card data. Please try again later.',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          textColor: 'text-red-900'
        };
      default:
        return null;
    }
  };

  const config = getStatusConfig();
  if (!config) return null;

  return (
    <div
      className={clsx(
        'fixed top-4 right-4 max-w-sm w-full rounded-lg border p-4 shadow-lg z-50 transition-all duration-300 ease-in-out',
        config.bgColor,
        config.borderColor,
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          {config.icon}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className={clsx('font-medium text-sm', config.textColor)}>
            {config.title}
          </h4>
          <p className={clsx('text-sm mt-1 opacity-90', config.textColor)}>
            {config.message}
          </p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className={clsx(
              'flex-shrink-0 rounded-md p-1.5 inline-flex focus:outline-none focus:ring-2 focus:ring-offset-2',
              config.textColor,
              'hover:bg-black hover:bg-opacity-10 focus:ring-offset-2'
            )}
          >
            <span className="sr-only">Dismiss</span>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}