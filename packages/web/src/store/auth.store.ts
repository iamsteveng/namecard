import type { User, UserSession } from '@namecard/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import authService from '../services/auth.service';

interface AuthState {
  // State
  user: User | null;
  session: UserSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  getProfile: () => Promise<void>;
  updateProfile: (updates: {
    name?: string;
    avatarUrl?: string;
    preferences?: any;
  }) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  clearError: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      // Actions
      login: async (email: string, password: string) => {
        try {
          set({ isLoading: true, error: null });

          const response = await authService.login(email, password);

          if (response.success) {
            set({
              user: response.data.user,
              session: response.data.session,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            });
          } else {
            throw new Error('Login failed');
          }
        } catch (error: any) {
          set({
            user: null,
            session: null,
            isAuthenticated: false,
            isLoading: false,
            error: error.message || 'Login failed',
          });
          throw error;
        }
      },

      register: async (email: string, password: string, name: string) => {
        try {
          set({ isLoading: true, error: null });

          const response = await authService.register(email, password, name);

          if (response.success) {
            // Registration successful but user needs to login
            set({
              isLoading: false,
              error: null,
            });
          } else {
            throw new Error('Registration failed');
          }
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.message || 'Registration failed',
          });
          throw error;
        }
      },

      logout: async () => {
        try {
          const { session } = get();
          set({ isLoading: true, error: null });

          if (session?.accessToken) {
            await authService.logout(session.accessToken);
          }

          set({
            user: null,
            session: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
        } catch (error: any) {
          // Even if logout fails on server, clear local state
          set({
            user: null,
            session: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
        }
      },

      refreshToken: async () => {
        try {
          const { session } = get();

          if (!session?.refreshToken) {
            throw new Error('No refresh token available');
          }

          const response = await authService.refreshToken(session.refreshToken);

          if (response.success) {
            set(state => ({
              session: state.session
                ? {
                    ...state.session,
                    accessToken: response.data.accessToken,
                    expiresAt: response.data.expiresAt,
                  }
                : null,
              error: null,
            }));
          } else {
            throw new Error('Token refresh failed');
          }
        } catch (error: any) {
          // If refresh fails, clear auth state
          set({
            user: null,
            session: null,
            isAuthenticated: false,
            error: 'Session expired. Please log in again.',
          });
          throw error;
        }
      },

      getProfile: async () => {
        try {
          const { session } = get();

          if (!session?.accessToken) {
            throw new Error('No access token available');
          }

          set({ isLoading: true, error: null });

          const response = await authService.getProfile(session.accessToken);

          if (response.success) {
            set(state => ({
              user: state.user
                ? {
                    ...state.user,
                    ...response.data,
                  }
                : null,
              isLoading: false,
              error: null,
            }));
          } else {
            throw new Error('Failed to get profile');
          }
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.message || 'Failed to get profile',
          });

          // If unauthorized, try to refresh token
          if (error.message.includes('401') || error.message.includes('unauthorized')) {
            try {
              await get().refreshToken();
              // Retry getting profile after refresh
              await get().getProfile();
            } catch (refreshError) {
              // Refresh failed, user needs to login again
            }
          }

          throw error;
        }
      },

      updateProfile: async (updates: { name?: string; avatarUrl?: string; preferences?: any }) => {
        try {
          const { session } = get();

          if (!session?.accessToken) {
            throw new Error('No access token available');
          }

          set({ isLoading: true, error: null });

          const response = await authService.updateProfile(session.accessToken, updates);

          if (response.success) {
            set(state => ({
              user: response.data,
              session: state.session,
              isLoading: false,
              error: null,
            }));
          } else {
            throw new Error('Failed to update profile');
          }
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.message || 'Failed to update profile',
          });
          throw error;
        }
      },

      forgotPassword: async (email: string) => {
        try {
          set({ isLoading: true, error: null });

          await authService.forgotPassword(email);

          set({
            isLoading: false,
            error: null,
          });
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.message || 'Failed to send reset email',
          });
          throw error;
        }
      },

      clearError: () => set({ error: null }),

      setLoading: (loading: boolean) => set({ isLoading: loading }),
    }),
    {
      name: 'namecard-auth',
      partialize: state => ({
        user: state.user,
        session: state.session,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Helper function to check if token is expired
export const isTokenExpired = (expiresAt: Date): boolean => {
  return new Date() >= new Date(expiresAt);
};

// Helper function to setup automatic token refresh
export const setupAutoRefresh = () => {
  const { session, refreshToken } = useAuthStore.getState();

  if (session?.expiresAt && session?.refreshToken) {
    const expiresAt = new Date(session.expiresAt);
    const now = new Date();
    const timeUntilExpiry = expiresAt.getTime() - now.getTime();

    // Refresh 5 minutes before expiry
    const refreshTime = Math.max(timeUntilExpiry - 5 * 60 * 1000, 0);

    if (refreshTime > 0) {
      setTimeout(async () => {
        try {
          await refreshToken();
          setupAutoRefresh(); // Setup next refresh
        } catch (error) {
          console.error('Auto refresh failed:', error);
        }
      }, refreshTime);
    }
  }
};
