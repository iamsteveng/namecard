import { ScanLine, CreditCard, Users, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useAuthStore } from '../store/auth.store';

const stats = [
  { name: 'Total Cards', value: '42', icon: CreditCard, change: '+12%' },
  { name: 'This Month', value: '8', icon: ScanLine, change: '+4%' },
  { name: 'Contacts', value: '156', icon: Users, change: '+8%' },
  { name: 'Success Rate', value: '98%', icon: TrendingUp, change: '+2%' },
];

const recentCards = [
  {
    id: 1,
    name: 'John Smith',
    title: 'Senior Developer',
    company: 'Tech Corp',
    scannedAt: '2 hours ago',
  },
  {
    id: 2,
    name: 'Sarah Johnson',
    title: 'Product Manager',
    company: 'Innovation Ltd',
    scannedAt: '1 day ago',
  },
  {
    id: 3,
    name: 'Michael Chen',
    title: 'Design Lead',
    company: 'Creative Studio',
    scannedAt: '2 days ago',
  },
];

export default function Dashboard() {
  const { user } = useAuthStore();

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
        {stats.map(stat => {
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
              <div className="mt-4">
                <span className="text-sm font-medium text-green-600">{stat.change}</span>
                <span className="text-sm text-gray-500 ml-1">from last month</span>
              </div>
            </div>
          );
        })}
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
        <div className="divide-y divide-gray-200">
          {recentCards.map(card => (
            <div key={card.id} className="p-6 hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">{card.name}</h3>
                  <p className="text-sm text-gray-600">
                    {card.title} at {card.company}
                  </p>
                </div>
                <p className="text-sm text-gray-500">{card.scannedAt}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
