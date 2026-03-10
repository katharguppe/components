# Implementation Verification Guide

**Date:** March 10, 2026  
**Checkpoint:** CHECKPOINT_02  
**Status:** Phase 2 Core Complete - Admin/Operator Routes Pending

---

## 🎯 Purpose

This document provides comprehensive stub code and test scripts to verify that all implemented functionality is working correctly before proceeding to the next phase.

---

## 📋 What's Implemented (CHECKPOINT_02)

### ✅ Phase 1: Database & Migrations
- [x] Prisma schema with all tables
- [x] RLS policies (tested & working)
- [x] Seed script with test accounts

### ✅ Phase 2: Auth BFF Core
- [x] Password Service (Argon2id)
- [x] Token Service (RS256 JWT)
- [x] Audit Service
- [x] Tenant Resolution Middleware
- [x] Authentication Middleware
- [x] Rate Limiting Middleware
- [x] Auth Routes (login, logout, refresh, forgot-password, reset-password, me)
- [x] JWKS Routes

### ⏳ Phase 2 Remaining
- [ ] Admin routes (user management)
- [ ] Operator routes (tenant management)
- [ ] License enforcement service

---

## 🚀 Quick Start Verification

### Step 1: Start Infrastructure

```bash
cd D:\vaikunta-ekadashi\Components\saas-auth
npm run docker:up
```

Wait for services to be healthy:
```bash
docker compose ps
```

Expected output:
```
NAME                       STATUS
saas-auth-postgres         Up (healthy)
saas-auth-mailhog          Up
```

### Step 2: Install Dependencies

```bash
cd packages/auth-bff
npm install
cd ../..
```

### Step 3: Run Database Migrations

```bash
cd packages/auth-bff
npx prisma migrate dev
npx prisma db seed
cd ../..
```

### Step 4: Start Auth BFF Server

```bash
cd packages/auth-bff
npm run dev
```

Expected output:
```
🚀 Auth BFF service running on port 3001
📝 Environment: development
🔗 Health check: http://localhost:3001/health
```

---

## 🧪 Verification Tests

### Test 1: Health Check ✅

```bash
curl -X GET http://localhost:3001/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "db": "connected",
  "version": "1.0.0",
  "timestamp": "2026-03-10T..."
}
```

**Status Code:** `200`

---

### Test 2: Login - Success ✅

```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d "{\"email\":\"admin@acme.com\",\"password\":\"Admin@Acme123!\",\"tenant_slug\":\"acme-corp\"}"
```

**Expected Response:**
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

**Status Code:** `200`

**Save the `access_token` for subsequent tests.**

---

### Test 3: Login - Invalid Credentials ✅

```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@acme.com\",\"password\":\"wrongpassword\",\"tenant_slug\":\"acme-corp\"}"
```

**Expected Response:**
```json
{
  "code": "INVALID_CREDENTIALS",
  "message": "Invalid email or password",
  "attempts_remaining": 4
}
```

**Status Code:** `401`

---

### Test 4: Login - Disabled Account ✅

```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"disabled@acme.com\",\"password\":\"User@Acme123!\",\"tenant_slug\":\"acme-corp\"}"
```

**Expected Response:**
```json
{
  "code": "ACCOUNT_DISABLED",
  "message": "This account has been disabled"
}
```

**Status Code:** `403`

---

### Test 5: Login - Unknown Tenant ✅

```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@acme.com\",\"password\":\"Admin@Acme123!\",\"tenant_slug\":\"unknown-tenant\"}"
```

**Expected Response:**
```json
{
  "code": "TENANT_NOT_FOUND",
  "message": "Tenant 'unknown-tenant' not found"
}
```

**Status Code:** `404`

---

### Test 6: Get Current User (Authenticated) ✅

