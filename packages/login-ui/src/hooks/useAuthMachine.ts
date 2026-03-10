/**
 * Authentication State Machine Hook
 * Implements useReducer pattern for login state management
 * Architecture Spec Section 8
 */

import { useReducer, useCallback } from 'react';
import { AuthState, AuthAction, LoginResponse, ErrorResponse } from '../types';

// Initial state
const initialState: AuthState = 'IDLE';

// State transition table
const stateTransitions: Record<AuthState, Record<AuthAction['type'], AuthState | null>> = {
  IDLE: {
    SUBMIT: 'SUBMITTING',
    SUCCESS: null,
    ERROR: null,
    LOCKED: null,
    EDIT: null,
    UNLOCK: null,
    REDIRECT: null,
    FORGOT_PASSWORD: 'FORGOT_PASSWORD',
    OTP_SENT: null,
    RESET_SUCCESS: null,
    RESET: 'IDLE',
  },
  SUBMITTING: {
    SUBMIT: null,
    SUCCESS: 'SUCCESS',
    ERROR: 'ERROR',
    LOCKED: 'LOCKED',
    EDIT: null,
    UNLOCK: null,
    REDIRECT: null,
    FORGOT_PASSWORD: null,
    OTP_SENT: null,
    RESET_SUCCESS: null,
    RESET: 'IDLE',
  },
  SUCCESS: {
    SUBMIT: null,
    SUCCESS: null,
    ERROR: null,
    LOCKED: null,
    EDIT: null,
    UNLOCK: null,
    REDIRECT: 'REDIRECTING',
    FORGOT_PASSWORD: null,
    OTP_SENT: null,
    RESET_SUCCESS: null,
    RESET: 'IDLE',
  },
  ERROR: {
    SUBMIT: 'SUBMITTING',
    SUCCESS: null,
    ERROR: null,
    LOCKED: null,
    EDIT: 'IDLE',
    UNLOCK: null,
    REDIRECT: null,
    FORGOT_PASSWORD: 'FORGOT_PASSWORD',
    OTP_SENT: null,
    RESET_SUCCESS: null,
    RESET: 'IDLE',
  },
  LOCKED: {
    SUBMIT: null,
    SUCCESS: null,
    ERROR: null,
    LOCKED: null,
    EDIT: null,
    UNLOCK: 'IDLE',
    REDIRECT: null,
    FORGOT_PASSWORD: null,
    OTP_SENT: null,
    RESET_SUCCESS: null,
    RESET: 'IDLE',
  },
  REDIRECTING: {
    SUBMIT: null,
    SUCCESS: null,
    ERROR: null,
    LOCKED: null,
    EDIT: null,
    UNLOCK: null,
    REDIRECT: null,
    FORGOT_PASSWORD: null,
    OTP_SENT: null,
    RESET_SUCCESS: null,
    RESET: 'IDLE',
  },
  FORGOT_PASSWORD: {
    SUBMIT: 'SUBMITTING',
    SUCCESS: null,
    ERROR: 'ERROR',
    LOCKED: null,
    EDIT: 'IDLE',
    UNLOCK: null,
    REDIRECT: null,
    FORGOT_PASSWORD: null,
    OTP_SENT: 'OTP_SENT',
    RESET_SUCCESS: null,
    RESET: 'IDLE',
  },
  OTP_SENT: {
    SUBMIT: null,
    SUCCESS: null,
    ERROR: 'ERROR',
    LOCKED: null,
    EDIT: 'IDLE',
    UNLOCK: null,
    REDIRECT: null,
    FORGOT_PASSWORD: null,
    OTP_SENT: null,
    RESET_SUCCESS: 'RESET_SUCCESS',
    RESET: 'IDLE',
  },
  RESET_SUCCESS: {
    SUBMIT: null,
    SUCCESS: null,
    ERROR: null,
    LOCKED: null,
    EDIT: null,
    UNLOCK: null,
    REDIRECT: null,
    FORGOT_PASSWORD: null,
    OTP_SENT: null,
    RESET_SUCCESS: null,
    RESET: 'IDLE',
  },
};

