import { useState, useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import LoginForm from '../../components/auth/LoginForm';
import { useAuthStore } from '../../store/auth.store';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, isLoading, error, clearError } = useAuthStore();
  const [localError, setLocalError] = useState<string | null>(null);

  // Redirect to intended page after login
  const from = location.state?.from?.pathname || '/dashboard';

  useEffect(() => {
    clearError();
    
    // TEMPORARY DEV BYPASS: Auto-login in development mode
    if (import.meta.env.DEV && !isAuthenticated && !isLoading) {
      console.warn('🔓 AUTO-LOGIN ACTIVE - DEVELOPMENT ONLY');
      login('test@namecard.app', 'password').catch(err => {
        console.error('Auto-login failed:', err);
      });
    }
  }, [clearError, isAuthenticated, isLoading, login]);

  // If already authenticated, redirect to dashboard or intended page
  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const handleLogin = async (email: string, password: string) => {
    try {
      setLocalError(null);
      await login(email, password);
      // Navigation will happen automatically due to the Navigate component above
    } catch (error: any) {
      setLocalError(error.message);
    }
  };

  const handleSignUp = () => {
    navigate('/auth/register', { state: { from: location.state?.from } });
  };

  const handleForgotPassword = () => {
    navigate('/auth/forgot-password');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">NameCard</h2>
          <p className="mt-2 text-sm text-gray-600">Business Card Scanner & Manager</p>
          
          {/* TEMPORARY DEV MESSAGE */}
          {import.meta.env.DEV && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800">
                🔓 <strong>Development Mode:</strong> Auto-login active for testing
              </p>
              <p className="text-xs text-yellow-600 mt-1">
                This page will automatically log you in to test search functionality
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <LoginForm
          onSubmit={handleLogin}
          isLoading={isLoading}
          error={localError || error}
          onSignUp={handleSignUp}
          onForgotPassword={handleForgotPassword}
        />
      </div>
    </div>
  );
}
