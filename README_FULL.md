# 🔌 Full CRUD Integration Guide - SaaS Authentication API

**Version:** 1.0.0  
**Last Updated:** March 10, 2026  
**Purpose:** Complete API integration guide for UI team to build custom interfaces

> **⚠️ IMPORTANT:** This guide is for developers who want to integrate the authentication system into their **own applications**. All operations must go through the API routes - **NO direct database access**.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [API Base URL](#api-base-url)
3. [Authentication Flow](#authentication-flow)
4. [Tenant CRUD Operations](#tenant-crud-operations)
5. [User CRUD Operations](#user-crud-operations)
6. [License Management](#license-management)
7. [Error Handling](#error-handling)
8. [Code Examples](#code-examples)
9. [Best Practices](#best-practices)

---

## 📖 Overview

### What You Can Do

**Operator Level:**
- ✅ Create new tenants
- ✅ List all tenants (platform-wide)
- ✅ Get tenant details
- ✅ Update tenant (name, slug, max_users, status)
- ✅ Suspend/activate tenants
- ✅ Cancel (delete) tenants

**Admin Level (within tenant):**
- ✅ List users in tenant
- ✅ Get user details
- ✅ Create new users (up to license limit)
- ✅ Update user (email, role, status)
- ✅ Disable users

### What You CANNOT Do

- ❌ Direct database access
- ❌ Bypass authentication
- ❌ Create users beyond license limit
- ❌ Access other tenant's data
- ❌ Modify audit logs

---

## 🌐 API Base URL

### Local Development
```
http://localhost:3001
```

### Production (Example)
```
https://auth.yoursaas.com
```

### Environment Variable
```javascript
// config.js
const API_BASE_URL = process.env.REACT_APP_AUTH_URL || 'http://localhost:3001';
```

---

## 🔐 Authentication Flow

### Step 1: Login

```javascript
async function login(email, password, tenantSlug) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Important for refresh token cookie
    body: JSON.stringify({
      email: email,
      password: password,
      tenant_slug: tenantSlug
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  const data = await response.json();
  
  // Store access token
  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('user', JSON.stringify(data.user));
  
  return data;
}

// Usage
try {
  const result = await login(
    'operator@yoursaas.com',
    'Operator@Secure123!',
    'system'
  );
  console.log('Logged in as:', result.user.role);
} catch (error) {
  console.error('Login failed:', error.message);
}
```

### Step 2: Use Token in API Calls

```javascript
async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('access_token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Add authorization header
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  // Handle token expiration
  if (response.status === 401) {
    // Try to refresh token
    const refreshed = await refreshToken();
    if (refreshed) {
      // Retry original request
      return apiRequest(endpoint, options);
    } else {
      // Redirect to login
      window.location.href = '/login';
    }
  }

  return response;
}
```

### Step 3: Refresh Token

```javascript
async function refreshToken() {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include', // Sends refresh token cookie
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    const data = await response.json();
    
    // Store new access token
    localStorage.setItem('access_token', data.access_token);
    
    return true;
  } catch (error) {
    console.error('Refresh failed:', error);
    return false;
  }
}
```

### Step 4: Logout

```javascript
async function logout() {
  const token = localStorage.getItem('access_token');
  
  await fetch(`${API_BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    credentials: 'include',
  });

  // Clear local storage
  localStorage.removeItem('access_token');
  localStorage.removeItem('user');
  
  // Redirect to login
  window.location.href = '/login';
}
```

---

## 🏢 Tenant CRUD Operations

**Required Role:** `operator`

### Create Tenant

```javascript
async function createTenant(name, slug, maxUsers = 5) {
  const response = await apiRequest('/operator/tenants', {
    method: 'POST',
    body: JSON.stringify({
      name: name,
      slug: slug,
      maxUsers: maxUsers
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  return await response.json();
}

// Usage
try {
  const result = await createTenant(
    'New Customer Corp',
    'new-customer-corp',
    10
  );
  console.log('Tenant created:', result.tenant);
} catch (error) {
  console.error('Create failed:', error.message);
}
```

**Expected Response (201 Created):**
```json
{
  "message": "Tenant created successfully",
  "tenant": {
    "id": "uuid",
    "name": "New Customer Corp",
    "slug": "new-customer-corp",
    "status": "active",
    "maxUsers": 10,
    "createdAt": "2026-03-10T..."
  }
}
```

---

### List All Tenants

```javascript
async function listTenants() {
  const response = await apiRequest('/operator/tenants');
  
  if (!response.ok) {
    throw new Error('Failed to fetch tenants');
  }

  return await response.json();
}

// Usage
try {
  const result = await listTenants();
  console.log('Total tenants:', result.total);
  result.tenants.forEach(tenant => {
    console.log(`- ${tenant.name} (${tenant.slug}): ${tenant.activeUsers}/${tenant.maxUsers} users`);
  });
} catch (error) {
  console.error('List failed:', error.message);
}
```

**Expected Response (200 OK):**
```json
{
  "tenants": [
    {
      "id": "uuid",
      "name": "Acme Corporation",
      "slug": "acme-corp",
      "status": "active",
      "maxUsers": 5,
      "activeUsers": 4,
      "availableSlots": 1,
      "createdAt": "2026-03-10T...",
      "updatedAt": "2026-03-10T..."
    }
  ],
  "total": 2
}
```

---

### Get Tenant Details

```javascript
async function getTenant(tenantId) {
  const response = await apiRequest(`/operator/tenants/${tenantId}`);
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  return await response.json();
}

// Usage
try {
  const tenant = await getTenant('tenant-uuid-here');
  console.log('Tenant:', tenant.name);
  console.log('Users:', tenant.users);
  console.log('License:', `${tenant.activeUsers}/${tenant.maxUsers}`);
} catch (error) {
  console.error('Get failed:', error.message);
}
```

---

### Update Tenant

```javascript
async function updateTenant(tenantId, updates) {
  const response = await apiRequest(`/operator/tenants/${tenantId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  return await response.json();
}

// Usage Examples

// Update max users
await updateTenant('tenant-uuid', { maxUsers: 15 });

// Update name
await updateTenant('tenant-uuid', { name: 'New Name Inc' });

// Update slug
await updateTenant('tenant-uuid', { slug: 'new-slug' });

// Suspend tenant
await updateTenant('tenant-uuid', { status: 'suspended' });

// Activate tenant
await updateTenant('tenant-uuid', { status: 'active' });
```

**Expected Response (200 OK):**
```json
{
  "message": "Tenant updated successfully",
  "tenant": {
    "id": "uuid",
    "name": "New Name Inc",
    "slug": "new-slug",
    "status": "active",
    "maxUsers": 15,
    "updatedAt": "2026-03-10T..."
  }
}
```

---

### Suspend Tenant

```javascript
async function suspendTenant(tenantId) {
  const response = await apiRequest(`/operator/tenants/${tenantId}/suspend`, {
    method: 'POST'
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  return await response.json();
}

// Usage
try {
  await suspendTenant('tenant-uuid');
  console.log('Tenant suspended');
} catch (error) {
  console.error('Suspend failed:', error.message);
}
```

---

### Activate Tenant

```javascript
async function activateTenant(tenantId) {
  const response = await apiRequest(`/operator/tenants/${tenantId}/activate`, {
    method: 'POST'
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  return await response.json();
}

// Usage
try {
  await activateTenant('tenant-uuid');
  console.log('Tenant activated');
} catch (error) {
  console.error('Activate failed:', error.message);
}
```

---

### Cancel (Delete) Tenant

```javascript
async function cancelTenant(tenantId) {
  const response = await apiRequest(`/operator/tenants/${tenantId}`, {
    method: 'DELETE'
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  return await response.json();
}

// Usage
try {
  await cancelTenant('tenant-uuid');
  console.log('Tenant cancelled');
} catch (error) {
  console.error('Cancel failed:', error.message);
}
```

**Note:** This is a soft delete. Tenant status becomes 'cancelled'.

---

## 👥 User CRUD Operations

**Required Role:** `admin` or `operator` (within their tenant)

### Create User

```javascript
async function createUser(email, password, role = 'user') {
  const response = await apiRequest('/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: email,
      password: password,
      role: role
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  return await response.json();
}

// Usage
try {
  const result = await createUser(
    'newuser@acme.com',
    'NewUser@Secure123!',
    'user'
  );
  console.log('User created:', result.user);
} catch (error) {
  console.error('Create failed:', error.message);
  
  // Handle license limit
  if (error.message.includes('limit')) {
    console.log('License limit reached! Need to upgrade plan.');
  }
}
```

**Password Requirements:**
- Minimum 10 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 digit
- At least 1 special character

---

### List Users

```javascript
async function listUsers() {
  const response = await apiRequest('/admin/users');
  
  if (!response.ok) {
    throw new Error('Failed to fetch users');
  }

  return await response.json();
}

// Usage
try {
  const result = await listUsers();
  console.log('Total users:', result.total);
  console.log('License:', result.license);
  
  result.users.forEach(user => {
    console.log(`- ${user.email} (${user.role}) - ${user.status}`);
  });
} catch (error) {
  console.error('List failed:', error.message);
}
```

---

### Get User

```javascript
async function getUser(userId) {
  const response = await apiRequest(`/admin/users/${userId}`);
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  return await response.json();
}

// Usage
try {
  const user = await getUser('user-uuid');
  console.log('User:', user.email);
  console.log('Role:', user.role);
  console.log 'Status:', user.status);
} catch (error) {
  console.error('Get failed:', error.message);
}
```

---

### Update User

```javascript
async function updateUser(userId, updates) {
  const response = await apiRequest(`/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  return await response.json();
}

// Usage Examples

// Change role
await updateUser('user-uuid', { role: 'admin' });

// Change email
await updateUser('user-uuid', { email: 'newemail@acme.com' });

// Disable user
await updateUser('user-uuid', { status: 'disabled' });

// Reactivate user
await updateUser('user-uuid', { status: 'active' });
```

---

### Disable User

```javascript
async function disableUser(userId) {
  const response = await apiRequest(`/admin/users/${userId}`, {
    method: 'DELETE'
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  return await response.json();
}

// Usage
try {
  await disableUser('user-uuid');
  console.log('User disabled');
} catch (error) {
  console.error('Disable failed:', error.message);
}
```

---

## 📊 License Management

### Check License Usage

```javascript
async function getLicenseUsage() {
  const response = await apiRequest('/admin/license');
  
  if (!response.ok) {
    throw new Error('Failed to fetch license');
  }

  return await response.json();
}

// Usage
try {
  const license = await getLicenseUsage();
  console.log('License:', license.license);
  
  const { max_users, active_users, available_slots } = license.license;
  console.log(`Using ${active_users} of ${max_users} slots`);
  console.log(`${available_slots} slots available`);
} catch (error) {
  console.error('License check failed:', error.message);
}
```

---

### Handle License Limit

```javascript
async function createUserWithLicenseCheck(email, password, role) {
  // Check license first
  const license = await getLicenseUsage();
  
  if (license.license.available_slots === 0) {
    throw new Error('License limit reached. Cannot create more users.');
  }
  
  // Create user
  return await createUser(email, password, role);
}

// Usage
try {
  await createUserWithLicenseCheck('new@acme.com', 'Password@123!', 'user');
  console.log('User created successfully');
} catch (error) {
  console.error('Failed:', error.message);
  // Show upgrade prompt to user
}
```

---

## ⚠️ Error Handling

### Standard Error Response

```javascript
{
  "code": "ERROR_CODE",
  "message": "Human-readable message",
  "details": { ... } // Optional
}
```

### Common Error Codes

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `MISSING_TOKEN` | 401 | No authorization header |
| `TOKEN_INVALID` | 401 | Expired or invalid token |
| `INVALID_CREDENTIALS` | 401 | Wrong email/password |
| `ACCOUNT_DISABLED` | 403 | User account disabled |
| `ACCOUNT_LOCKED` | 403 | Too many failed attempts |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `TENANT_NOT_FOUND` | 404 | Invalid tenant slug |
| `USER_NOT_FOUND` | 404 | User doesn't exist |
| `EMAIL_ALREADY_EXISTS` | 409 | Duplicate email |
| `SLUG_ALREADY_EXISTS` | 409 | Duplicate tenant slug |
| `LICENSE_LIMIT_REACHED` | 402 | Max users exceeded |
| `PASSWORD_POLICY_VIOLATION` | 400 | Weak password |
| `VALIDATION_ERROR` | 400 | Invalid request data |

### Error Handler Function

```javascript
async function handleApiCall(apiFunction, ...args) {
  try {
    return await apiFunction(...args);
  } catch (error) {
    // API errors
    if (error.code === 'LICENSE_LIMIT_REACHED') {
      alert('License limit reached! Please upgrade your plan.');
    } else if (error.code === 'ACCOUNT_LOCKED') {
      alert('Account locked. Please try again in 15 minutes.');
    } else if (error.code === 'PASSWORD_POLICY_VIOLATION') {
      alert('Password must be 10+ characters with uppercase, lowercase, digit, and special character.');
    } else if (error.code === 'EMAIL_ALREADY_EXISTS') {
      alert('This email is already registered.');
    } else {
      alert('Error: ' + error.message);
    }
    throw error;
  }
}
```

---

## 💻 Code Examples

### React Hook Example

```javascript
// hooks/useTenantAPI.js
import { useState, useCallback } from 'react';

export function useTenantAPI() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const createTenant = useCallback(async (name, slug, maxUsers) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('http://localhost:3001/operator/tenants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        credentials: 'include',
        body: JSON.stringify({ name, slug, maxUsers })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message);
      }
      
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    createTenant,
    loading,
    error
  };
}
```

### Vue Composable Example

```javascript
// composables/useUserAPI.js
import { ref } from 'vue';

export function useUserAPI() {
  const loading = ref(false);
  const error = ref(null);

  const createUser = async (email, password, role) => {
    loading.value = true;
    error.value = null;
    
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch('http://localhost:3001/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({ email, password, role })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message);
      }
      
      return data;
    } catch (err) {
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  };

  return {
    loading,
    error,
    createUser
  };
}
```

### Angular Service Example

```typescript
// services/tenant.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TenantService {
  private apiUrl = 'http://localhost:3001/operator';

  constructor(private http: HttpClient) {}

  private getAuthHeaders() {
    const token = localStorage.getItem('access_token');
    return {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      withCredentials: true
    };
  }

  createTenant(name: string, slug: string, maxUsers: number): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/tenants`,
      { name, slug, maxUsers },
      this.getAuthHeaders()
    );
  }

  listTenants(): Observable<any> {
    return this.http.get(
      `${this.apiUrl}/tenants`,
      this.getAuthHeaders()
    );
  }
}
```

---

## ✅ Best Practices

### 1. Always Use HTTPS in Production

```javascript
const API_BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://auth.yoursaas.com'
  : 'http://localhost:3001';
```

### 2. Store Tokens Securely

```javascript
// ✅ Good: Use localStorage for access token
localStorage.setItem('access_token', token);

// ✅ Good: Refresh token is in HttpOnly cookie (automatic)

// ❌ Bad: Don't store passwords
// localStorage.setItem('password', password); // NEVER!
```

### 3. Handle Token Expiration

```javascript
// Set up automatic token refresh
setInterval(async () => {
  try {
    await refreshToken();
  } catch (error) {
    // Redirect to login
    window.location.href = '/login';
  }
}, 10 * 60 * 1000); // Refresh every 10 minutes
```

### 4. Validate Before API Calls

```javascript
async function createUser(email, password) {
  // Client-side validation first
  if (!email || !email.includes('@')) {
    throw new Error('Invalid email');
  }
  
  if (password.length < 10) {
    throw new Error('Password too short');
  }
  
  // Then call API
  return await apiRequest('/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}
```

### 5. Show Loading States

```javascript
const [loading, setLoading] = useState(false);

async function handleSubmit() {
  setLoading(true);
  try {
    await createUser(email, password);
  } finally {
    setLoading(false);
  }
}

return (
  <button disabled={loading}>
    {loading ? 'Creating...' : 'Create User'}
  </button>
);
```

### 6. Log Out on 401

```javascript
if (response.status === 401) {
  localStorage.removeItem('access_token');
  localStorage.removeItem('user');
  window.location.href = '/login';
}
```

### 7. Use Environment Variables

```javascript
// .env
REACT_APP_AUTH_URL=http://localhost:3001

// config.js
export const API_BASE_URL = process.env.REACT_APP_AUTH_URL;
```

---

## 📊 Complete Integration Checklist

### Setup
- [ ] Clone repository
- [ ] Install dependencies
- [ ] Start infrastructure (Docker)
- [ ] Seed database
- [ ] Start auth server

### Authentication
- [ ] Implement login form
- [ ] Store access token
- [ ] Handle refresh token (automatic via cookie)
- [ ] Implement logout
- [ ] Handle token expiration

### Tenant CRUD (Operator)
- [ ] Create tenant form
- [ ] List tenants table
- [ ] View tenant details
- [ ] Edit tenant (name, slug, max_users)
- [ ] Suspend/activate tenant
- [ ] Cancel tenant

### User CRUD (Admin)
- [ ] Create user form
- [ ] List users table
- [ ] View user details
- [ ] Edit user (email, role, status)
- [ ] Disable user
- [ ] Check license limit

### Error Handling
- [ ] Display error messages
- [ ] Handle 401 (unauthorized)
- [ ] Handle 403 (forbidden)
- [ ] Handle 404 (not found)
- [ ] Handle 409 (conflict)
- [ ] Handle 402 (license limit)
- [ ] Handle network errors

### UI/UX
- [ ] Show loading states
- [ ] Show success messages
- [ ] Form validation
- [ ] Confirm destructive actions
- [ ] Responsive design

---

## 🔗 API Reference

### Base URLs

| Environment | URL |
|-------------|-----|
| Local | http://localhost:3001 |
| Production | https://auth.yoursaas.com |

### Endpoints Summary

| Method | Endpoint | Auth | Role | Purpose |
|--------|----------|------|------|---------|
| POST | /auth/login | No | - | Login |
| POST | /auth/logout | Yes | Any | Logout |
| POST | /auth/refresh | No | Any | Refresh token |
| GET | /operator/tenants | Yes | Operator | List tenants |
| POST | /operator/tenants | Yes | Operator | Create tenant |
| PATCH | /operator/tenants/:id | Yes | Operator | Update tenant |
| DELETE | /operator/tenants/:id | Yes | Operator | Cancel tenant |
| GET | /admin/users | Yes | Admin | List users |
| POST | /admin/users | Yes | Admin | Create user |
| PATCH | /admin/users/:id | Yes | Admin | Update user |
| DELETE | /admin/users/:id | Yes | Admin | Disable user |

---

## 📧 Support

For questions or issues:
- Check error messages in API responses
- Review this guide's error handling section
- Contact the backend team

---

**Jai Jagannath!** 🙏

**Happy Integrating!**
