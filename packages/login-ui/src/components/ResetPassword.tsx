/**
 * Reset Password Component
 * Handles password reset completion with token
 */

import React, { useState, useCallback } from 'react';
import { useAuthMachine } from '../hooks/useAuthMachine';
import { useApi } from '../hooks/useApi';
import { themeClasses } from '../styles/theme';

export interface ResetPasswordProps {
  bffUrl: string;
  token: string;
  onSuccess?: () => void;
}

export function ResetPassword({ bffUrl, token, onSuccess }: ResetPasswordProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState('');
  
  const machine = useAuthMachine();
  const api = useApi(bffUrl);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      
      setFormError('');

      // Validate passwords match
      if (password !== confirmPassword) {
        setFormError('Passwords do not match');
        return;
      }

      // Validate password length
      if (password.length < 10) {
        setFormError('Password must be at least 10 characters');
        return;
      }

      machine.submitLogin();

      try {
        await api.resetPassword({
          token,
          password,
        });

        machine.onResetSuccess();
        
        // Emit event
        window.dispatchEvent(
          new CustomEvent('auth:password-reset-complete', {
            detail: { success: true },
          })
        );

        // Auto-redirect to login after success
        setTimeout(() => {
          onSuccess?.();
        }, 2000);
      } catch (error: unknown) {
        const err = error as { code: string; message: string };
        machine.onLoginError(err);
        setFormError(err.message || 'Failed to reset password');
      }
    },
    [password, confirmPassword, token, api, machine, onSuccess]
  );

  // Render success state
  if (machine.isResetSuccess) {
    return (
      <div className={themeClasses.container}>
        <h2 className={themeClasses.title}>Password Reset Successful</h2>
        
        <div className="auth-success auth-mb-16">
          ✓ Your password has been reset successfully
        </div>

        <p className={themeClasses.subtitle}>
          Redirecting to login...
        </p>
      </div>
    );
  }

  return (
    <div className={themeClasses.container}>
      <h2 className={themeClasses.title}>Reset Password</h2>
      <p className={themeClasses.subtitle}>
        Enter your new password
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
            htmlFor="new-password" 
            className={`${themeClasses.label} ${themeClasses.labelRequired}`}
          >
            New Password
          </label>
          <input
            id="new-password"
            type="password"
            className={themeClasses.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter new password"
            disabled={machine.isSubmitting}
            autoComplete="new-password"
            required
          />
        </div>

        <div className={themeClasses.formGroup}>
          <label 
            htmlFor="confirm-password" 
            className={`${themeClasses.label} ${themeClasses.labelRequired}`}
          >
            Confirm Password
          </label>
          <input
            id="confirm-password"
            type="password"
            className={themeClasses.input}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            disabled={machine.isSubmitting}
            autoComplete="new-password"
            required
          />
        </div>

        <button
          type="submit"
          className={themeClasses.button}
          disabled={machine.isSubmitting || !password || !confirmPassword}
        >
          {machine.isSubmitting ? (
            <>
              <span className="auth-spinner" />
              Resetting...
            </>
          ) : (
            'Reset Password'
          )}
        </button>
      </form>
    </div>
  );
}

export default ResetPassword;
