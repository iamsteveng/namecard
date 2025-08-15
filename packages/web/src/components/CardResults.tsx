import { clsx } from 'clsx';
import {
  Edit,
  Save,
  X,
  User,
  Briefcase,
  Mail,
  Phone,
  Globe,
  MapPin,
  AlertTriangle,
  CheckCircle,
  Copy,
} from 'lucide-react';
import { useState, useEffect } from 'react';

import type { ScanCardResponse } from '../services/cards.service';

import CompanyInfo from './enrichment/CompanyInfo';
import EnrichmentButton, { useEnrichmentStatus } from './enrichment/EnrichmentButton';
// Remove unused import

interface CardResultsProps {
  result: ScanCardResponse;
  onSave: (editedData: EditedCardData) => void;
  onCancel: () => void;
  onScanAnother: () => void;
  isEditing?: boolean;
  isSaving?: boolean;
  className?: string;
}

export interface EditedCardData {
  name?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  notes?: string;
  tags?: string[];
}

interface FieldProps {
  label: string;
  value: string | undefined;
  confidence: number | undefined;
  icon: React.ReactNode;
  type?: 'text' | 'email' | 'tel' | 'url';
  placeholder?: string;
  isEditing: boolean;
  onChange: (value: string) => void;
  onCopy?: () => void;
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const getConfidenceColor = (conf: number) => {
    if (conf >= 0.9) {
      return 'text-green-700 bg-green-100';
    }
    if (conf >= 0.7) {
      return 'text-yellow-700 bg-yellow-100';
    }
    return 'text-red-700 bg-red-100';
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
        getConfidenceColor(confidence)
      )}
    >
      {Math.round(confidence * 100)}%
    </span>
  );
}