// Reducer function
function authReducer(state: AuthState, action: AuthAction): AuthState {
  const nextState = stateTransitions[state][action.type];

  if (nextState === null) {
    // Invalid transition - log warning in development
    if (process.env.NODE_ENV === 'development') {
      console.warn(`Invalid state transition: ${state} -> ${action.type}`);
    }
    return state;
  }

  return nextState;
}

// Hook return type
export interface UseAuthMachineReturn {
  state: AuthState;
  dispatch: React.Dispatch<AuthAction>;
  // Action creators
  submitLogin: () => void;
  onLoginSuccess: (payload: LoginResponse) => void;
  onLoginError: (payload: ErrorResponse) => void;
  onAccountLocked: (payload: { locked_until: string }) => void;
  editForm: () => void;
  unlockAccount: () => void;
  redirectTo: (redirectUrl?: string) => void;
  showForgotPassword: () => void;
  onOtpSent: (payload: { email: string }) => void;
  onResetSuccess: () => void;
  resetForm: () => void;
  // State checks
  isSubmitting: boolean;
  isSuccess: boolean;
  isError: boolean;
  isLocked: boolean;
  isRedirecting: boolean;
  isForgotPassword: boolean;
  isOtpSent: boolean;
  isResetSuccess: boolean;
}

/**
 * Authentication state machine hook
 * Manages login state transitions using useReducer
 */
export function useAuthMachine(): UseAuthMachineReturn {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Action creators
  const submitLogin = useCallback(() => {
    dispatch({ type: 'SUBMIT' });
  }, []);

  const onLoginSuccess = useCallback((payload: LoginResponse) => {
    dispatch({ type: 'SUCCESS', payload });
  }, []);

  const onLoginError = useCallback((payload: ErrorResponse) => {
    dispatch({ type: 'ERROR', payload });
  }, []);

  const onAccountLocked = useCallback((payload: { locked_until: string }) => {
    dispatch({ type: 'LOCKED', payload });
  }, []);

  const editForm = useCallback(() => {
    dispatch({ type: 'EDIT' });
  }, []);

  const unlockAccount = useCallback(() => {
    dispatch({ type: 'UNLOCK' });
  }, []);

  const redirectTo = useCallback((redirectUrl?: string) => {
    dispatch({ type: 'REDIRECT', payload: { redirectUrl: redirectUrl || '/' } });
  }, []);

  const showForgotPassword = useCallback(() => {
    dispatch({ type: 'FORGOT_PASSWORD' });
  }, []);

  const onOtpSent = useCallback((payload: { email: string }) => {
    dispatch({ type: 'OTP_SENT', payload });
  }, []);

  const onResetSuccess = useCallback(() => {
    dispatch({ type: 'RESET_SUCCESS' });
  }, []);

  const resetForm = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  // State checks
  const isSubmitting = state === 'SUBMITTING';
  const isSuccess = state === 'SUCCESS';
  const isError = state === 'ERROR';
  const isLocked = state === 'LOCKED';
  const isRedirecting = state === 'REDIRECTING';
  const isForgotPassword = state === 'FORGOT_PASSWORD';
  const isOtpSent = state === 'OTP_SENT';
  const isResetSuccess = state === 'RESET_SUCCESS';

  return {
    state,
    dispatch,
    submitLogin,
    onLoginSuccess,
    onLoginError,
    onAccountLocked,
    editForm,
    unlockAccount,
    redirectTo,
    showForgotPassword,
    onOtpSent,
    onResetSuccess,
    resetForm,
    isSubmitting,
    isSuccess,
    isError,
    isLocked,
    isRedirecting,
    isForgotPassword,
    isOtpSent,
    isResetSuccess,
  };
}

export default useAuthMachine;