```bash
# Replace YOUR_ACCESS_TOKEN with the token from Test 2
curl -X GET http://localhost:3001/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected Response:**
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

**Status Code:** `200`

---

### Test 7: Get Current User (No Token) ✅

```bash
curl -X GET http://localhost:3001/auth/me
```

**Expected Response:**
```json
{
  "code": "MISSING_TOKEN",
  "message": "Authorization header is required"
}
```

**Status Code:** `401`

---

### Test 8: Get Current User (Invalid Token) ✅

```bash
curl -X GET http://localhost:3001/auth/me \
  -H "Authorization: Bearer invalid.token.here"
```

**Expected Response:**
```json
{
  "code": "TOKEN_INVALID",
  "message": "Access token is invalid or expired"
}
```

**Status Code:** `401`

---

### Test 9: Refresh Token ✅

```bash
# Uses cookies.txt from login
curl -X POST http://localhost:3001/auth/refresh \
  -b cookies.txt \
  -c cookies.txt
```

**Expected Response:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

**Status Code:** `200`

**Note:** The refresh token should rotate (old token is revoked).

---

### Test 10: Refresh Token (No Cookie) ✅

```bash
curl -X POST http://localhost:3001/auth/refresh
```

**Expected Response:**
```json
{
  "code": "MISSING_REFRESH_TOKEN",
  "message": "Refresh token is required"
}
```

**Status Code:** `401`

---

### Test 11: Forgot Password ✅

```bash
curl -X POST http://localhost:3001/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@acme.com\",\"tenant_slug\":\"acme-corp\"}"
```

**Expected Response (Development Mode):**
```json
{
  "message": "Password reset token generated",
  "reset_token": "..."
}
```

**Status Code:** `200`

**Note:** In production, the token would NOT be returned (sent via email instead).

---

### Test 12: Reset Password ✅

```bash
# Use the reset_token from Test 11
curl -X POST http://localhost:3001/auth/reset-password \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"YOUR_RESET_TOKEN\",\"password\":\"NewSecure@Pass123!\"}"
```

**Expected Response:**
```json
{
  "message": "Password has been reset successfully"
}
```

**Status Code:** `200`

**Verification:** Try logging in with the new password.

---

### Test 13: Reset Password - Weak Password ✅

```bash
curl -X POST http://localhost:3001/auth/reset-password \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"YOUR_RESET_TOKEN\",\"password\":\"weak\"}"
```

**Expected Response:**
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

**Status Code:** `400`

---

### Test 14: Logout ✅

```bash
# Use access token from Test 2
curl -X POST http://localhost:3001/auth/logout \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -b cookies.txt
```

**Expected Response:**
```json
{
  "message": "Logged out successfully"
}
```

**Status Code:** `200`

**Verification:** The refresh token cookie should be cleared.

---

### Test 15: JWKS Endpoint ✅

```bash
curl -X GET http://localhost:3001/.well-known/jwks.json
```

**Expected Response:**
```json
{
  "keys": [
    {
      "kty": "RSA",
      "use": "sig",
      "alg": "RS256",
      "kid": "saas-auth-key-1",
      "n": "...",
      "e": "AQAB"
    }
  ]
}
```

**Status Code:** `200`

---

### Test 16: Account Lockout (5 Failed Attempts) ✅

```bash
# Run 6 failed login attempts
for i in {1..6}; do
  echo "Attempt $i:"
  curl -X POST http://localhost:3001/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"admin@acme.com\",\"password\":\"wrongpass\",\"tenant_slug\":\"acme-corp\"}"
  echo -e "\n"
done
```

**Expected Response (After 5 failures):**
```json
{
  "code": "ACCOUNT_LOCKED",
  "message": "Account is temporarily locked. Please try again later.",
  "locked_until": "2026-03-10T..."
}
```

**Status Code:** `403`

---

### Test 17: Cross-Tenant Isolation ✅

```bash
# Try to login with Acme credentials but wrong tenant
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@acme.com\",\"password\":\"Admin@Acme123!\",\"tenant_slug\":\"beta-org\"}"
```

**Expected Response:**
```json
{
  "code": "INVALID_CREDENTIALS",
  "message": "Invalid email or password"
}
```

**Status Code:** `401`

**Note:** This proves tenant isolation - user exists in acme-corp but not beta-org.

---

### Test 18: CORS - Allowed Origin ✅

```bash
curl -X GET http://localhost:3001/health \
  -H "Origin: http://localhost:5173" \
  -v
