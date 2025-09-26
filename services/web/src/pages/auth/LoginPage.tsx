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
  }, [clearError]);

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
