/**
 * Base Styles for Login Component
 * Uses CSS variables for theming
 */

export const baseStyles = `
/* CSS Variables (set by theme) */
.auth-container {
  --auth-primary: #2E75B6;
  --auth-primary-hover: rgba(46, 117, 182, 0.9);
  --auth-background: #FFFFFF;
  --auth-text: #333333;
  --auth-text-secondary: rgba(51, 51, 51, 0.7);
  --auth-error: #DC3545;
  --auth-border-radius: 8px;
  --auth-font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --auth-border-color: #E0E0E0;
  --auth-input-background: #F8F9FA;
  --auth-success: #28A745;
  --auth-warning: #FFC107;
}

.auth-container {
  font-family: var(--auth-font-family);
  background: var(--auth-background);
  color: var(--auth-text);
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
}

/* Title */
.auth-title {
  font-size: 24px;
  font-weight: 600;
  text-align: center;
  margin-bottom: 8px;
  color: var(--auth-text);
}

.auth-subtitle {
  font-size: 14px;
  color: var(--auth-text-secondary);
  text-align: center;
  margin-bottom: 24px;
}

/* Logo */
.auth-logo {
  max-width: 120px;
  height: auto;
  margin: 0 auto 20px;
  display: block;
}

/* Form */
.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.auth-form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* Labels */
.auth-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--auth-text);
}

.auth-label-required::after {
  content: ' *';
  color: var(--auth-error);
}

/* Inputs */
.auth-input {
  width: 100%;
  padding: 12px 16px;
  font-size: 16px;
  font-family: inherit;
  border: 1px solid var(--auth-border-color);
  border-radius: var(--auth-border-radius);
  background: var(--auth-input-background);
  color: var(--auth-text);
  transition: border-color 0.2s, box-shadow 0.2s;
  box-sizing: border-box;
}

.auth-input:focus {
  outline: none;
  border-color: var(--auth-primary);
  box-shadow: 0 0 0 3px rgba(46, 117, 182, 0.1);
}

.auth-input::placeholder {
  color: var(--auth-text-secondary);
}

.auth-input-error {
  border-color: var(--auth-error);
}

.auth-input-error:focus {
  box-shadow: 0 0 0 3px rgba(220, 53, 69, 0.1);
}

/* Error message */
.auth-input-error-message {
  font-size: 12px;
  color: var(--auth-error);
  margin-top: 4px;
}

/* Buttons */
.auth-button {
  width: 100%;
  padding: 12px 24px;
  font-size: 16px;
  font-weight: 500;
  font-family: inherit;
  color: #FFFFFF;
  background: var(--auth-primary);
  border: none;
  border-radius: var(--auth-border-radius);
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
}

.auth-button:hover:not(:disabled) {
  background: var(--auth-primary-hover);
}

.auth-button:active:not(:disabled) {
  transform: scale(0.98);
}

.auth-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.auth-button-secondary {
  background: transparent;
  color: var(--auth-primary);
  border: 1px solid var(--auth-primary);
}

.auth-button-secondary:hover:not(:disabled) {
  background: rgba(46, 117, 182, 0.05);
}

/* Error display */
.auth-error {
  background: rgba(220, 53, 69, 0.1);
  border: 1px solid var(--auth-error);
  border-radius: var(--auth-border-radius);
  padding: 12px 16px;
  margin-bottom: 16px;
}

.auth-error-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--auth-error);
  margin-bottom: 4px;
}

.auth-error-message {
  font-size: 14px;
  color: var(--auth-text);
}

/* Success display */
.auth-success {
  background: rgba(40, 167, 69, 0.1);
  border: 1px solid var(--auth-success);
  border-radius: var(--auth-border-radius);
  padding: 12px 16px;
  margin-bottom: 16px;
  color: var(--auth-success);
  font-size: 14px;
}

/* Links */
.auth-link {
  color: var(--auth-primary);
  text-decoration: none;
  font-size: 14px;
  cursor: pointer;
  transition: color 0.2s;
}

.auth-link:hover {
  color: var(--auth-primary-hover);
  text-decoration: underline;
}

/* Footer */
.auth-footer {
  margin-top: 24px;
  text-align: center;
  font-size: 14px;
  color: var(--auth-text-secondary);
}

/* Loading spinner */
.auth-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: #FFFFFF;
  animation: auth-spin 0.8s linear infinite;
  margin-right: 8px;
  vertical-align: middle;
}

@keyframes auth-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Locked state */
.auth-locked {
  text-align: center;
  padding: 20px;
}

.auth-locked-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.auth-locked-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
}

.auth-locked-message {
  font-size: 14px;
  color: var(--auth-text-secondary);
  margin-bottom: 16px;
}

/* Utility */
.auth-hidden {
  display: none !important;
}

.auth-text-center {
  text-align: center;
}

.auth-mt-16 {
  margin-top: 16px;
}

.auth-mb-16 {
  margin-bottom: 16px;
}
`;

export default baseStyles;
