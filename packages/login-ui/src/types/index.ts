/**
 * Authentication State Types
 * Defines the state machine for the login component
 */

// Authentication states
export type AuthState =
  | 'IDLE'
  | 'SUBMITTING'
  | 'SUCCESS'
  | 'ERROR'
  | 'LOCKED'
  | 'REDIRECTING'
  | 'FORGOT_PASSWORD'
  | 'OTP_SENT'
  | 'RESET_SUCCESS';

// Authentication actions
export type AuthAction =
  | { type: 'SUBMIT' }
  | { type: 'SUCCESS'; payload: LoginResponse }
  | { type: 'ERROR'; payload: ErrorResponse }
  | { type: 'LOCKED'; payload: { locked_until: string } }
  | { type: 'EDIT' }
  | { type: 'UNLOCK' }
  | { type: 'REDIRECT'; payload?: { redirectUrl: string } }
  | { type: 'FORGOT_PASSWORD' }
  | { type: 'OTP_SENT'; payload: { email: string } }
  | { type: 'RESET_SUCCESS' }
  | { type: 'RESET' };

// Login response from BFF
export interface LoginResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  user: {
    id: string;
    email: string;
    role: string;
    tenant_id: string;
    tenant_name: string;
  };
}

// Error response from BFF
export interface ErrorResponse {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  attempts_remaining?: number;
  locked_until?: string;
}

// Form data interfaces
export interface LoginFormState {
  email: string;
  password: string;
  tenant_slug: string;
}

export interface ForgotPasswordFormState {
  email: string;
  tenant_slug: string;
}

export interface ResetPasswordFormState {
  token: string;
  password: string;
  confirm_password: string;
}

// Theme configuration
export interface ThemeConfig {
  primary?: string;
  background?: string;
  text?: string;
  error?: string;
  borderRadius?: string;
  fontFamily?: string;
}

// Component props
export interface LoginComponentProps {
  bffUrl: string;
  tenantSlug: string;
  redirectUrl?: string;
  theme?: ThemeConfig;
  showRegister?: boolean;
  logoUrl?: string;
}

// Custom events
export interface AuthCustomEvent<T = unknown> extends CustomEvent<T> {
  detail: T;
}

export const AUTH_EVENTS = {
  LOGIN_SUCCESS: 'auth:login-success',
  LOGIN_ERROR: 'auth:login-error',
  LOGOUT: 'auth:logout',
  TOKEN_REFRESH: 'auth:token-refresh',
  SESSION_EXPIRED: 'auth:session-expired',
} as const;
