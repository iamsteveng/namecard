import { Navigate } from 'react-router-dom';

import { useAuthStore } from '../store/auth.store';

export default function RedirectToLogin() {
  const { isAuthenticated } = useAuthStore();

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <Navigate to="/auth/login" replace />;
}
