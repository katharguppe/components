# 🧪 Complete Testing Guide - SaaS Multi-Tenant Authentication

**Version:** 1.0.0  
**Last Updated:** March 10, 2026  
**Purpose:** Step-by-step manual testing instructions for all features

> **📝 Note for UI Team:** This guide works on any laptop! Just clone the repo to any location - the paths are relative. No need to match any specific directory structure.

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Test Accounts](#test-accounts)
4. [API Testing](#api-testing)
5. [Admin Operations](#admin-operations)
6. [Operator Operations](#operator-operations)
7. [UI Component Testing](#ui-component-testing)
8. [Security Testing](#security-testing)
9. [Troubleshooting](#troubleshooting)

---

## 🛠️ Prerequisites

### Required Software
- ✅ Node.js 20+ (`node --version`)
- ✅ npm 10+ (`npm --version`)
- ✅ Docker Desktop (for PostgreSQL and Mailhog)
- ✅ Git

### Verify Installation
```bash
node --version    # Should show v20.x.x
npm --version     # Should show v10.x.x
docker --version  # Should show Docker version 20+
```

---

## 🚀 Quick Start

### Step 1: Clone Repository

```bash
# Clone the repository (any location is fine)
git clone https://github.com/katharguppe/components.git

# Navigate to project (use your actual path)
cd components/saas-auth
# OR
cd <your-path>/components/saas-auth
```

### Step 2: Install Dependencies

```bash
# Install all dependencies
npm install
```

### Step 3: Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env if needed (defaults work for local testing)
# Most developers don't need to change anything
```

### Step 4: Start Infrastructure

```bash
# Start PostgreSQL and Mailhog containers
npm run docker:up

# Verify containers are running
docker compose ps
```

**Expected Output:**
```
NAME                       STATUS
saas-auth-postgres         Up (healthy)
saas-auth-mailhog          Up
```

### Step 5: Setup Database

```bash
# Run migrations
npm run db:migrate

# Seed test data
npm run db:seed
```

### Step 6: Start Auth BFF Server

```bash
# Start the authentication server
cd packages/auth-bff
npm run dev
```

**Expected Output:**
```
🚀 Auth BFF service running on port 3001
📝 Environment: development
🔗 Health check: http://localhost:3001/health
```

### Step 7: Start Login UI (Optional)

```bash
# In a new terminal
cd packages/login-ui
npm run dev
```

**Opens at:** http://localhost:5173

---

## 💻 Platform-Specific Commands

### Windows (PowerShell/CMD)
```powershell
# Copy environment file
copy .env.example .env

# Start server (PowerShell)
cd packages\auth-bff
npm run dev
```

### Mac/Linux (Bash/Zsh)
```bash
# Copy environment file
cp .env.example .env

# Start server
cd packages/auth-bff
npm run dev
```

### Windows (Git Bash)
```bash
# Same as Mac/Linux commands
cp .env.example .env
cd packages/auth-bff
npm run dev
```

---

## 👥 Test Accounts

All accounts are created by the seed script. Passwords meet the policy requirements (10+ chars, uppercase, lowercase, digit, special char).

### Platform Level

| Role | Email | Password | Tenant | Capabilities |
|------|-------|----------|--------|--------------|
| **Operator** | operator@yoursaas.com | Operator@Secure123! | system | Create/update/delete tenants, view all tenants |

### Acme Corporation (acme-corp) - Max 5 Users

| Role | Email | Password | Status |
|------|-------|----------|--------|
| **Admin** | admin@acme.com | Admin@Acme123! | Active |
| **User** | alice@acme.com | User@Acme123! | Active |
| **User** | bob@acme.com | User@Acme123! | Active |
| **User** | disabled@acme.com | User@Acme123! | **Disabled** |

### Beta Organization (beta-org) - Max 3 Users

| Role | Email | Password | Status |
|------|-------|----------|--------|
| **Admin** | admin@betaorg.com | Admin@Beta123! | Active |
| **User** | carol@betaorg.com | User@Beta123! | Active |

---

## 🔬 API Testing

### Tool Options

Choose one:
- **cURL** (command line) - Examples below
- **Postman** (GUI) - Import requests from examples
- **Thunder Client** (VS Code extension)

---

### Test 1: Health Check ✅

```bash
curl -X GET http://localhost:3001/health
```

**Expected Response (200 OK):**
```json
{
  "status": "ok",
  "db": "connected",
  "version": "1.0.0",
  "timestamp": "2026-03-10T..."
}
```

---

### Test 2: Login - Success ✅

```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d "{\"email\":\"admin@acme.com\",\"password\":\"Admin@Acme123!\",\"tenant_slug\":\"acme-corp\"}"
```

**Expected Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 900,
  "user": {
    "id": "...",
    "email": "admin@acme.com",
    "role": "admin",
    "tenant_id": "...",
    "tenant_name": "Acme Corporation"
  }
}
```

**Action:** Save the `access_token` for subsequent tests.

---

### Test 3: Login - Invalid Credentials ✅

```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@acme.com\",\"password\":\"wrongpassword\",\"tenant_slug\":\"acme-corp\"}"
```

**Expected Response (401 Unauthorized):**
```json
{
  "code": "INVALID_CREDENTIALS",
  "message": "Invalid email or password",
  "attempts_remaining": 4
}
```

---

### Test 4: Login - Disabled Account ✅

```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"disabled@acme.com\",\"password\":\"User@Acme123!\",\"tenant_slug\":\"acme-corp\"}"
```

**Expected Response (403 Forbidden):**
```json
{
  "code": "ACCOUNT_DISABLED",
  "message": "This account has been disabled"
}
```

---

### Test 5: Get Current User ✅

```bash
# Replace YOUR_ACCESS_TOKEN with token from Test 2
curl -X GET http://localhost:3001/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected Response (200 OK):**
```json
{
  "id": "...",
  "email": "admin@acme.com",
  "role": "admin",
  "status": "active",
  "tenant": {
    "id": "...",
    "name": "Acme Corporation",
    "slug": "acme-corp"
  },
  "last_login_at": "...",
  "created_at": "..."
}
```

---

### Test 6: Refresh Token ✅

```bash
# Uses cookies from login
curl -X POST http://localhost:3001/auth/refresh \
  -b cookies.txt \
  -c cookies.txt
```

**Expected Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

---

### Test 7: Forgot Password ✅

```bash
curl -X POST http://localhost:3001/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@acme.com\",\"tenant_slug\":\"acme-corp\"}"
```

**Expected Response (200 OK):**
```json
{
  "message": "Password reset token generated",
  "reset_token": "abc123..."
}
```

**Note:** In development mode, the token is returned. In production, it's sent via email.

---

### Test 8: Reset Password ✅

```bash
# Use reset_token from Test 7
curl -X POST http://localhost:3001/auth/reset-password \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"YOUR_RESET_TOKEN\",\"password\":\"NewSecure@Pass123!\"}"
```

**Expected Response (200 OK):**
```json
{
  "message": "Password has been reset successfully"
}
```

**Verification:** Login with new password.

---

## 👨‍💼 Admin Operations

**Prerequisites:**
- Login as admin (admin@acme.com)
- Save access token

---

### Admin Test 1: List All Users in Tenant ✅

```bash
curl -X GET http://localhost:3001/admin/users \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Expected Response (200 OK):**
```json
{
  "users": [
    {
      "id": "...",
      "email": "admin@acme.com",
      "role": "admin",
      "status": "active",
      "lastLoginAt": "...",
      "createdAt": "..."
    },
    {
      "id": "...",
      "email": "alice@acme.com",
      "role": "user",
      "status": "active",
      ...
    }
  ],
  "total": 4,
  "license": {
    "max_users": 5,
    "active_users": 3,
    "remaining": 2,
    "usage_percentage": 60
  }
}
```

---

### Admin Test 2: Get Specific User ✅

```bash
# Get user ID from Test 1
curl -X GET http://localhost:3001/admin/users/USER_ID \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Expected Response (200 OK):**
```json
{
  "id": "...",
  "email": "alice@acme.com",
  "role": "user",
  "status": "active",
  "lastLoginAt": "...",
  "createdAt": "..."
}
```

---

### Admin Test 3: Create New User ✅

```bash
curl -X POST http://localhost:3001/admin/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d "{\"email\":\"newuser@acme.com\",\"password\":\"NewUser@123!\",\"role\":\"user\"}"
```

**Expected Response (201 Created):**
```json
{
  "message": "User created successfully",
  "user": {
    "id": "...",
    "email": "newuser@acme.com",
    "role": "user",
    "status": "active",
    "createdAt": "..."
  }
}
```

---

### Admin Test 4: Create User - Duplicate Email ✅

```bash
curl -X POST http://localhost:3001/admin/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d "{\"email\":\"admin@acme.com\",\"password\":\"Test@123!\",\"role\":\"user\"}"
```

**Expected Response (409 Conflict):**
```json
{
  "code": "EMAIL_ALREADY_EXISTS",
  "message": "A user with this email already exists in your tenant"
}
```

---

### Admin Test 5: Create User - Weak Password ✅

```bash
curl -X POST http://localhost:3001/admin/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d "{\"email\":\"test@acme.com\",\"password\":\"weak\",\"role\":\"user\"}"
```

**Expected Response (400 Bad Request):**
```json
{
  "code": "PASSWORD_POLICY_VIOLATION",
  "message": "Password does not meet requirements",
  "errors": [
    "Password must be at least 10 characters long",
    "Password must contain at least one uppercase letter",
    "Password must contain at least one digit",
    "Password must contain at least one special character"
  ]
}
```

---

### Admin Test 6: Update User Role ✅

```bash
# Get user ID from list
curl -X PATCH http://localhost:3001/admin/users/USER_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d "{\"role\":\"admin\"}"
```

**Expected Response (200 OK):**
```json
{
  "message": "User updated successfully",
  "user": {
    "id": "...",
    "email": "alice@acme.com",
    "role": "admin",
    "status": "active",
    "updatedAt": "..."
  }
}
```

---

### Admin Test 7: Disable User ✅

```bash
curl -X DELETE http://localhost:3001/admin/users/USER_ID \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Expected Response (200 OK):**
```json
{
  "message": "User disabled successfully"
}
```

**Verification:** Try logging in as disabled user (should fail).

---

### Admin Test 8: Get License Usage ✅

```bash
curl -X GET http://localhost:3001/admin/license \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Expected Response (200 OK):**
```json
{
  "license": {
    "max_users": 5,
    "active_users": 3,
    "disabled_users": 1,
    "total_users": 4,
    "usage_percentage": 60,
    "tenant_status": "active"
  }
}
```

---

### Admin Test 9: License Limit Enforcement ✅

**Scenario:** Acme Corp has max 5 users. Try to create 6th active user.

```bash
# Create 5 users first, then try 6th
curl -X POST http://localhost:3001/admin/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d "{\"email\":\"sixth@acme.com\",\"password\":\"SixthUser@123!\",\"role\":\"user\"}"
```

**Expected Response (402 Payment Required):**
```json
{
  "code": "LICENSE_LIMIT_REACHED",
  "message": "Maximum number of users reached for your plan",
  "details": {
    "max_users": 5,
    "current_users": 5
  }
}
```

---

## 🔧 Operator Operations

**Prerequisites:**
- Login as operator (operator@yoursaas.com)
- Save access token

---

### Operator Test 1: List All Tenants ✅

```bash
curl -X GET http://localhost:3001/operator/tenants \
  -H "Authorization: Bearer YOUR_OPERATOR_TOKEN"
```

**Expected Response (200 OK):**
```json
{
  "tenants": [
    {
      "id": "...",
      "name": "Acme Corporation",
      "slug": "acme-corp",
      "status": "active",
      "maxUsers": 5,
      "activeUsers": 4,
      "availableSlots": 1,
      "createdAt": "...",
      "updatedAt": "..."
    },
    {
      "id": "...",
      "name": "Beta Organization",
      "slug": "beta-org",
      "status": "active",
      "maxUsers": 3,
      "activeUsers": 2,
      "availableSlots": 1,
      ...
    }
  ],
  "total": 2
}
```

---

### Operator Test 2: Get Tenant Details ✅

```bash
# Get tenant ID from Test 1
curl -X GET http://localhost:3001/operator/tenants/TENANT_ID \
  -H "Authorization: Bearer YOUR_OPERATOR_TOKEN"
```

**Expected Response (200 OK):**
```json
{
  "id": "...",
  "name": "Acme Corporation",
  "slug": "acme-corp",
  "status": "active",
  "maxUsers": 5,
  "activeUsers": 4,
  "disabledUsers": 1,
  "availableSlots": 1,
  "usagePercentage": 80,
  "users": [
    {
      "id": "...",
      "email": "admin@acme.com",
      "role": "admin",
      "status": "active",
      ...
    }
  ]
}
```

---

### Operator Test 3: Create New Tenant ✅

```bash
curl -X POST http://localhost:3001/operator/tenants \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_OPERATOR_TOKEN" \
  -d "{\"name\":\"Test Corp\",\"slug\":\"test-corp\",\"maxUsers\":10}"
```

**Expected Response (201 Created):**
```json
{
  "message": "Tenant created successfully",
  "tenant": {
    "id": "...",
    "name": "Test Corp",
    "slug": "test-corp",
    "status": "active",
    "maxUsers": 10,
    "createdAt": "..."
  }
}
```

---

### Operator Test 4: Create Tenant - Duplicate Slug ✅

```bash
curl -X POST http://localhost:3001/operator/tenants \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_OPERATOR_TOKEN" \
  -d "{\"name\":\"Another Acme\",\"slug\":\"acme-corp\",\"maxUsers\":5}"
```

**Expected Response (409 Conflict):**
```json
{
  "code": "SLUG_ALREADY_EXISTS",
  "message": "A tenant with this slug already exists"
}
```

---

### Operator Test 5: Create Tenant - Invalid Slug ✅

```bash
curl -X POST http://localhost:3001/operator/tenants \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_OPERATOR_TOKEN" \
  -d "{\"name\":\"Invalid\",\"slug\":\"INVALID_SLUG!\",\"maxUsers\":5}"
```

**Expected Response (400 Bad Request):**
```json
{
  "code": "VALIDATION_ERROR",
  "message": "Invalid request data",
  "details": [...]
}
```

---

### Operator Test 6: Update Tenant Max Users ✅

```bash
# Get tenant ID
curl -X PATCH http://localhost:3001/operator/tenants/TENANT_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_OPERATOR_TOKEN" \
  -d "{\"maxUsers\":15}"
```

**Expected Response (200 OK):**
```json
{
  "message": "Tenant updated successfully",
  "tenant": {
    "id": "...",
    "name": "Acme Corporation",
    "slug": "acme-corp",
    "status": "active",
    "maxUsers": 15,
    "updatedAt": "..."
  }
}
```

---

### Operator Test 7: Suspend Tenant ✅

```bash
curl -X POST http://localhost:3001/operator/tenants/TENANT_ID/suspend \
  -H "Authorization: Bearer YOUR_OPERATOR_TOKEN"
```

**Expected Response (200 OK):**
```json
{
  "message": "Tenant suspended successfully"
}
```

**Verification:** Try logging in as user from suspended tenant (should fail with TENANT_SUSPENDED).

---

### Operator Test 8: Activate Tenant ✅

```bash
curl -X POST http://localhost:3001/operator/tenants/TENANT_ID/activate \
  -H "Authorization: Bearer YOUR_OPERATOR_TOKEN"
```

**Expected Response (200 OK):**
```json
{
  "message": "Tenant activated successfully"
}
```

---

### Operator Test 9: Get Platform Statistics ✅

```bash
curl -X GET http://localhost:3001/operator/stats \
  -H "Authorization: Bearer YOUR_OPERATOR_TOKEN"
```

**Expected Response (200 OK):**
```json
{
  "stats": {
    "tenants": {
      "total": 3,
      "active": 2,
      "suspended": 0,
      "cancelled": 1
    },
    "users": {
      "total": 8,
      "active": 7,
      "disabled": 1
    },
    "averageUsersPerTenant": "2.67",
    "totalLicenseSlots": 23
  },
  "recentTenants": [...],
  "tenantsByStatus": {
    "active": 2,
    "suspended": 0,
    "cancelled": 1
  }
}
```

---

### Operator Test 10: Cancel (Delete) Tenant ✅

```bash
# First disable all users in tenant, then cancel
curl -X DELETE http://localhost:3001/operator/tenants/TENANT_ID \
  -H "Authorization: Bearer YOUR_OPERATOR_TOKEN"
```

**Expected Response (200 OK):**
```json
{
  "message": "Tenant cancelled successfully"
}
```

**Note:** This is a soft delete (status='cancelled').

---

### Operator Test 11: Delete Tenant with Users ✅

```bash
# Try to delete acme-corp which has active users
curl -X DELETE http://localhost:3001/operator/tenants/ACME_TENANT_ID \
  -H "Authorization: Bearer YOUR_OPERATOR_TOKEN"
```

**Expected Response (400 Bad Request):**
```json
{
  "code": "TENANT_HAS_USERS",
  "message": "Cannot delete tenant with 4 active user(s). Please disable all users first.",
  "details": {
    "activeUsers": 4
  }
}
```

---

## 🎨 UI Component Testing

### Step 1: Open Development Stub

```bash
# In terminal 1 - Start auth BFF
cd packages/auth-bff
npm run dev

# In terminal 2 - Start login UI
cd packages/login-ui
npm run dev
```

**Opens at:** http://localhost:5173

---

### UI Test 1: Login Form Display ✅

**Verify:**
- [ ] Email input field visible
- [ ] Password input field visible
- [ ] Sign In button visible
- [ ] Forgot Password link visible
- [ ] Form is centered and styled

---

### UI Test 2: Login Success ✅

**Steps:**
1. Enter email: `admin@acme.com`
2. Enter password: `Admin@Acme123!`
3. Click "Sign In"

**Verify:**
- [ ] Loading spinner appears
- [ ] Success message shows
- [ ] Redirects after 1 second
- [ ] `auth:login-success` event emitted (check console)

---

### UI Test 3: Login Error ✅

**Steps:**
1. Enter email: `admin@acme.com`
2. Enter password: `wrongpassword`
3. Click "Sign In"

**Verify:**
- [ ] Error message displays
- [ ] "Invalid email or password" shown
- [ ] `auth:login-error` event emitted
- [ ] Form fields remain editable

---

### UI Test 4: Disabled Account ✅

**Steps:**
1. Enter email: `disabled@acme.com`
2. Enter password: `User@Acme123!`
3. Click "Sign In"

**Verify:**
- [ ] Error message: "This account has been disabled"

---

### UI Test 5: Forgot Password Flow ✅

**Steps:**
1. Click "Forgot Password?"
2. Enter email: `admin@acme.com`
3. Click "Send Reset Instructions"

**Verify:**
- [ ] Loading state appears
- [ ] Success message: "Check Your Email"
- [ ] Email address shown
- [ ] "Back to Login" button visible

---

### UI Test 6: Theme Customization ✅

**Add to HTML:**
```html
<auth-login
  bff_url="http://localhost:3001"
  tenant_slug="acme-corp"
  theme_primary="#667eea"
  theme_background="#1a1a2e"
  theme_text="#ffffff"
></auth-login>
```

**Verify:**
- [ ] Primary color changed to purple
- [ ] Background is dark
- [ ] Text is white
- [ ] All elements styled correctly

---

## 🔒 Security Testing

### Security Test 1: Account Lockout ✅

**Steps:**
1. Attempt login with wrong password 5 times
2. On 6th attempt, verify lockout

```bash
for i in {1..6}; do
  curl -X POST http://localhost:3001/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"admin@acme.com\",\"password\":\"wrongpass\",\"tenant_slug\":\"acme-corp\"}"
  echo "Attempt $i"
done
```

**Expected (6th attempt):**
```json
{
  "code": "ACCOUNT_LOCKED",
  "message": "Account is temporarily locked. Please try again later.",
  "locked_until": "2026-03-10T..."
}
```

---

### Security Test 2: Cross-Tenant Access ✅

**Scenario:** Acme admin tries to access Beta tenant user

```bash
# Login as Acme admin, get token
# Try to access Beta user
curl -X GET http://localhost:3001/admin/users/BETA_USER_ID \
  -H "Authorization: Bearer ACME_ADMIN_TOKEN"
```

**Expected (403 Forbidden):**
```json
{
  "code": "FORBIDDEN",
  "message": "You do not have access to this user"
}
```

---

### Security Test 3: Unauthorized Access ✅

```bash
# Access admin route without token
curl -X GET http://localhost:3001/admin/users
```

**Expected (401 Unauthorized):**
```json
{
  "code": "MISSING_TOKEN",
  "message": "Authorization header is required"
}
```

---

### Security Test 4: Regular User Accessing Admin Routes ✅

```bash
# Login as regular user (alice@acme.com)
# Try to access admin routes
curl -X GET http://localhost:3001/admin/users \
  -H "Authorization: Bearer REGULAR_USER_TOKEN"
```

**Expected (403 Forbidden):**
```json
{
  "code": "FORBIDDEN",
  "message": "This operation requires one of the following roles: admin, operator"
}
```

---

### Security Test 5: JWT Expiration ✅

**Steps:**
1. Login and get access token
2. Wait 16 minutes (token expires in 15 min)
3. Try to access protected route

**Expected (401 Unauthorized):**
```json
{
  "code": "TOKEN_INVALID",
  "message": "Access token is invalid or expired"
}
```

---

### Security Test 6: Refresh Token Rotation ✅

**Steps:**
1. Login (refresh token stored in cookie)
2. Refresh token (get new access token)
3. Try to use OLD refresh token

**Expected:** Old token should be revoked.

---

## 🐛 Troubleshooting

### Issue: "Cannot connect to database"

**Solution:**
```bash
# Check PostgreSQL is running
docker compose ps

# Restart if needed
docker compose restart postgres

# Wait for healthy status
docker compose logs postgres
```

---

### Issue: "Private key not found"

**Solution:**
```bash
# Generate RSA keys
cd D:\vaikunta-ekadashi\Components\saas-auth
mkdir -p keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
```

---

### Issue: "Tenant not found"

**Solution:**
```bash
# Re-run seed script
npm run db:seed
```

---

### Issue: "Port 3001 already in use"

**Solution:**
```bash
# Find process using port 3001
netstat -ano | findstr :3001

# Kill process
taskkill /PID <PID> /F

# Or change port in .env
PORT=3002
```

---

### Issue: "CORS error"

**Solution:**
```bash
# Check CORS_ALLOWED_ORIGINS in .env
# Add your frontend URL
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

---

### Issue: "Module not found"

**Solution:**
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

---

## 📊 Test Results Checklist

Print this section and check off each test:

### API Tests
- [ ] Test 1: Health Check
- [ ] Test 2: Login Success
- [ ] Test 3: Invalid Credentials
- [ ] Test 4: Disabled Account
- [ ] Test 5: Get Current User
- [ ] Test 6: Refresh Token
- [ ] Test 7: Forgot Password
- [ ] Test 8: Reset Password

### Admin Tests
- [ ] Admin 1: List Users
- [ ] Admin 2: Get User
- [ ] Admin 3: Create User
- [ ] Admin 4: Duplicate Email
- [ ] Admin 5: Weak Password
- [ ] Admin 6: Update Role
- [ ] Admin 7: Disable User
- [ ] Admin 8: License Usage
- [ ] Admin 9: License Limit

### Operator Tests
- [ ] Operator 1: List Tenants
- [ ] Operator 2: Get Tenant
- [ ] Operator 3: Create Tenant
- [ ] Operator 4: Duplicate Slug
- [ ] Operator 5: Invalid Slug
- [ ] Operator 6: Update Max Users
- [ ] Operator 7: Suspend Tenant
- [ ] Operator 8: Activate Tenant
- [ ] Operator 9: Platform Stats
- [ ] Operator 10: Cancel Tenant
- [ ] Operator 11: Delete with Users

### UI Tests
- [ ] UI 1: Form Display
- [ ] UI 2: Login Success
- [ ] UI 3: Login Error
- [ ] UI 4: Disabled Account
- [ ] UI 5: Forgot Password
- [ ] UI 6: Theme Customization

### Security Tests
- [ ] Security 1: Account Lockout
- [ ] Security 2: Cross-Tenant Access
- [ ] Security 3: Unauthorized Access
- [ ] Security 4: User Role Enforcement
- [ ] Security 5: JWT Expiration
- [ ] Security 6: Refresh Token Rotation

---

## 📝 Notes

- All timestamps are in ISO 8601 format
- Access tokens expire in 15 minutes
- Refresh tokens expire in 7 days
- Passwords must be 10+ characters with complexity
- Last 5 passwords cannot be reused
- Account lockout lasts 15 minutes

---

**Jai Jagannath!** 🙏

**Happy Testing!**
