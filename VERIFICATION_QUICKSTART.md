# SaaS Auth - Verification Quick Start

## 🎯 Purpose

This guide helps you verify that CHECKPOINT_02 implementation is working correctly before proceeding to the next phase.

---

## 📋 Quick Verification (5 minutes)

### Step 1: Start Infrastructure

```bash
cd D:\vaikunta-ekadashi\Components\saas-auth

# Start PostgreSQL and Mailhog
npm run docker:up

# Wait for PostgreSQL to be healthy (check every 5 seconds)
docker compose ps
```

**Expected:**
```
NAME                       STATUS
saas-auth-postgres         Up (healthy)
saas-auth-mailhog          Up
```

---

### Step 2: Setup Database

```bash
cd packages/auth-bff

# Install dependencies (first time only)
npm install

# Run migrations
npx prisma migrate dev

# Seed database with test accounts
npx prisma db seed

cd ../..
```

**Expected:**
```
✅ Seed completed successfully!

📋 Test Accounts Summary:
┌─────────────────────────────────────────────────────────────────┐
│ Account Type       │ Email                  │ Password          │
├─────────────────────────────────────────────────────────────────┤
│ Platform Operator  │ operator@yoursaas.com  │ Operator@Secure123! │
│ Tenant Admin (Acme)│ admin@acme.com         │ Admin@Acme123!    │
│ Tenant User (Acme) │ alice@acme.com         │ User@Acme123!     │
│ Tenant User (Acme) │ bob@acme.com           │ User@Acme123!     │
│ Disabled User      │ disabled@acme.com      │ User@Acme123!     │
│ Tenant Admin (Beta)│ admin@betaorg.com      │ Admin@Beta123!    │
│ Tenant User (Beta) │ carol@betaorg.com      │ User@Beta123!     │
└─────────────────────────────────────────────────────────────────┘
```

---

### Step 3: Generate RSA Keys (if not exists)

```bash
cd D:\vaikunta-ekadashi\Components\saas-auth

# Check if keys exist
if not exist keys\private.pem (
  mkdir keys
  openssl genrsa -out keys\private.pem 2048
  openssl rsa -in keys\private.pem -pubout -out keys\public.pem
)
```

---

### Step 4: Start Auth BFF Server

```bash
cd packages/auth-bff
npm run dev
```

**Expected:**
```
🚀 Auth BFF service running on port 3001
📝 Environment: development
🔗 Health check: http://localhost:3001/health
```

**Keep this terminal open.**

---

### Step 5: Run Automated Tests

Open a **new terminal** and run:

```bash
cd D:\vaikunta-ekadashi\Components\saas-auth
node verify-checkpoint-02.js
```

**Expected Output:**
```
╔════════════════════════════════════════════════════════════╗
║  CHECKPOINT_02 Verification Suite                         ║
║  SaaS Multi-Tenant Login Component                        ║
╚════════════════════════════════════════════════════════════╝

✅ PASS - Health Check
✅ PASS - Login - Success
✅ PASS - Login - Invalid Credentials
✅ PASS - Login - Disabled Account
✅ PASS - Login - Unknown Tenant
✅ PASS - Get Current User (Authenticated)
✅ PASS - Get Current User (No Token)
✅ PASS - Get Current User (Invalid Token)
✅ PASS - Refresh Token
✅ PASS - Refresh Token (No Cookie)
✅ PASS - Forgot Password
✅ PASS - Reset Password
✅ PASS - Reset Password - Weak Password
✅ PASS - Logout
✅ PASS - JWKS Endpoint
✅ PASS - Account Lockout
✅ PASS - Cross-Tenant Isolation
✅ PASS - CORS - Allowed Origin
✅ PASS - CORS - Disallowed Origin
✅ PASS - Security Headers

╔════════════════════════════════════════════════════════════╗
║  Test Summary                                              ║
╚════════════════════════════════════════════════════════════╝

Total:  20 tests
Passed: 20 ✅
Failed: 0 ❌

🎉 All tests passed! CHECKPOINT_02 is verified and working.
```

---

## 🔍 Manual Testing (Optional)

### Quick Manual Tests

```bash
# 1. Health Check
curl http://localhost:3001/health

# 2. Login
curl -X POST http://localhost:3001/auth/login ^
  -H "Content-Type: application/json" ^
  -c cookies.txt ^
  -d "{\"email\":\"admin@acme.com\",\"password\":\"Admin@Acme123!\",\"tenant_slug\":\"acme-corp\"}"

# 3. Get Current User (replace TOKEN with the access_token from login)
curl http://localhost:3001/auth/me ^
  -H "Authorization: Bearer TOKEN"

# 4. Refresh Token
curl -X POST http://localhost:3001/auth/refresh ^
  -b cookies.txt ^
  -c cookies.txt

# 5. JWKS
curl http://localhost:3001/.well-known/jwks.json
```

---

## ✅ Verification Checklist

Before proceeding to next phase, ensure:

- [ ] All 20 automated tests pass
- [ ] Health check returns `{"status": "ok", "db": "connected"}`
- [ ] Login works with test accounts
- [ ] Invalid credentials rejected
- [ ] Disabled accounts cannot login
- [ ] Unknown tenants rejected
- [ ] Authenticated requests work with JWT
- [ ] Unauthenticated requests rejected
- [ ] Token refresh works
- [ ] Password reset flow works
- [ ] Logout works
- [ ] JWKS endpoint returns public key
- [ ] Account locks after 5 failed attempts
- [ ] Cross-tenant access blocked
- [ ] CORS configured correctly
- [ ] Security headers present

---

## 🐛 Troubleshooting

### Server won't start

```bash
# Check if port 3001 is in use
netstat -ano | findstr :3001

# Kill the process if needed
taskkill /PID <PID> /F
```

### Database connection fails

```bash
# Restart PostgreSQL
docker compose restart postgres

# Check DATABASE_URL in .env matches docker-compose.yml
# Should be: postgresql://authuser:authpass@localhost:5432/authdb
```

### Tests fail with "Private key not found"

```bash
# Generate RSA keys
cd D:\vaikunta-ekadashi\Components\saas-auth
mkdir keys
openssl genrsa -out keys\private.pem 2048
openssl rsa -in keys\private.pem -pubout -out keys\public.pem
```

### Tests fail with "Tenant not found"

```bash
# Re-run seed script
cd packages/auth-bff
npx prisma db seed
```

---

## 📊 What's Verified

When all tests pass, you have confirmed:

### Phase 1: Database ✅
- PostgreSQL connection working
- All tables created correctly
- RLS policies in place
- Seed data loaded

### Phase 2: Auth BFF Core ✅
- Express server running
- Password hashing (Argon2id) working
- JWT token generation (RS256) working
- Token validation working
- Refresh token rotation working
- Account lockout working
- Password reset flow working
- Tenant resolution working
- Authentication middleware working
- Rate limiting working
- CORS configured
- Security headers (Helmet) configured
- Audit logging working

---

## 🚀 Next Steps

After verification passes:

### Option A: Complete Phase 2
1. Implement Admin routes (`/admin/users`)
2. Implement Operator routes (`/operator/tenants`)
3. Implement License enforcement service

### Option B: Start Phase 3 (Login UI)
1. Bootstrap Login UI project
2. Implement state machine
3. Create form components
4. Build web component wrapper

---

## 📝 Test Results

Test results are saved to: `test-results.json`

```json
{
  "timestamp": "2026-03-10T...",
  "total": 20,
  "passed": 20,
  "failed": 0,
  "results": [...]
}
```

---

**Jai Jagannath!**
