/**
 * Stub App Entry Point
 * Local development testing harness for the login component
 */

import { applyTheme } from '../styles/theme';

// Initialize the stub app
function initStubApp() {
  console.log('[StubApp] Initializing login component test harness...');

  // Wait for custom element to be defined
  if (!customElements.get('auth-login')) {
    console.error('[StubApp] auth-login custom element not registered!');
    return;
  }

  // Create and mount the login component
  const container = document.getElementById('login-container');
  if (!container) {
    console.error('[StubApp] login-container not found!');
    return;
  }

  // Create auth-login element
  const loginElement = document.createElement('auth-login');
  loginElement.setAttribute('bff_url', 'http://localhost:3001');
  loginElement.setAttribute('tenant_slug', 'acme-corp');
  loginElement.setAttribute('redirect_url', '/dashboard');
  
  // Apply default theme
  applyTheme(loginElement, {
    primary: '#667eea',
    background: '#FFFFFF',
    text: '#333333',
    error: '#DC3545',
    borderRadius: '8px',
  });

  container.appendChild(loginElement);

  // Setup event listeners
  setupEventListeners();

  console.log('[StubApp] Login component mounted successfully');
}

/**
 * Setup event listeners for auth events
 */
function setupEventListeners() {
  const eventsLog = document.getElementById('events-log-content');
  
  function logEvent(eventName: string, detail: unknown) {
    if (!eventsLog) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = 'event-item';
    logEntry.textContent = `[${timestamp}] ${eventName}: ${JSON.stringify(detail)}`;
    
    eventsLog.insertBefore(logEntry, eventsLog.firstChild);
    
    // Keep only last 20 events
    while (eventsLog.children.length > 20) {
      eventsLog.removeChild(eventsLog.lastChild!);
    }
  }

  // Listen for auth events
  document.addEventListener('auth:login-success', (e: Event) => {
    const event = e as CustomEvent;
    console.log('[StubApp] Login success:', event.detail);
    logEvent('auth:login-success', event.detail);
    
    // Store token for later use
    if (event.detail.access_token) {
      localStorage.setItem('auth_access_token', event.detail.access_token);
    }
  });

  document.addEventListener('auth:login-error', (e: Event) => {
    const event = e as CustomEvent;
    console.warn('[StubApp] Login error:', event.detail);
    logEvent('auth:login-error', event.detail);
  });

  document.addEventListener('auth:logout', (e: Event) => {
    const event = e as CustomEvent;
    console.log('[StubApp] Logout:', event.detail);
    logEvent('auth:logout', event.detail);
    localStorage.removeItem('auth_access_token');
  });

  document.addEventListener('auth:token-refresh', (e: Event) => {
    const event = e as CustomEvent;
    console.log('[StubApp] Token refresh:', event.detail);
    logEvent('auth:token-refresh', event.detail);
  });

  document.addEventListener('auth:session-expired', () => {
    console.log('[StubApp] Session expired');
    logEvent('auth:session-expired', {});
    localStorage.removeItem('auth_access_token');
  });

  console.log('[StubApp] Event listeners registered');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStubApp);
} else {
  initStubApp();
}

// Export for module usage
export { initStubApp, setupEventListeners };
