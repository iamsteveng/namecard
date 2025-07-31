import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';

interface ProtectedRouteProps {
  children: React.ReactNode;
  redirectTo?: string;
}

export default function ProtectedRoute({ 
  children, 
  redirectTo = '/auth/login' 
}: ProtectedRouteProps) {
  const { isAuthenticated, session, refreshToken } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    // Check if token is expired and try to refresh
    if (session?.expiresAt && new Date() >= new Date(session.expiresAt)) {
      if (session.refreshToken) {
        refreshToken().catch(() => {
          // Refresh failed, user will be redirected to login
        });
      }
    }
  }, [session, refreshToken]);

  if (!isAuthenticated || !session) {
    // Redirect to login with the current location so we can redirect back after login
    return (
      <Navigate 
        to={redirectTo} 
        state={{ from: location }} 
        replace 
      />
    );
  }

  return <>{children}</>;
}