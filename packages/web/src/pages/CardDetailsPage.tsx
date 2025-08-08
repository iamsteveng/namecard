import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2 } from 'lucide-react';
import CardDetails from '../components/cards/CardDetails';
import cardsService from '../services/cards.service';
import { useAuthStore } from '../store/auth.store';

export default function CardDetailsPage() {
  const { cardId } = useParams<{ cardId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useAuthStore();
  const accessToken = session?.accessToken;
  const [isEnriching, setIsEnriching] = useState(false);

  // Fetch card details
  const {
    data: cardResponse,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['card', cardId],
    queryFn: async () => {
      if (!accessToken || !cardId) {
        throw new Error('Missing authentication or card ID');
      }
      return cardsService.getCard(cardId, accessToken);
    },
    enabled: !!accessToken && !!cardId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Delete card mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!accessToken || !cardId) {
        throw new Error('Missing authentication or card ID');
      }
      return cardsService.deleteCard(cardId, accessToken);
    },
    onSuccess: () => {
      // Invalidate and refetch cards list
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      // Navigate back to cards list
      navigate('/cards');
    },
    onError: (error) => {
      console.error('Failed to delete card:', error);
      // You could show a toast notification here
    },
  });

  // Update card mutation (for future use in edit functionality)
  // const updateMutation = useMutation({
  //   mutationFn: async (updates: any) => {
  //     if (!accessToken || !cardId) {
  //       throw new Error('Missing authentication or card ID');
  //     }
  //     return cardsService.updateCard(cardId, updates, accessToken);
  //   },
  //   onSuccess: (data) => {
  //     // Update the card in the cache
  //     queryClient.setQueryData(['card', cardId], data);
  //     // Also update the cards list cache
  //     queryClient.invalidateQueries({ queryKey: ['cards'] });
  //   },
  //   onError: (error) => {
  //     console.error('Failed to update card:', error);
  //   },
  // });

  const card = cardResponse?.data?.card;

  // Handle enrichment (placeholder - would integrate with enrichment API)
  const handleEnrich = async () => {
    if (!card || !accessToken) return;
    
    setIsEnriching(true);
    try {
      // This would call the enrichment API endpoint
      console.log('Enriching card:', card.id);
      // For now, just refetch the card data after a delay
      setTimeout(() => {
        refetch();
        setIsEnriching(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to enrich card:', error);
      setIsEnriching(false);
    }
  };

  const handleEdit = () => {
    // Navigate to edit page or show edit modal
    navigate(`/cards/${cardId}/edit`);
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this card? This action cannot be undone.')) {
      deleteMutation.mutate();
    }
  };

  const handleShare = () => {
    // Implement sharing functionality
    const shareData = {
      title: card?.name ? `Business Card: ${card.name}` : 'Business Card',
      text: `${card?.name || 'Contact'} - ${card?.title || ''} at ${card?.company || ''}`.trim(),
      url: window.location.href,
    };

    if (navigator.share && navigator.canShare(shareData)) {
      navigator.share(shareData);
    } else {
      // Fallback to clipboard
      navigator.clipboard.writeText(window.location.href);
      // Show success message
      alert('Link copied to clipboard!');
    }
  };

  const handleExport = () => {
    // Implement export functionality (vCard, PDF, etc.)
    console.log('Exporting card:', card?.id);
    alert('Export functionality coming soon!');
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
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Failed to load card
          </h2>
          <p className="text-gray-600 mb-4">
            {error instanceof Error ? error.message : 'Something went wrong while loading the card details.'}
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => navigate('/cards')}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Back to Cards
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Card not found
  if (!card) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Card not found
          </h2>
          <p className="text-gray-600 mb-4">
            The card you're looking for doesn't exist or you don't have permission to view it.
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
      <CardDetails
        card={card}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onShare={handleShare}
        onExport={handleExport}
        onEnrich={handleEnrich}
        isEnriching={isEnriching}
      />
    </div>
  );
}