```

**Expected:** Response should include CORS headers:
```
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Credentials: true
```

---

### Test 19: CORS - Disallowed Origin ✅

```bash
curl -X GET http://localhost:3001/health \
  -H "Origin: http://evil.com" \
  -v
```

**Expected:** CORS headers should NOT include `http://evil.com`

---

### Test 20: Security Headers (Helmet) ✅

```bash
curl -X GET http://localhost:3001/health -v
```

**Expected Headers:**
```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 0
Content-Security-Policy: default-src 'self'; ...
```

---

## 📊 Test Results Checklist

| # | Test | Status | Notes |
|---|------|--------|-------|
| 1 | Health Check | ⬜ | |
| 2 | Login - Success | ⬜ | |
| 3 | Login - Invalid Credentials | ⬜ | |
| 4 | Login - Disabled Account | ⬜ | |
| 5 | Login - Unknown Tenant | ⬜ | |
| 6 | Get Current User (Authenticated) | ⬜ | |
| 7 | Get Current User (No Token) | ⬜ | |
| 8 | Get Current User (Invalid Token) | ⬜ | |
| 9 | Refresh Token | ⬜ | |
| 10 | Refresh Token (No Cookie) | ⬜ | |
| 11 | Forgot Password | ⬜ | |
| 12 | Reset Password | ⬜ | |
| 13 | Reset Password - Weak Password | ⬜ | |
| 14 | Logout | ⬜ | |
| 15 | JWKS Endpoint | ⬜ | |
| 16 | Account Lockout | ⬜ | |
| 17 | Cross-Tenant Isolation | ⬜ | |
| 18 | CORS - Allowed Origin | ⬜ | |
| 19 | CORS - Disallowed Origin | ⬜ | |
| 20 | Security Headers | ⬜ | |

---

## 🔍 Manual Database Verification

### Check RLS Policies

```bash
# Connect to PostgreSQL
docker exec -it saas-auth-postgres psql -U authuser -d authdb
```

```sql
-- Set tenant context to Acme
SET app.current_tenant_id = (SELECT id FROM tenants WHERE slug = 'acme-corp');

-- Query users - should only return Acme users
SELECT email, role FROM users;

-- Expected output:
--        email         | role
-- ---------------------+-------
--  admin@acme.com     | admin
--  alice@acme.com     | user
--  bob@acme.com       | user
--  disabled@acme.com  | user
```

---

## 🐛 Troubleshooting

### Issue: Health check fails with "Database connection failed"

**Solution:**
```bash
# Check if PostgreSQL is running
docker compose ps

# Check DATABASE_URL in .env matches docker-compose.yml
# Restart services
npm run docker:down
npm run docker:up
```

### Issue: "Private key not found"

**Solution:**
```bash
# Generate RSA keys
cd D:\vaikunta-ekadashi\Components\saas-auth
mkdir -p keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
```

### Issue: "Tenant not found"

**Solution:**
```bash
# Re-run seed script
cd packages/auth-bff
npx prisma db seed
```

### Issue: "Token invalid" immediately after login

**Solution:**
- Check system time is synchronized
- Verify JWT keys are properly generated
- Check JWT_ISSUER and JWT_AUDIENCE match in config

---

## 📝 Next Steps After Verification

Once all 20 tests pass:

1. **Proceed to Phase 2 Remaining:**
   - Implement Admin routes (`/admin/users`)
   - Implement Operator routes (`/operator/tenants`)
   - Implement License enforcement service

2. **Or proceed to Phase 3:**
   - Bootstrap Login UI project
   - Implement state machine
   - Create form components

---

**Jai Jagannath!**
