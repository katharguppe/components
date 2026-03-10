/**
 * Login Form Component
 * Handles user authentication
 */

import React, { useState, useCallback } from 'react';
import { useAuthMachine } from '../hooks/useAuthMachine';
import { useApi } from '../hooks/useApi';
import { themeClasses } from '../styles/theme';

export interface LoginFormProps {
  bffUrl: string;
  tenantSlug: string;
  redirectUrl?: string;
  onLoginSuccess?: (response: { access_token: string; user: unknown }) => void;
  onLoginError?: (error: { code: string; message: string }) => void;
}

export function LoginForm({
  bffUrl,
  tenantSlug,
  redirectUrl,
  onLoginSuccess,
  onLoginError,
}: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string>('');
  
  const machine = useAuthMachine();
  const api = useApi(bffUrl);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      
      // Reset errors
      setFormError('');
      
      // Validate
      if (!email || !password) {
        setFormError('Please enter both email and password');
        return;
      }

      // Submit
      machine.submitLogin();

      try {
        const response = await api.login({
          email,
          password,
          tenant_slug: tenantSlug,
        });

        machine.onLoginSuccess(response);
        
        // Emit success event
        window.dispatchEvent(
          new CustomEvent('auth:login-success', {
            detail: {
              user: response.user,
              access_token: response.access_token,
            },
          })
        );

        // Callback
        onLoginSuccess?.({
          access_token: response.access_token,
          user: response.user,
        });

        // Auto-redirect after success
        setTimeout(() => {
          machine.redirectTo(redirectUrl);
        }, 1000);
      } catch (error: unknown) {
        const err = error as { code: string; message: string; attempts_remaining?: number; locked_until?: string };
        
        if (err.code === 'ACCOUNT_LOCKED') {
          machine.onAccountLocked({ locked_until: err.locked_until || '' });
        } else {
          machine.onLoginError(err);
        }

        // Emit error event
        window.dispatchEvent(
          new CustomEvent('auth:login-error', {
            detail: {
              code: err.code || 'UNKNOWN_ERROR',
              message: err.message || 'Login failed',
            },
          })
        );

        // Callback
        onLoginError?.({
          code: err.code || 'UNKNOWN_ERROR',
          message: err.message || 'Login failed',
        });

        setFormError(err.message || 'Login failed');
      }
    },
    [email, password, tenantSlug, redirectUrl, api, machine, onLoginSuccess, onLoginError]
  );

  const handleForgotPassword = useCallback(() => {
    machine.showForgotPassword();
  }, [machine]);

  // Render locked state
  if (machine.isLocked) {
    return (
      <div className={themeClasses.container}>
        <div className="auth-locked">
          <div className="auth-locked-icon">🔒</div>
          <h2 className="auth-locked-title">Account Locked</h2>
          <p className="auth-locked-message">
            Too many failed attempts. Please try again later.
          </p>
        </div>
      </div>
    );
  }

  // Render success state
  if (machine.isSuccess || machine.isRedirecting) {
    return (
      <div className={themeClasses.container}>
        <div className="auth-success">
          ✓ Login successful! Redirecting...
        </div>
      </div>
    );
  }

  return (
    <div className={themeClasses.container}>
      <form onSubmit={handleSubmit} className={themeClasses.form}>
        {/* Error Display */}
        {machine.isError && formError && (
          <div className={themeClasses.error}>
            <div className={themeClasses.errorTitle}>Login Failed</div>
            <div className={themeClasses.errorMessage}>{formError}</div>
          </div>
        )}

        {/* Email Input */}
        <div className={themeClasses.formGroup}>
          <label 
            htmlFor="email" 
            className={`${themeClasses.label} ${themeClasses.labelRequired}`}
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            className={themeClasses.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            disabled={machine.isSubmitting}
            autoComplete="email"
            required
          />
        </div>

        {/* Password Input */}
        <div className={themeClasses.formGroup}>
          <label 
            htmlFor="password" 
            className={`${themeClasses.label} ${themeClasses.labelRequired}`}
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            className={themeClasses.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            disabled={machine.isSubmitting}
            autoComplete="current-password"
            required
          />
        </div>

        {/* Forgot Password Link */}
        <div className={themeClasses.textCenter}>
          <button
            type="button"
            className={themeClasses.link}
            onClick={handleForgotPassword}
            disabled={machine.isSubmitting}
          >
            Forgot Password?
          </button>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          className={themeClasses.button}
          disabled={machine.isSubmitting || !email || !password}
        >
          {machine.isSubmitting ? (
            <>
              <span className="auth-spinner" />
              Signing in...
            </>
          ) : (
            'Sign In'
          )}
        </button>
      </form>
    </div>
  );
}

export default LoginForm;
