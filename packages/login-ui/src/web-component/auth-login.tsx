/**
 * Auth Login Web Component
 * Custom Element wrapper for the React login component
 * Architecture Spec Section 7.3
 */

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { LoginComponent } from '../components/LoginComponent';
import { ThemeConfig, AUTH_EVENTS } from '../types';
import { baseStyles } from '../styles';

// Observed attributes for the custom element
const OBSERVED_ATTRIBUTES = [
  'bff_url',
  'tenant_slug',
  'redirect_url',
  'logo_url',
  'theme_primary',
  'theme_background',
  'theme_text',
  'theme_error',
  'theme_border_radius',
  'reset_token',
];

/**
 * AuthLogin Custom Element
 * 
 * Usage:
 * <auth-login
 *   bff_url="https://auth.yoursaas.com"
 *   tenant_slug="acme-corp"
 *   redirect_url="/dashboard"
 *   logo_url="https://cdn.acme.com/logo.png"
 *   theme_primary="#2E75B6"
 * ></auth-login>
 */
export class AuthLoginElement extends HTMLElement {
  private root: Root | null = null;
  private shadow: ShadowRoot;
  private styleElement: HTMLStyleElement;

  constructor() {
    super();
    
    // Attach shadow DOM
    this.shadow = this.attachShadow({ mode: 'open' });
    
    // Create style element
    this.styleElement = document.createElement('style');
    this.styleElement.textContent = baseStyles;
    this.shadow.appendChild(this.styleElement);
    
    // Create container
    const container = document.createElement('div');
    container.id = 'auth-login-root';
    this.shadow.appendChild(container);
  }

  /**
   * Called when element is connected to DOM
   */
  connectedCallback() {
    this.render();
    this.emitEvent('auth:component-mounted', { mounted: true });
  }

  /**
   * Called when element is disconnected from DOM
   */
  disconnectedCallback() {
    // Cleanup React root
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
    this.emitEvent('auth:component-unmounted', { unmounted: true });
  }

  /**
   * Called when observed attributes change
   */
  attributeChangedCallback(
    _name: string,
    oldValue: string | null,
    newValue: string | null
  ) {
    if (oldValue !== newValue) {
      this.render();
    }
  }

  /**
   * Get observed attributes
   */
  static get observedAttributes(): string[] {
    return OBSERVED_ATTRIBUTES;
  }

  /**
   * Get attribute values with defaults
   */
  private getProps() {
    const getThemeColor = (attr: string, defaultColor: string): string => {
      const value = this.getAttribute(attr);
      return value || defaultColor;
    };

    return {
      bffUrl: this.getAttribute('bff_url') || 'http://localhost:3001',
      tenantSlug: this.getAttribute('tenant_slug') || 'system',
      redirectUrl: this.getAttribute('redirect_url') || undefined,
      logoUrl: this.getAttribute('logo_url') || undefined,
      resetToken: this.getAttribute('reset_token') || undefined,
      theme: {
        primary: getThemeColor('theme_primary', '#2E75B6'),
        background: getThemeColor('theme_background', '#FFFFFF'),
        text: getThemeColor('theme_text', '#333333'),
        error: getThemeColor('theme_error', '#DC3545'),
        borderRadius: getThemeColor('theme_border_radius', '8px'),
      } as ThemeConfig,
    };
  }

  /**
   * Render the React component
   */
  private render() {
    const container = this.shadow.getElementById('auth-login-root');
    if (!container) return;

    const props = this.getProps();

    // Create or get React root
    if (!this.root) {
      this.root = createRoot(container);
    }

    // Handle login success
    const handleLoginSuccess = (response: { access_token: string; user: unknown }) => {
      this.emitEvent(AUTH_EVENTS.LOGIN_SUCCESS, {
        user: response.user,
        access_token: response.access_token,
      });

      // Redirect if specified
      if (props.redirectUrl) {
        window.location.href = props.redirectUrl;
      }
    };

    // Handle login error
    const handleLoginError = (error: { code: string; message: string }) => {
      this.emitEvent(AUTH_EVENTS.LOGIN_ERROR, {
        code: error.code,
        message: error.message,
      });
    };

    // Render React component
    this.root.render(
      <React.StrictMode>
        <LoginComponent
          bffUrl={props.bffUrl}
          tenantSlug={props.tenantSlug}
          redirectUrl={props.redirectUrl}
          theme={props.theme}
          logoUrl={props.logoUrl}
          resetToken={props.resetToken}
          onLoginSuccess={handleLoginSuccess}
          onLoginError={handleLoginError}
        />
      </React.StrictMode>
    );
  }

  /**
   * Emit custom event
   */
  private emitEvent(eventName: string, detail: unknown) {
    const event = new CustomEvent(eventName, {
      detail,
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
    
    // Also emit on document for global listening
    document.dispatchEvent(event);
    
    // Log in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[AuthLogin] Event: ${eventName}`, detail);
    }
  }

  /**
   * Public method: Trigger logout
   */
  public async logout(): Promise<void> {
    const accessToken = this.getAccessToken();
    if (accessToken) {
      try {
        await fetch(`${this.getAttribute('bff_url')}/auth/logout`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          credentials: 'include',
        });
        
        this.emitEvent(AUTH_EVENTS.LOGOUT, { loggedOut: true });
      } catch (error) {
        console.error('Logout failed:', error);
      }
    }
  }

  /**
   * Public method: Get current access token from storage
   */
  private getAccessToken(): string | null {
    // Token would typically be stored by the host app
    return localStorage.getItem('auth_access_token');
  }

  /**
   * Public method: Update theme dynamically
   */
  public updateTheme(theme: Partial<ThemeConfig>): void {
    const currentTheme = this.getProps().theme;
    const newTheme = { ...currentTheme, ...theme };
    
    this.setAttribute('theme_primary', newTheme.primary || '#2E75B6');
    this.setAttribute('theme_background', newTheme.background || '#FFFFFF');
    this.setAttribute('theme_text', newTheme.text || '#333333');
    this.setAttribute('theme_error', newTheme.error || '#DC3545');
    
    this.render();
  }
}

// Register the custom element
if (typeof window !== 'undefined') {
  customElements.define('auth-login', AuthLoginElement);
}

export default AuthLoginElement;
