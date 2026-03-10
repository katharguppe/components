/**
 * API Client Hook
 * Handles HTTP communication with the Auth BFF service
 */

import { useCallback } from 'react';
import { LoginResponse, ErrorResponse, LoginFormState, ForgotPasswordFormState } from '../types';

export interface UseApiReturn {
  login: (data: LoginFormState) => Promise<LoginResponse>;
  forgotPassword: (data: ForgotPasswordFormState) => Promise<void>;
  resetPassword: (data: { token: string; password: string }) => Promise<void>;
  refreshToken: () => Promise<{ access_token: string; expires_in: number }>;
  logout: (accessToken: string) => Promise<void>;
  getCurrentUser: (accessToken: string) => Promise<LoginResponse['user']>;
}

/**
 * Create API client with base URL
 */
function createApiClient(bffUrl: string) {
  const baseUrl = bffUrl.replace(/\/$/, ''); // Remove trailing slash

  async function request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${baseUrl}${endpoint}`;

    const defaultHeaders: HeadersInit = {
      'Content-Type': 'application/json',
    };

    const response = await fetch(url, {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
      credentials: 'include', // Include cookies for refresh token
    });

    const data = await response.json();

    if (!response.ok) {
      const error: ErrorResponse = {
        code: data.code || 'UNKNOWN_ERROR',
        message: data.message || 'An unexpected error occurred',
        details: data.details,
      };
      throw error;
    }

    return data as T;
  }

  return { request };
}

/**
 * API hook for authentication operations
 */
export function useApi(bffUrl: string): UseApiReturn {
  const { request } = createApiClient(bffUrl);

  const login = useCallback(
    async (data: LoginFormState): Promise<LoginResponse> => {
      return request<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    [request]
  );

  const forgotPassword = useCallback(
    async (data: ForgotPasswordFormState): Promise<void> => {
      await request<void>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    [request]
  );

  const resetPassword = useCallback(
    async (data: { token: string; password: string }): Promise<void> => {
      await request<void>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    [request]
  );

  const refreshToken = useCallback(async (): Promise<{
    access_token: string;
    expires_in: number;
  }> => {
      return request<{ access_token: string; expires_in: number }>('/auth/refresh', {
        method: 'POST',
      });
    },
    [request]
  );

  const logout = useCallback(
    async (accessToken: string): Promise<void> => {
      await request<void>('/auth/logout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
    },
    [request]
  );

  const getCurrentUser = useCallback(
    async (accessToken: string): Promise<LoginResponse['user']> => {
      return request<LoginResponse['user']>('/auth/me', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
    },
    [request]
  );

  return {
    login,
    forgotPassword,
    resetPassword,
    refreshToken,
    logout,
    getCurrentUser,
  };
}

export default useApi;
