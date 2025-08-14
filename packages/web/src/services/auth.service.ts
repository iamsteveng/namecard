import type {
  LoginResponse,
  RegisterResponse,
  LogoutResponse,
  RefreshTokenResponse,
  GetUserProfileResponse,
  UpdateUserProfileResponse,
} from '@namecard/shared';

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || '';

class AuthService {
  private baseUrl = `${API_BASE_URL}/api/v1/auth`;
  
  /**
   * Register a new user
   */
  async register(email: string, password: string, name: string): Promise<RegisterResponse> {
    const response = await fetch(`${this.baseUrl}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, name }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Registration failed');
    }

    return data;
  }

  /**
   * Login user
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await fetch(`${this.baseUrl}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Login failed');
    }

    return data;
  }

  /**
   * Logout user
   */
  async logout(accessToken: string): Promise<LogoutResponse> {
    const response = await fetch(`${this.baseUrl}/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Logout failed');
    }

    return data;
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<RefreshTokenResponse> {
    const response = await fetch(`${this.baseUrl}/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Token refresh failed');
    }

    return data;
  }

  /**
   * Get user profile
   */
  async getProfile(accessToken: string): Promise<GetUserProfileResponse> {
    const response = await fetch(`${this.baseUrl}/profile`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Failed to get profile');
    }

    return data;
  }

  /**
   * Update user profile
   */
  async updateProfile(
    accessToken: string, 
    updates: { name?: string; avatarUrl?: string; preferences?: any }
  ): Promise<UpdateUserProfileResponse> {
    const response = await fetch(`${this.baseUrl}/profile`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Failed to update profile');
    }

    return data;
  }

  /**
   * Initiate forgot password flow
   */
  async forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${this.baseUrl}/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Forgot password failed');
    }

    return data;
  }

  /**
   * Confirm password reset
   */
  async resetPassword(
    email: string, 
    confirmationCode: string, 
    newPassword: string
  ): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${this.baseUrl}/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, confirmationCode, newPassword }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Password reset failed');
    }

    return data;
  }
}

export default new AuthService();