/**
 * SaaS Login UI - Public API
 * Export all components, hooks, and types
 */

// Components
export { LoginComponent } from './components/LoginComponent';
export { LoginForm } from './components/LoginForm';
export { ForgotPassword } from './components/ForgotPassword';
export { ResetPassword } from './components/ResetPassword';

// Web Component
export { AuthLoginElement } from './web-component/auth-login';

// Hooks
export { useAuthMachine } from './hooks/useAuthMachine';
export { useApi } from './hooks/useApi';

// Types
export type {
  AuthState,
  AuthAction,
  LoginResponse,
  ErrorResponse,
  LoginFormState,
  ForgotPasswordFormState,
  ResetPasswordFormState,
  ThemeConfig,
  LoginComponentProps,
  AuthCustomEvent,
} from './types';

export { AUTH_EVENTS } from './types';

// Styles
export { baseStyles } from './styles';
export { DEFAULT_THEME, generateThemeVariables, applyTheme, themeClasses } from './styles/theme';
