# SaaS Login UI Component

**Version:** 1.0.0  
**Description:** Embeddable React login web component for SaaS multi-tenant authentication

---

## Features

- ✅ **React 18** with TypeScript
- ✅ **State Machine** (useReducer pattern)
- ✅ **Web Component** (Custom Element) for embedding
- ✅ **Theme System** for white-labelling
- ✅ **CustomEvent** emissions for host app integration
- ✅ **Responsive Design** with CSS variables
- ✅ **Accessibility** (ARIA labels, keyboard navigation)

---

## Installation

```bash
npm install
```

---

## Development

### Start Dev Server

```bash
npm run dev
```

Opens at http://localhost:5173

### Build for Production

```bash
npm run build
```

Output: `dist/` folder

### Watch Mode

```bash
npm run build:watch
```

---

## Usage

### As Web Component (Recommended)

```html
<!DOCTYPE html>
<html>
<head>
  <script src="dist/auth-login.js"></script>
</head>
<body>
  <auth-login
    bff_url="https://auth.yoursaas.com"
    tenant_slug="acme-corp"
    redirect_url="/dashboard"
    logo_url="https://cdn.acme.com/logo.png"
    theme_primary="#2E75B6"
  ></auth-login>

  <script>
    // Listen for auth events
    document.addEventListener('auth:login-success', (e) => {
      console.log('Login success:', e.detail);
      // e.detail = { user, access_token }
    });

    document.addEventListener('auth:login-error', (e) => {
      console.error('Login error:', e.detail);
      // e.detail = { code, message }
    });
  </script>
</body>
</html>
```

### As React Component

```tsx
import { LoginComponent } from '@saas-auth/login-ui';

function App() {
  return (
    <LoginComponent
      bffUrl="https://auth.yoursaas.com"
      tenantSlug="acme-corp"
      redirectUrl="/dashboard"
      theme={{
        primary: '#2E75B6',
        borderRadius: '8px',
      }}
      onLoginSuccess={(response) => {
        console.log('Logged in:', response.user);
        localStorage.setItem('token', response.access_token);
      }}
      onLoginError={(error) => {
        console.error('Login failed:', error.message);
      }}
    />
  );
}
```

---

## Attributes (Web Component)

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `bff_url` | string | `http://localhost:3001` | Auth BFF API URL |
| `tenant_slug` | string | `system` | Tenant identifier |
| `redirect_url` | string | — | Redirect after login |
| `logo_url` | string | — | Logo image URL |
| `reset_token` | string | — | Password reset token |
| `theme_primary` | string | `#2E75B6` | Primary brand color |
| `theme_background` | string | `#FFFFFF` | Background color |
| `theme_text` | string | `#333333` | Text color |
| `theme_error` | string | `#DC3545` | Error color |
| `theme_border_radius` | string | `8px` | Border radius |

---

## Events

### auth:login-success

```javascript
{
  user: {
    id: string,
    email: string,
    role: string,
    tenant_id: string,
    tenant_name: string
  },
  access_token: string
}
```

### auth:login-error

```javascript
{
  code: string,
  message: string
}
```

### auth:logout

```javascript
{
  loggedOut: true
}
```

### auth:token-refresh

```javascript
{
  access_token: string,
  expires_in: number
}
```

---

## Theme Configuration

### Default Theme

```typescript
{
  primary: '#2E75B6',      // Professional blue
  background: '#FFFFFF',   // White
  text: '#333333',         // Dark gray
  error: '#DC3545',        // Red
  borderRadius: '8px',     // 8px radius
}
```

### Custom Theme

```html
<auth-login
  theme_primary="#667eea"
  theme_background="#1a1a2e"
  theme_text="#ffffff"
  theme_error="#ff6b6b"
  theme_border_radius="12px"
></auth-login>
```

---

## Test Accounts (Local Development)

| Email | Password | Tenant | Role |
|-------|----------|--------|------|
| admin@acme.com | Admin@Acme123! | acme-corp | admin |
| alice@acme.com | User@Acme123! | acme-corp | user |
| disabled@acme.com | User@Acme123! | acme-corp | disabled |

---

## API Integration

The component integrates with the Auth BFF service:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/auth/login` | POST | User authentication |
| `/auth/forgot-password` | POST | Password reset request |
| `/auth/reset-password` | POST | Password reset completion |
| `/auth/logout` | POST | Session termination |
| `/auth/me` | GET | Current user profile |

---

## Architecture

### State Machine

```
IDLE → SUBMITTING → SUCCESS → REDIRECTING
                 → ERROR → IDLE
                 → LOCKED → IDLE

IDLE → FORGOT_PASSWORD → SUBMITTING → OTP_SENT → RESET_SUCCESS → IDLE
```

### Component Structure

```
LoginComponent (orchestrator)
├── LoginForm
├── ForgotPassword
└── ResetPassword

Web Component Wrapper
└── AuthLoginElement (Custom Element)
    └── LoginComponent (React)
```

---

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

---

## License

UNLICENSED - Internal Use Only

---

**Jai Jagannath!** 🙏
