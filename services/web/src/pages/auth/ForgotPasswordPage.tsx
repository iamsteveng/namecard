import { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import ForgotPasswordForm from '../../components/auth/ForgotPasswordForm';
import { useAuthStore } from '../../store/auth.store';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { forgotPassword, isAuthenticated, isLoading, error, clearError } = useAuthStore();
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [emailSent, setEmailSent] = useState('');

  useEffect(() => {
    clearError();
  }, [clearError]);

  // If already authenticated, redirect to dashboard
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleForgotPassword = async (email: string) => {
    try {
      setLocalError(null);
      setSuccess(false);
      await forgotPassword(email);
      setEmailSent(email);
      setSuccess(true);
    } catch (error: any) {
      setLocalError(error.message);
    }
  };

  const handleBackToLogin = () => {
    navigate('/auth/login');
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white rounded-lg shadow-md p-8">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                <svg
                  className="h-6 w-6 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 7.89a1 1 0 001.41 0L21 7M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Check Your Email</h2>
              <p className="text-gray-600 mb-4">
                We've sent password reset instructions to{' '}
                <span className="font-medium text-gray-900">{emailSent}</span>
              </p>
              <p className="text-sm text-gray-500 mb-6">
                If you don't see the email in your inbox, please check your spam folder.
              </p>
              <button
                onClick={handleBackToLogin}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                Back to Login
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">NameCard</h2>
          <p className="mt-2 text-sm text-gray-600">Business Card Scanner & Manager</p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <ForgotPasswordForm
          onSubmit={handleForgotPassword}
          isLoading={isLoading}
          error={localError || error}
          onBackToLogin={handleBackToLogin}
        />
      </div>
    </div>
  );
}
