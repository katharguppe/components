/**
 * Forgot Password Component
 * Handles password reset request
 */

import React, { useState, useCallback } from 'react';
import { useAuthMachine } from '../hooks/useAuthMachine';
import { useApi } from '../hooks/useApi';
import { themeClasses } from '../styles/theme';

export interface ForgotPasswordProps {
  bffUrl: string;
  tenantSlug: string;
  onBack?: () => void;
}

export function ForgotPassword({ bffUrl, tenantSlug, onBack }: ForgotPasswordProps) {
  const [email, setEmail] = useState('');
  const [formError, setFormError] = useState('');
  
  const machine = useAuthMachine();
  const api = useApi(bffUrl);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      
      setFormError('');
      
      if (!email) {
        setFormError('Please enter your email');
        return;
      }

      machine.submitLogin();

      try {
        await api.forgotPassword({
          email,
          tenant_slug: tenantSlug,
        });

        machine.onOtpSent({ email });
        
        // Emit event
        window.dispatchEvent(
          new CustomEvent('auth:password-reset-sent', {
            detail: { email },
          })
        );
      } catch (error: unknown) {
        const err = error as { code: string; message: string };
        machine.onLoginError(err);
        setFormError(err.message || 'Failed to send reset email');
      }
    },
    [email, tenantSlug, api, machine]
  );

  // Render OTP sent state
  if (machine.isOtpSent) {
    return (
      <div className={themeClasses.container}>
        <h2 className={themeClasses.title}>Check Your Email</h2>
        <p className={themeClasses.subtitle}>
          We've sent password reset instructions to <strong>{email}</strong>
        </p>
        
        <div className="auth-success auth-mb-16">
          ✓ Reset email sent successfully
        </div>

        <button
          type="button"
          className={`${themeClasses.button} ${themeClasses.buttonSecondary}`}
          onClick={onBack}
        >
          Back to Login
        </button>
      </div>
    );
  }

  return (
    <div className={themeClasses.container}>
      <h2 className={themeClasses.title}>Forgot Password</h2>
      <p className={themeClasses.subtitle}>
        Enter your email and we'll send you reset instructions
      </p>

      <form onSubmit={handleSubmit} className={themeClasses.form}>
        {machine.isError && formError && (
          <div className={themeClasses.error}>
            <div className={themeClasses.errorTitle}>Error</div>
            <div className={themeClasses.errorMessage}>{formError}</div>
          </div>
        )}

        <div className={themeClasses.formGroup}>
          <label 
            htmlFor="reset-email" 
            className={`${themeClasses.label} ${themeClasses.labelRequired}`}
          >
            Email
          </label>
          <input
            id="reset-email"
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

        <button
          type="submit"
          className={themeClasses.button}
          disabled={machine.isSubmitting || !email}
        >
          {machine.isSubmitting ? (
            <>
              <span className="auth-spinner" />
              Sending...
            </>
          ) : (
            'Send Reset Instructions'
          )}
        </button>

        <button
          type="button"
          className={`${themeClasses.button} ${themeClasses.buttonSecondary}`}
          onClick={onBack}
          disabled={machine.isSubmitting}
        >
          Back to Login
        </button>
      </form>
    </div>
  );
}

export default ForgotPassword;
