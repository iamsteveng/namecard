import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import ProtectedRoute from './components/auth/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import CardDetailsPage from './pages/CardDetailsPage';
import CardEditPage from './pages/CardEditPage';
import Cards from './pages/Cards';
import Dashboard from './pages/Dashboard';
import NotFound from './pages/NotFound';
import Scan from './pages/Scan';
import Settings from './pages/Settings';

// Create a query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <Router>
          <Routes>
            {/* Public authentication routes */}
            <Route path="/auth/login" element={<LoginPage />} />
            <Route path="/auth/register" element={<RegisterPage />} />
            <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />

            {/* Protected routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Dashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/scan"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Scan />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/cards"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Cards />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/cards/:cardId"
              element={
                <ProtectedRoute>
                  <Layout>
                    <CardDetailsPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/cards/:cardId/edit"
              element={
                <ProtectedRoute>
                  <Layout>
                    <CardEditPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Settings />
                  </Layout>
                </ProtectedRoute>
              }
            />

            {/* 404 Catch-all route */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Router>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}
