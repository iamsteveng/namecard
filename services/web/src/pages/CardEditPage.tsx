import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, Loader2, Save, Tag, X } from 'lucide-react';
import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import cardsService from '../services/cards.service';
import { useAuthStore } from '../store/auth.store';

export default function CardEditPage() {
  const { cardId } = useParams<{ cardId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useAuthStore();
  const accessToken = session?.accessToken;

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    title: '',
    company: '',
    email: '',
    phone: '',
    website: '',
    address: '',
    notes: '',
    tags: [] as string[],
  });
  const [newTag, setNewTag] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch card data
  const {
    data: cardResponse,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['card', cardId],
    queryFn: async () => {
      if (!accessToken || !cardId) {
        throw new Error('Missing authentication or card ID');
      }
      return cardsService.getCard(cardId, accessToken);
    },
    enabled: !!accessToken && !!cardId,
  });

  // Update form data when card data loads
  React.useEffect(() => {
    if (cardResponse?.data?.card) {
      const card = cardResponse.data.card;
      setFormData({
        name: card.name || '',
        title: card.title || '',
        company: card.company || '',
        email: card.email || '',
        phone: card.phone || '',
        website: card.website || '',
        address: card.address || '',
        notes: card.notes || '',
        tags: card.tags || [],
      });
    }
  }, [cardResponse]);

  // Update card mutation
  const updateMutation = useMutation({
    mutationFn: async (updates: any) => {
      if (!accessToken || !cardId) {
        throw new Error('Missing authentication or card ID');
      }
      return cardsService.updateCard(cardId, updates, accessToken);
    },
    onSuccess: () => {
      // Invalidate and refetch cards
      queryClient.invalidateQueries({ queryKey: ['card', cardId] });
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      // Navigate back to card details
      navigate(`/cards/${cardId}`);
    },
    onError: (error: any) => {
      console.error('Failed to update card:', error);
    },
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleAddTag = () => {
    const trimmedTag = newTag.trim();
    if (trimmedTag && !formData.tags.includes(trimmedTag)) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, trimmedTag],
      }));
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove),
    }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (formData.website && !formData.website.match(/^https?:\/\/.+/)) {
      newErrors.website = 'Website must include http:// or https://';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      await updateMutation.mutateAsync(formData);
    } catch (error) {
      console.error('Update failed:', error);
    }
  };

  const handleCancel = () => {
    navigate(`/cards/${cardId}`);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
          <p className="text-gray-600 mt-2">Loading card details...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Failed to load card</h2>
          <p className="text-gray-600 mb-4">
            {error instanceof Error
              ? error.message
              : 'Something went wrong while loading the card.'}
          </p>
          <button
            onClick={handleCancel}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Back to Cards
          </button>
        </div>
      </div>
    );
  }

  const card = cardResponse?.data?.card;

  if (!card) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Card not found</h2>
          <p className="text-gray-600 mb-4">
            The card you're trying to edit doesn't exist or you don't have permission to edit it.
          </p>
          <button
            onClick={() => navigate('/cards')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Cards
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="py-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={handleCancel}
              className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Card
            </button>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Business Card</h1>
          <p className="text-gray-600 mt-2">Update the information for this business card.</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="space-y-6">
            {/* Basic Information */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => handleInputChange('name', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.name ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="Enter full name"
                  />
                  {errors.name && <p className="text-red-600 text-sm mt-1">{errors.name}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Job Title</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={e => handleInputChange('title', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter job title"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Company</label>
                  <input
                    type="text"
                    value={formData.company}
                    onChange={e => handleInputChange('company', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter company name"
                  />
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Contact Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={e => handleInputChange('email', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.email ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="Enter email address"
                  />
                  {errors.email && <p className="text-red-600 text-sm mt-1">{errors.email}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={e => handleInputChange('phone', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter phone number"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Website</label>
                  <input
                    type="url"
                    value={formData.website}
                    onChange={e => handleInputChange('website', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.website ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="https://example.com"
                  />
                  {errors.website && <p className="text-red-600 text-sm mt-1">{errors.website}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={e => handleInputChange('address', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter address"
                  />
                </div>
              </div>
            </div>

            {/* Tags */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Tags</h3>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTag}
                    onChange={e => setNewTag(e.target.value)}
                    onKeyPress={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Add a tag..."
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <Tag className="h-4 w-4" />
                  </button>
                </div>

                {formData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formData.tags.map(tag => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
              <textarea
                value={formData.notes}
                onChange={e => handleInputChange('notes', e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Add any additional notes..."
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              disabled={updateMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>

          {updateMutation.error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                <div>
                  <h3 className="text-sm font-medium text-red-800">Failed to update card</h3>
                  <p className="text-sm text-red-700 mt-1">
                    {updateMutation.error instanceof Error
                      ? updateMutation.error.message
                      : 'Something went wrong. Please try again.'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
