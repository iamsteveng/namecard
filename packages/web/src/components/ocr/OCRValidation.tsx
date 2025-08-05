import { useState } from 'react';
import { clsx } from 'clsx';
import { Check, X, Edit2, AlertCircle, Star } from 'lucide-react';
import type { BusinessCardData } from '@namecard/shared/types/textract.types';
import type { CreateCardData } from '@namecard/shared/types/card.types';
import Button from '../Button';

interface OCRValidationProps {
  extractedData: BusinessCardData;
  originalImageUrl: string;
  onSave: (validatedData: Omit<CreateCardData, 'userId'>) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

interface ValidatedField {
  value: string;
  confidence: number;
  isEdited: boolean;
  isValid: boolean;
}

interface ValidationState {
  name: ValidatedField;
  title: ValidatedField;
  company: ValidatedField;
  email: ValidatedField;
  phone: ValidatedField;
  website: ValidatedField;
  address: ValidatedField;
  notes: ValidatedField;
  tags: string[];
}

export default function OCRValidation({
  extractedData,
  originalImageUrl,
  onSave,
  onCancel,
  loading = false,
}: OCRValidationProps) {
  const [validationState, setValidationState] = useState<ValidationState>(() => ({
    name: {
      value: extractedData.name?.text || '',
      confidence: extractedData.name?.confidence || 0,
      isEdited: false,
      isValid: true,
    },
    title: {
      value: extractedData.jobTitle?.text || '',
      confidence: extractedData.jobTitle?.confidence || 0,
      isEdited: false,
      isValid: true,
    },
    company: {
      value: extractedData.company?.text || '',
      confidence: extractedData.company?.confidence || 0,
      isEdited: false,
      isValid: true,
    },
    email: {
      value: extractedData.email?.text || '',
      confidence: extractedData.email?.confidence || 0,
      isEdited: false,
      isValid: validateEmail(extractedData.email?.text || ''),
    },
    phone: {
      value: extractedData.phone?.text || '',
      confidence: extractedData.phone?.confidence || 0,
      isEdited: false,
      isValid: validatePhone(extractedData.phone?.text || ''),
    },
    website: {
      value: extractedData.website?.text || '',
      confidence: extractedData.website?.confidence || 0,
      isEdited: false,
      isValid: validateWebsite(extractedData.website?.text || ''),
    },
    address: {
      value: extractedData.address?.text || '',
      confidence: extractedData.address?.confidence || 0,
      isEdited: false,
      isValid: true,
    },
    notes: {
      value: '',
      confidence: 100,
      isEdited: false,
      isValid: true,
    },
    tags: [],
  }));

  const updateField = (field: keyof Omit<ValidationState, 'tags'>, value: string) => {
    setValidationState((prev) => ({
      ...prev,
      [field]: {
        ...prev[field],
        value,
        isEdited: true,
        isValid: validateFieldValue(field, value),
      },
    }));
  };

  const addTag = (tag: string) => {
    if (tag.trim() && !validationState.tags.includes(tag.trim())) {
      setValidationState((prev) => ({
        ...prev,
        tags: [...prev.tags, tag.trim()],
      }));
    }
  };

  const removeTag = (tagToRemove: string) => {
    setValidationState((prev) => ({
      ...prev,
      tags: prev.tags.filter((tag) => tag !== tagToRemove),
    }));
  };

  const handleSave = async () => {
    const cardData: Omit<CreateCardData, 'userId'> = {
      originalImageUrl,
      extractedText: extractedData.rawText,
      confidence: extractedData.confidence,
      scanDate: new Date(),
      tags: validationState.tags,
    };

    // Only include fields that have values
    if (validationState.name.value) cardData.name = validationState.name.value;
    if (validationState.title.value) cardData.title = validationState.title.value;
    if (validationState.company.value) cardData.company = validationState.company.value;
    if (validationState.email.value) cardData.email = validationState.email.value;
    if (validationState.phone.value) cardData.phone = validationState.phone.value;
    if (validationState.website.value) cardData.website = validationState.website.value;
    if (validationState.address.value) cardData.address = validationState.address.value;
    if (validationState.notes.value) cardData.notes = validationState.notes.value;

    await onSave(cardData);
  };

  const isFormValid = Object.entries(validationState)
    .filter(([key]) => key !== 'tags')
    .every(([, field]) => (field as ValidatedField).isValid);

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900">Validate Business Card Information</h2>
        <p className="text-sm text-gray-600 mt-1">
          Review and edit the extracted information before saving
        </p>
      </div>

      <div className="flex flex-col lg:flex-row">
        {/* Image Preview */}
        <div className="lg:w-1/3 p-6 border-r border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Original Image</h3>
          <div className="aspect-[3/2] rounded-lg overflow-hidden bg-gray-100">
            <img
              src={originalImageUrl}
              alt="Business card"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-blue-700">
              <Star className="w-4 h-4" />
              <span>Overall Confidence: {Math.round(extractedData.confidence)}%</span>
            </div>
          </div>
        </div>

        {/* Form Fields */}
        <div className="lg:w-2/3 p-6">
          <div className="space-y-6">
            <FieldInput
              label="Full Name"
              value={validationState.name.value}
              confidence={validationState.name.confidence}
              isEdited={validationState.name.isEdited}
              isValid={validationState.name.isValid}
              onChange={(value) => updateField('name', value)}
              placeholder="Enter full name"
            />

            <FieldInput
              label="Job Title"
              value={validationState.title.value}
              confidence={validationState.title.confidence}
              isEdited={validationState.title.isEdited}
              isValid={validationState.title.isValid}
              onChange={(value) => updateField('title', value)}
              placeholder="Enter job title"
            />

            <FieldInput
              label="Company"
              value={validationState.company.value}
              confidence={validationState.company.confidence}
              isEdited={validationState.company.isEdited}
              isValid={validationState.company.isValid}
              onChange={(value) => updateField('company', value)}
              placeholder="Enter company name"
            />

            <FieldInput
              label="Email"
              type="email"
              value={validationState.email.value}
              confidence={validationState.email.confidence}
              isEdited={validationState.email.isEdited}
              isValid={validationState.email.isValid}
              onChange={(value) => updateField('email', value)}
              placeholder="Enter email address"
            />

            <FieldInput
              label="Phone"
              type="tel"
              value={validationState.phone.value}
              confidence={validationState.phone.confidence}
              isEdited={validationState.phone.isEdited}
              isValid={validationState.phone.isValid}
              onChange={(value) => updateField('phone', value)}
              placeholder="Enter phone number"
            />

            <FieldInput
              label="Website"
              type="url"
              value={validationState.website.value}
              confidence={validationState.website.confidence}
              isEdited={validationState.website.isEdited}
              isValid={validationState.website.isValid}
              onChange={(value) => updateField('website', value)}
              placeholder="Enter website URL"
            />

            <FieldInput
              label="Address"
              value={validationState.address.value}
              confidence={validationState.address.confidence}
              isEdited={validationState.address.isEdited}
              isValid={validationState.address.isValid}
              onChange={(value) => updateField('address', value)}
              placeholder="Enter address"
              multiline
            />

            <FieldInput
              label="Notes"
              value={validationState.notes.value}
              confidence={validationState.notes.confidence}
              isEdited={validationState.notes.isEdited}
              isValid={validationState.notes.isValid}
              onChange={(value) => updateField('notes', value)}
              placeholder="Add any additional notes"
              multiline
            />

            {/* Tags */}
            <TagInput
              tags={validationState.tags}
              onAddTag={addTag}
              onRemoveTag={removeTag}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-200">
            <Button variant="secondary" onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              loading={loading}
              disabled={!isFormValid}
            >
              Save Business Card
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Field Input Component
interface FieldInputProps {
  label: string;
  value: string;
  confidence: number;
  isEdited: boolean;
  isValid: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
}

function FieldInput({
  label,
  value,
  confidence,
  isEdited,
  isValid,
  onChange,
  placeholder,
  type = 'text',
  multiline = false,
}: FieldInputProps) {
  const InputComponent = multiline ? 'textarea' : 'input';
  const inputProps = multiline ? { rows: 3 } : { type };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <ConfidenceBadge
          confidence={confidence}
          isEdited={isEdited}
          isValid={isValid}
        />
      </div>
      <InputComponent
        {...inputProps}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={clsx(
          'block w-full rounded-md border shadow-sm px-3 py-2',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
          isValid
            ? 'border-gray-300'
            : 'border-red-300 bg-red-50',
          multiline && 'resize-vertical min-h-[80px]'
        )}
      />
      {!isValid && (
        <p className="text-sm text-red-600 flex items-center gap-1">
          <AlertCircle className="w-4 h-4" />
          Please enter a valid {label.toLowerCase()}
        </p>
      )}
    </div>
  );
}

// Confidence Badge Component
interface ConfidenceBadgeProps {
  confidence: number;
  isEdited: boolean;
  isValid: boolean;
}

function ConfidenceBadge({ confidence, isEdited }: ConfidenceBadgeProps) {
  if (isEdited) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
        <Edit2 className="w-3 h-3" />
        Edited
      </span>
    );
  }

  const getConfidenceColor = (conf: number) => {
    if (conf >= 90) return 'bg-green-100 text-green-800';
    if (conf >= 70) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getConfidenceIcon = (conf: number) => {
    if (conf >= 90) return <Check className="w-3 h-3" />;
    if (conf >= 70) return <AlertCircle className="w-3 h-3" />;
    return <X className="w-3 h-3" />;
  };

  return (
    <span className={clsx(
      'inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded',
      getConfidenceColor(confidence)
    )}>
      {getConfidenceIcon(confidence)}
      {Math.round(confidence)}%
    </span>
  );
}

