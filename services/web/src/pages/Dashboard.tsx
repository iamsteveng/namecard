import { useQuery } from '@tanstack/react-query';
import { ScanLine, CreditCard, Users, TrendingUp, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

import cardsService from '../services/cards.service';
import { useAuthStore } from '../store/auth.store';

export default function Dashboard() {
  const { user, session } = useAuthStore();
  const accessToken = session?.accessToken;

  // Fetch user's card statistics
  const {
    data: statsResponse,
    isLoading: statsLoading,
    error: statsError,
  } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => {
      if (!accessToken) {
        throw new Error('Not authenticated');
      }
      return cardsService.getStats(accessToken);
    },
    enabled: !!accessToken,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch recent cards (limit to 3 for dashboard)
  const {
    data: cardsResponse,
    isLoading: cardsLoading,
    error: cardsError,
  } = useQuery({
    queryKey: ['dashboard-recent-cards'],
    queryFn: () => {
      if (!accessToken) {
        throw new Error('Not authenticated');
      }
      return cardsService.getCards(accessToken, {
        page: 1,
        limit: 3,
        sort: 'desc',
        sortBy: 'createdAt',
      });
    },
    enabled: !!accessToken,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const stats = statsResponse?.data?.stats;
  const recentCards = cardsResponse?.data?.cards || [];

  // Calculate current month's cards (approximation based on recent data)
  const currentMonthCards = recentCards.filter(card => {
    const cardDate = new Date(card.createdAt);
    const now = new Date();
    return cardDate.getMonth() === now.getMonth() && cardDate.getFullYear() === now.getFullYear();
  }).length;

  // Transform API stats to dashboard format
  const dashboardStats = stats
    ? [
        {
          name: 'Total Cards',
          value: stats.totalCards.toString(),
          icon: CreditCard,
          change: '+0%', // TODO: Calculate actual change when historical data is available
        },
        {
          name: 'This Month',
          value: currentMonthCards.toString(),
          icon: ScanLine,
          change: '+0%', // TODO: Calculate actual change when historical data is available
        },
        {
          name: 'Avg Confidence',
          value: `${Math.round(stats.averageConfidence * 100)}%`,
          icon: Users,
          change: '+0%', // TODO: Calculate actual change when historical data is available
        },
        {
          name: 'Success Rate',
          value: `${Math.round(stats.processingSuccessRate * 100)}%`,
          icon: TrendingUp,
          change: '+0%', // TODO: Calculate actual change when historical data is available
        },
      ]
    : [];

  // Format relative time for recent cards
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    } else if (diffInDays === 1) {
      return '1 day ago';
    } else {
      return `${diffInDays} days ago`;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.name?.split(' ')[0] || 'there'}!
        </h1>
        <p className="mt-2 text-gray-600">
          Here's an overview of your business card scanning activity.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {statsLoading ? (
          // Loading skeleton
          Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="animate-pulse">
                <div className="flex items-center justify-between mb-4">
                  <div className="h-4 bg-gray-200 rounded w-20"></div>
                  <div className="h-8 w-8 bg-gray-200 rounded"></div>
                </div>
                <div className="h-8 bg-gray-200 rounded w-16 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-24"></div>
              </div>
            </div>
          ))
        ) : statsError ? (
          // Error state
          <div className="col-span-full bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-medium text-red-800">Failed to load statistics</h3>
                <p className="text-sm text-red-700 mt-1">
                  {statsError instanceof Error ? statsError.message : 'Something went wrong'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          dashboardStats.map(stat => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.name}
                className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                    <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Icon className="h-8 w-8 text-blue-600" />
                  </div>
                </div>
                {stat.change !== '+0%' && (
                  <div className="mt-4">
                    <span className="text-sm font-medium text-green-600">{stat.change}</span>
                    <span className="text-sm text-gray-500 ml-1">from last month</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            to="/scan"
            className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors group"
          >
            <ScanLine className="h-6 w-6 text-blue-600 group-hover:text-blue-700" />
            <div>
              <p className="font-medium text-gray-900">Scan New Card</p>
              <p className="text-sm text-gray-600">Upload and process a business card</p>
            </div>
          </Link>
          <Link
            to="/cards"
            className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors group"
          >
            <CreditCard className="h-6 w-6 text-blue-600 group-hover:text-blue-700" />
            <div>
              <p className="font-medium text-gray-900">View All Cards</p>
              <p className="text-sm text-gray-600">Browse your scanned business cards</p>
            </div>
          </Link>
          <Link
            to="/settings"
            className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors group"
          >
            <Users className="h-6 w-6 text-blue-600 group-hover:text-blue-700" />
            <div>
              <p className="font-medium text-gray-900">Export Contacts</p>
              <p className="text-sm text-gray-600">Download your contact list</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Recent Cards */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Recent Cards</h2>
            <Link to="/cards" className="text-sm font-medium text-blue-600 hover:text-blue-700">
              View all
            </Link>
          </div>
        </div>

        {cardsLoading ? (
          // Loading state for recent cards
          <div className="divide-y divide-gray-200">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="p-6">
                <div className="animate-pulse">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded w-48"></div>
                    </div>
                    <div className="h-3 bg-gray-200 rounded w-16"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : cardsError ? (
          // Error state for recent cards
          <div className="p-6">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-medium">Failed to load recent cards</h3>
                <p className="text-sm text-red-500 mt-1">
                  {cardsError instanceof Error ? cardsError.message : 'Something went wrong'}
                </p>
              </div>
            </div>
          </div>
        ) : recentCards.length === 0 ? (
          // Empty state
          <div className="p-6 text-center">
            <ScanLine className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-sm font-medium text-gray-900">No cards yet</h3>
            <p className="text-sm text-gray-500 mb-4">Start by scanning your first business card</p>
            <Link
              to="/scan"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <ScanLine className="h-4 w-4" />
              Scan Your First Card
            </Link>
          </div>
        ) : (
          // Recent cards list
          <div className="divide-y divide-gray-200">
            {recentCards.map(card => (
              <Link
                key={card.id}
                to={`/cards/${card.id}`}
                className="block p-6 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">{card.name || 'Unknown Name'}</h3>
                    <p className="text-sm text-gray-600">
                      {card.title && card.company
                        ? `${card.title} at ${card.company}`
                        : card.title || card.company || 'No title or company'}
                    </p>
                  </div>
                  <p className="text-sm text-gray-500">{formatRelativeTime(card.createdAt)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
