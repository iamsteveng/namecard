import { useState, useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import RegisterForm from '../../components/auth/RegisterForm';
import { useAuthStore } from '../../store/auth.store';

export default function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { register, isAuthenticated, isLoading, error, clearError } = useAuthStore();
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    clearError();
  }, [clearError]);

  // If already authenticated, redirect to dashboard
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleRegister = async (email: string, password: string, name: string) => {
    try {
      setLocalError(null);
      setSuccess(false);
      await register(email, password, name);
      setSuccess(true);

      // Redirect to login after successful registration
      setTimeout(() => {
        navigate('/auth/login', {
          state: {
            from: location.state?.from,
            message: 'Registration successful! Please log in with your credentials.',
          },
        });
      }, 2000);
    } catch (error: any) {
      setLocalError(error.message);
    }
  };

  const handleSignIn = () => {
    navigate('/auth/login', { state: { from: location.state?.from } });
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
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Registration Successful!</h2>
              <p className="text-gray-600 mb-4">
                Your account has been created successfully. You'll be redirected to the login page
                shortly.
              </p>
              <div className="flex items-center justify-center">
                <svg
                  className="animate-spin h-5 w-5 text-blue-500"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <span className="ml-2 text-sm text-gray-600">Redirecting...</span>
              </div>
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
        <RegisterForm
          onSubmit={handleRegister}
          isLoading={isLoading}
          error={localError || error}
          onSignIn={handleSignIn}
        />
      </div>
    </div>
  );
}