// Tag Input Component
interface TagInputProps {
  tags: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
}

function TagInput({ tags, onAddTag, onRemoveTag }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (inputValue.trim()) {
        onAddTag(inputValue.trim());
        setInputValue('');
      }
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">Tags</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-1 text-sm bg-gray-100 text-gray-800 rounded"
          >
            {tag}
            <button
              type="button"
              onClick={() => onRemoveTag(tag)}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add tags (press Enter or comma to add)"
        className="block w-full rounded-md border border-gray-300 shadow-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
    </div>
  );
}

// Validation helpers
function validateEmail(email: string): boolean {
  if (!email) return true; // Optional field
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validatePhone(phone: string): boolean {
  if (!phone) return true; // Optional field
  const phoneRegex = /^[\+]?[\d\s\-\(\)\.]{10,}$/;
  return phoneRegex.test(phone);
}

function validateWebsite(website: string): boolean {
  if (!website) return true; // Optional field
  try {
    new URL(website.startsWith('http') ? website : `https://${website}`);
    return true;
  } catch {
    return false;
  }
}

function validateFieldValue(field: string, value: string): boolean {
  switch (field) {
    case 'email':
      return validateEmail(value);
    case 'phone':
      return validatePhone(value);
    case 'website':
      return validateWebsite(value);
    default:
      return true;
  }
}