/**
 * Theme System
 * Implements white-labelling support via CSS variables
 */

import { ThemeConfig } from '../types';

// Default theme values
export const DEFAULT_THEME: Required<ThemeConfig> = {
  primary: '#2E75B6',      // Professional blue
  background: '#FFFFFF',   // White
  text: '#333333',         // Dark gray
  error: '#DC3545',        // Red
  borderRadius: '8px',     // 8px radius
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

/**
 * Generate CSS variables from theme config
 */
export function generateThemeVariables(theme: ThemeConfig): string {
  const merged = { ...DEFAULT_THEME, ...theme };

  return `
    --auth-primary: ${merged.primary};
    --auth-primary-hover: ${adjustColorOpacity(merged.primary, 0.9)};
    --auth-background: ${merged.background};
    --auth-text: ${merged.text};
    --auth-text-secondary: ${adjustColorOpacity(merged.text, 0.7)};
    --auth-error: ${merged.error};
    --auth-border-radius: ${merged.borderRadius};
    --auth-font-family: ${merged.fontFamily};
    --auth-border-color: #E0E0E0;
    --auth-input-background: #F8F9FA;
    --auth-success: #28A745;
    --auth-warning: #FFC107;
  `;
}

/**
 * Apply theme to element
 */
export function applyTheme(element: HTMLElement, theme: ThemeConfig): void {
  const cssVars = generateThemeVariables(theme);
  element.style.cssText = cssVars;
}

/**
 * Get current theme from element
 */
export function getTheme(element: HTMLElement): ThemeConfig {
  const style = getComputedStyle(element);
  return {
    primary: style.getPropertyValue('--auth-primary').trim() || DEFAULT_THEME.primary,
    background: style.getPropertyValue('--auth-background').trim() || DEFAULT_THEME.background,
    text: style.getPropertyValue('--auth-text').trim() || DEFAULT_THEME.text,
    error: style.getPropertyValue('--auth-error').trim() || DEFAULT_THEME.error,
    borderRadius: style.getPropertyValue('--auth-border-radius').trim() || DEFAULT_THEME.borderRadius,
    fontFamily: style.getPropertyValue('--auth-font-family').trim() || DEFAULT_THEME.fontFamily,
  };
}

/**
 * Adjust color opacity (helper for hover states)
 */
function adjustColorOpacity(color: string, opacity: number): string {
  // Simple hex to rgba conversion
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  return color;
}

/**
 * Theme class names
 */
export const themeClasses = {
  container: 'auth-container',
  form: 'auth-form',
  formGroup: 'auth-form-group',
  label: 'auth-label',
  labelRequired: 'auth-label-required',
  input: 'auth-input',
  inputError: 'auth-input-error',
  inputErrorMessage: 'auth-input-error-message',
  button: 'auth-button',
  buttonSecondary: 'auth-button-secondary',
  buttonDisabled: 'auth-button-disabled',
  error: 'auth-error',
  errorTitle: 'auth-error-title',
  errorMessage: 'auth-error-message',
  success: 'auth-success',
  link: 'auth-link',
  title: 'auth-title',
  subtitle: 'auth-subtitle',
  logo: 'auth-logo',
  footer: 'auth-footer',
  textCenter: 'auth-text-center',
};

export default {
  DEFAULT_THEME,
  generateThemeVariables,
  applyTheme,
  getTheme,
  themeClasses,
};
