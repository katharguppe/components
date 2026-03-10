/**
 * Main Login Component
 * Orchestrates login, forgot password, and reset password flows
 */

import { useState, useEffect } from 'react';
import { LoginForm } from './LoginForm';
import { ForgotPassword } from './ForgotPassword';
import { ResetPassword } from './ResetPassword';
import { ThemeConfig } from '../types';
import { applyTheme } from '../styles/theme';

export interface LoginComponentProps {
  /** Auth BFF API base URL */
  bffUrl: string;
  /** Tenant slug for multi-tenant routing */
  tenantSlug: string;
  /** URL to redirect after successful login */
  redirectUrl?: string;
  /** Theme configuration for white-labelling */
  theme?: ThemeConfig;
  /** Show register link (not implemented) */
  showRegister?: boolean;
  /** Logo URL to display */
  logoUrl?: string;
  /** Reset token (for password reset flow) */
  resetToken?: string;
  /** Callback on successful login */
  onLoginSuccess?: (response: { access_token: string; user: unknown }) => void;
  /** Callback on login error */
  onLoginError?: (error: { code: string; message: string }) => void;
}

export type LoginView = 'login' | 'forgot-password' | 'reset-password';

/**
 * Main Login Component
 * Handles all authentication flows
 */
export function LoginComponent({
  bffUrl,
  tenantSlug,
  redirectUrl,
  theme,
  logoUrl,
  resetToken,
  onLoginSuccess,
  onLoginError,
}: LoginComponentProps) {
  const [view, setView] = useState<LoginView>(() => {
    // Start with reset password view if token is provided
    return resetToken ? 'reset-password' : 'login';
  });

  // Apply theme on mount
  useEffect(() => {
    const container = document.getElementById('auth-login-container');
    if (container && theme) {
      applyTheme(container, theme);
    }
  }, [theme]);

  const handleBack = () => {
    setView('login');
  };

  const handleForgotPassword = () => {
    setView('forgot-password');
  };

  const handleResetSuccess = () => {
    setView('login');
  };

  // Render based on current view
  switch (view) {
    case 'forgot-password':
      return (
        <div id="auth-login-container">
          {logoUrl && <img src={logoUrl} alt="Logo" className="auth-logo" />}
          <ForgotPassword
            bffUrl={bffUrl}
            tenantSlug={tenantSlug}
            onBack={handleBack}
          />
        </div>
      );

    case 'reset-password':
      return (
        <div id="auth-login-container">
          {logoUrl && <img src={logoUrl} alt="Logo" className="auth-logo" />}
          {resetToken && (
            <ResetPassword
              bffUrl={bffUrl}
              token={resetToken}
              onSuccess={handleResetSuccess}
            />
          )}
        </div>
      );

    case 'login':
    default:
      return (
        <div id="auth-login-container">
          {logoUrl && <img src={logoUrl} alt="Logo" className="auth-logo" />}
          <LoginForm
            bffUrl={bffUrl}
            tenantSlug={tenantSlug}
            redirectUrl={redirectUrl}
            onLoginSuccess={onLoginSuccess}
            onLoginError={onLoginError}
          />
          <div className="auth-footer">
            <button
              type="button"
              className="auth-link"
              onClick={handleForgotPassword}
            >
              Forgot Password?
            </button>
          </div>
        </div>
      );
  }
}

export default LoginComponent;
