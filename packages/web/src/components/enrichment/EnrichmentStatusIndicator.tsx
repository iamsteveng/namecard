import { CheckCircle, AlertTriangle, Clock, XCircle, Minus, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import type { EnrichmentStatusIndicatorProps } from '../../types/enrichment.types';
import { getEnrichmentStatusColor, getEnrichmentStatusText, formatEnrichmentSources } from '../../types/enrichment.types';

function getStatusIcon(status: string, size: string) {
  const iconClass = size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';
  
  switch (status) {
    case 'enriched':
      return <CheckCircle className={iconClass} />;
    case 'partial':
      return <AlertTriangle className={iconClass} />;
    case 'failed':
      return <XCircle className={iconClass} />;
    case 'pending':
      return <Clock className={clsx(iconClass, 'animate-pulse')} />;
    case 'skipped':
      return <Minus className={iconClass} />;
    default:
      return <Sparkles className={iconClass} />;
  }
}

export default function EnrichmentStatusIndicator({
  status,
  lastEnrichmentDate,
  confidence,
  sources = [],
  size = 'md',
  showTooltip = true
}: EnrichmentStatusIndicatorProps) {
  const statusText = getEnrichmentStatusText(status);
  const statusColor = getEnrichmentStatusColor(status);
  const statusIcon = getStatusIcon(status, size);
  
  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'px-2 py-1 text-xs';
      case 'lg':
        return 'px-4 py-2 text-base';
      default:
        return 'px-3 py-1.5 text-sm';
    }
  };

  const formatLastEnrichment = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  };

  const tooltipContent = showTooltip ? {
    'data-tooltip': `
      Status: ${statusText}
      ${confidence ? `Confidence: ${Math.round(confidence * 100)}%` : ''}
      ${sources.length > 0 ? `Sources: ${formatEnrichmentSources(sources)}` : ''}
      ${lastEnrichmentDate ? `Last enriched: ${formatLastEnrichment(lastEnrichmentDate)}` : ''}
    `.trim()
  } : {};

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        getSizeClasses(),
        statusColor,
        showTooltip && 'cursor-help'
      )}
      title={showTooltip ? `${statusText}${confidence ? ` (${Math.round(confidence * 100)}%)` : ''}` : undefined}
      {...tooltipContent}
    >
      {statusIcon}
      <span>{statusText}</span>
      {confidence && confidence > 0 && (
        <span className="text-xs opacity-75">
          {Math.round(confidence * 100)}%
        </span>
      )}
    </span>
  );
}

// Simplified version for compact display
export function EnrichmentStatusBadge({
  status,
  confidence,
  size = 'sm'
}: {
  status: string;
  confidence?: number;
  size?: 'sm' | 'md' | 'lg';
}) {
  const statusColor = getEnrichmentStatusColor(status as any);
  const statusIcon = getStatusIcon(status, size);
  
  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'h-6 w-6';
      case 'lg':
        return 'h-10 w-10';
      default:
        return 'h-8 w-8';
    }
  };

  return (
    <div
      className={clsx(
        'inline-flex items-center justify-center rounded-full',
        getSizeClasses(),
        statusColor
      )}
      title={`${getEnrichmentStatusText(status as any)}${confidence ? ` (${Math.round(confidence * 100)}%)` : ''}`}
    >
      {statusIcon}
    </div>
  );
}