function Field({
  label,
  value,
  confidence,
  icon,
  type = 'text',
  placeholder,
  isEditing,
  onChange,
  onCopy,
}: FieldProps) {
  const handleCopy = async () => {
    if (value && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(value);
        onCopy?.();
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          {icon}
          {label}
        </label>
        {confidence !== undefined && <ConfidenceBadge confidence={confidence} />}
      </div>

      <div className="relative">
        {isEditing ? (
          <input
            type={type}
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900">
              {value || <span className="text-gray-400 italic">Not detected</span>}
            </div>
            {value && (
              <button
                onClick={handleCopy}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="Copy to clipboard"
              >
                <Copy className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CardResults({
  result,
  onSave,
  onCancel,
  onScanAnother,
  isEditing = false,
  isSaving = false,
  className,
}: CardResultsProps) {
  const [editing, setEditing] = useState(isEditing);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  // Enrichment functionality
  const {
    isEnriching,
    enrichmentData,
    error: enrichmentError,
    handleEnrichmentStart,
    handleEnrichmentComplete,
    handleEnrichmentError,
    clearError,
  } = useEnrichmentStatus(result.data?.cardId);
  const [editedData, setEditedData] = useState<EditedCardData>({});

  // Initialize edited data from result
  useEffect(() => {
    if (result.data?.extractedData) {
      const data = result.data.extractedData;
      setEditedData({
        name: data.name?.text || '',
        title: data.jobTitle?.text || '',
        company: data.company?.text || '',
        email: data.normalizedEmail || data.email?.text || '',
        phone: data.normalizedPhone || data.phone?.text || '',
        website: data.normalizedWebsite || data.website?.text || '',
        address: data.address?.text || '',
        notes: '',
        tags: [],
      });
    }
  }, [result]);

  const handleCopy = (field: string) => {
    setCopySuccess(field);
    setTimeout(() => setCopySuccess(null), 2000);
  };

  const handleSave = () => {
    onSave(editedData);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditing(false);
    // Reset to original data
    if (result.data?.extractedData) {
      const data = result.data.extractedData;
      setEditedData({
        name: data.name?.text || '',
        title: data.jobTitle?.text || '',
        company: data.company?.text || '',
        email: data.normalizedEmail || data.email?.text || '',
        phone: data.normalizedPhone || data.phone?.text || '',
        website: data.normalizedWebsite || data.website?.text || '',
        address: data.address?.text || '',
        notes: '',
        tags: [],
      });
    }
  };

  if (!result.data) {
    return null;
  }

  const { extractedData, confidence, duplicateCardId, processingTime, imageUrls } = result.data;

  return (
    <div
      className={clsx(
        'bg-white rounded-lg border border-gray-200 p-4 md:p-6 space-y-4 md:space-y-6',
        className
      )}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Business Card Extracted
          </h3>
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-1 text-sm text-gray-500">
            <span>
              Overall confidence: <ConfidenceBadge confidence={confidence} />
            </span>
            <span>Processing: {processingTime}ms</span>
            {duplicateCardId && (
              <span className="flex items-center gap-1 text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                Possible duplicate detected
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors touch-manipulation"
            >
              <Edit className="h-4 w-4" />
              Edit
            </button>
          ) : (
            <>
              <button
                onClick={handleCancel}
                className="inline-flex items-center justify-center gap-2 px-3 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors touch-manipulation"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors touch-manipulation"
              >
                <Save className="h-4 w-4" />
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Copy success notification */}
      {copySuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-sm text-green-700">{copySuccess} copied to clipboard!</p>
        </div>
      )}

      {/* Extracted Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <Field
          label="Name"
          value={editing ? editedData.name : extractedData.name?.text}
          confidence={extractedData.name?.confidence}
          icon={<User className="h-4 w-4" />}
          placeholder="Enter full name"
          isEditing={editing}
          onChange={value => setEditedData(prev => ({ ...prev, name: value }))}
          onCopy={() => handleCopy('Name')}
        />

        <Field
          label="Job Title"
          value={editing ? editedData.title : extractedData.jobTitle?.text}
          confidence={extractedData.jobTitle?.confidence}
          icon={<Briefcase className="h-4 w-4" />}
          placeholder="Enter job title"
          isEditing={editing}
          onChange={value => setEditedData(prev => ({ ...prev, title: value }))}
          onCopy={() => handleCopy('Job Title')}
        />

        <Field
          label="Company"
          value={editing ? editedData.company : extractedData.company?.text}
          confidence={extractedData.company?.confidence}
          icon={<Briefcase className="h-4 w-4" />}
          placeholder="Enter company name"
          isEditing={editing}
          onChange={value => setEditedData(prev => ({ ...prev, company: value }))}
          onCopy={() => handleCopy('Company')}
        />

        <Field
          label="Email"
          value={
            editing ? editedData.email : extractedData.normalizedEmail || extractedData.email?.text
          }
          confidence={extractedData.email?.confidence}
          icon={<Mail className="h-4 w-4" />}
          type="email"
          placeholder="Enter email address"
          isEditing={editing}
          onChange={value => setEditedData(prev => ({ ...prev, email: value }))}
          onCopy={() => handleCopy('Email')}
        />

        <Field
          label="Phone"
          value={
            editing ? editedData.phone : extractedData.normalizedPhone || extractedData.phone?.text
          }
          confidence={extractedData.phone?.confidence}
          icon={<Phone className="h-4 w-4" />}
          type="tel"
          placeholder="Enter phone number"
          isEditing={editing}
          onChange={value => setEditedData(prev => ({ ...prev, phone: value }))}
          onCopy={() => handleCopy('Phone')}
        />

        <Field
          label="Website"
          value={
            editing
              ? editedData.website
              : extractedData.normalizedWebsite || extractedData.website?.text
          }
          confidence={extractedData.website?.confidence}
          icon={<Globe className="h-4 w-4" />}
          type="url"
          placeholder="Enter website URL"
          isEditing={editing}
          onChange={value => setEditedData(prev => ({ ...prev, website: value }))}
          onCopy={() => handleCopy('Website')}
        />
      </div>

      {/* Address - full width */}
      <Field
        label="Address"
        value={editing ? editedData.address : extractedData.address?.text}
        confidence={extractedData.address?.confidence}
        icon={<MapPin className="h-4 w-4" />}
        placeholder="Enter address"
        isEditing={editing}
        onChange={value => setEditedData(prev => ({ ...prev, address: value }))}
        onCopy={() => handleCopy('Address')}
      />

      {/* Notes - only show when editing */}
      {editing && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">Notes</label>
          <textarea
            value={editedData.notes || ''}
            onChange={e => setEditedData(prev => ({ ...prev, notes: e.target.value }))}
            placeholder="Add any additional notes..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      )}

      {/* Enrichment Section */}
      {(editedData.company || extractedData.company?.text) && (
        <div className="pt-6 border-t border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
            <h4 className="text-lg font-medium text-gray-900">Company Information</h4>
            <EnrichmentButton
              cardId={result.data?.cardId}
              company={editedData.company || extractedData.company?.text}
              domain={
                editedData.website || extractedData.normalizedWebsite || extractedData.website?.text
              }
              onEnrichmentStart={handleEnrichmentStart}
              onEnrichmentComplete={handleEnrichmentComplete}
              onEnrichmentError={handleEnrichmentError}
              disabled={editing || isEnriching}
              size="md"
              variant="primary"
            />
          </div>

          {/* Enrichment Error Display */}
          {enrichmentError && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  <span className="text-red-800 font-medium">Enrichment Failed</span>
                </div>
                <button onClick={clearError} className="text-red-500 hover:text-red-700">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-red-700 text-sm mt-1">{enrichmentError}</p>
            </div>
          )}

          {/* Company Information Display */}
          <CompanyInfo
            companyData={enrichmentData || undefined}
            isLoading={isEnriching}
            onEnrich={() => {
              // Trigger enrichment
              const enrichButton = document.querySelector(
                '[data-enrichment-button]'
              ) as HTMLButtonElement;
              enrichButton?.click();
            }}
            showEnrichButton={false} // We have the main button above
          />
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200">
        <button
          onClick={onScanAnother}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors touch-manipulation"
        >
          Scan Another Card
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors touch-manipulation"
        >
          Close
        </button>
      </div>

      {/* Image preview if available */}
      {imageUrls.original && (
        <div className="pt-4 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Original Image</h4>
          <img
            src={imageUrls.original}
            alt="Original business card"
            className="max-w-xs rounded-lg border border-gray-200"
          />
        </div>
      )}
    </div>
  );
}
