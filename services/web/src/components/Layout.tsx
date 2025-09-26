import { clsx } from 'clsx';
import {
  LayoutDashboard,
  ScanLine,
  CreditCard,
  Settings,
  Menu,
  X,
  User,
  LogOut,
  Search,
} from 'lucide-react';
import { useState, ReactNode, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useAuthStore } from '../store/auth.store';

interface LayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Scan', href: '/scan', icon: ScanLine },
  { name: 'Cards', href: '/cards', icon: CreditCard },
  { name: 'Search', href: '/cards?search=advanced', icon: Search },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const userMenuRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    await logout();
    navigate('/auth/login');
  };

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };

    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }

    return undefined;
  }, [userMenuOpen]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile menu */}
      <div className={clsx('fixed inset-0 z-50 lg:hidden', mobileMenuOpen ? 'block' : 'hidden')}>
        <div className="fixed inset-0 bg-gray-900/80" onClick={() => setMobileMenuOpen(false)} />
        <div className="fixed inset-y-0 left-0 z-50 w-64 bg-white px-6 py-6 flex flex-col">
          <div className="flex h-16 items-center justify-between">
            <Link to="/" className="text-xl font-bold text-gray-900">
              NameCard
            </Link>
            <button
              type="button"
              className="text-gray-400 hover:text-gray-500"
              onClick={() => setMobileMenuOpen(false)}
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          <nav className="mt-6">
            <ul className="space-y-1">
              {navigation.map(item => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <li key={item.name}>
                    <Link
                      to={item.href}
                      className={clsx(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                      )}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Icon className="h-5 w-5" />
                      {item.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* User menu - Mobile */}
          <div className="mt-auto pt-6 border-t border-gray-200">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                <span className="text-sm font-medium text-blue-700">
                  {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                </span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{user?.name || 'User'}</p>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>
            </div>
            <div className="mt-3 space-y-1">
              <Link
                to="/settings"
                className="flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => setMobileMenuOpen(false)}
              >
                <User className="h-4 w-4" />
                Profile
              </Link>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogout();
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:block lg:w-64 lg:bg-white lg:border-r lg:border-gray-200">
        <div className="flex h-16 items-center justify-between px-6">
          <Link to="/" className="text-xl font-bold text-gray-900">
            NameCard
          </Link>
        </div>
        <nav className="mt-6 px-6">
          <ul className="space-y-1">
            {navigation.map(item => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              return (
                <li key={item.name}>
                  <Link
                    to={item.href}
                    className={clsx(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {item.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User menu - Desktop */}
        <div className="absolute bottom-6 left-6 right-6">
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                <span className="text-sm font-medium text-blue-700">
                  {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                </span>
              </div>
              <div className="flex-1 text-left">
                <p className="truncate text-sm font-medium text-gray-900">{user?.name || 'User'}</p>
                <p className="truncate text-xs text-gray-500">{user?.email}</p>
              </div>
            </button>

            {userMenuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-2 rounded-lg bg-white py-2 shadow-lg ring-1 ring-black ring-opacity-5">
                <Link
                  to="/settings"
                  className="flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <User className="h-4 w-4" />
                  Profile
                </Link>
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    handleLogout();
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Mobile header */}
        <div className="sticky top-0 z-40 flex h-16 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-sm lg:hidden">
          <button type="button" className="text-gray-700" onClick={() => setMobileMenuOpen(true)}>
            <Menu className="h-6 w-6" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">NameCard</h1>
        </div>

        {/* Page content */}
        <main className="py-6">
          <div className="px-4 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
