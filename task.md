# SaaS Multi-Tenant Login Component - Task Breakdown

**Document Version:** 1.0  
**Date:** March 2026  
**Classification:** Confidential — Internal  
**Jai Jagannath**

---

## Task Overview

This document provides a detailed breakdown of all implementation tasks with specific acceptance criteria, file locations, and checkpoint markers. Each task follows the PDCA (Plan-Do-Check-Act) methodology.

---

## Phase 1: Database & Migrations

### Task 1.1: Implement Prisma Schema and SQL Migrations

**Status:** `[x]` COMPLETE

**Description:**  
Create the Prisma schema file and initial migration for all database tables defined in Architecture Spec Section 4.1.

**Files Created:**
- `packages/auth-bff/prisma/schema.prisma` - Prisma schema definition ✅
- `packages/auth-bff/prisma/migrations/20260309162346_init/` - Initial migration ✅

**Acceptance Criteria:**
- [x] Prisma schema compiles without errors
- [x] `npx prisma migrate dev --name init` creates migration files
- [x] All tables have correct columns and constraints
- [x] Foreign key relationships properly defined
- [x] Unique constraint on (email, tenant_id) for users table
- [x] Indexes on frequently queried columns (tenant_id, email)

---

### Task 1.2: Implement Row-Level Security (RLS) Policies

**Status:** `[x]` COMPLETE - TESTED & WORKING

**Description:**  
Create SQL migration to enable RLS on tenant-scoped tables and define isolation policies per Architecture Spec Section 4.2.

**Files Created:**
- `packages/auth-bff/prisma/migrations/20260309162400_enable_rls/migration.sql` ✅ (Updated with FORCE RLS)

**Acceptance Criteria:**
- [x] RLS enabled on users, refresh_tokens, auth_events tables
- [x] RLS forced for table owner (FORCE ROW LEVEL SECURITY)
- [x] Policy functions correctly isolate tenant data
- [x] Test case proves cross-tenant query returns only tenant data
- [x] Performance impact documented (< 5ms overhead)

---

### Task 1.3: Implement Seed Script for Local Development

**Status:** `[x]` COMPLETE

**Description:**  
Create a Prisma seed script that populates the database with test data for local development per Deployment Guide Section 4.

**Files Created:**
- `packages/auth-bff/prisma/seed.ts` ✅

**Seed Data Created:**

| Account Type | Email | Password | Tenant | max_users |
|--------------|-------|----------|--------|-----------|
| Platform Operator | operator@yoursaas.com | Operator@Secure123! | system | — |
| Tenant (Acme) | — | — | acme-corp | 5 |
| Admin (Acme) | admin@acme.com | Admin@Acme123! | acme-corp | — |
| User (Acme) | alice@acme.com | User@Acme123! | acme-corp | — |
| User (Acme) | bob@acme.com | User@Acme123! | acme-corp | — |
| Tenant (Beta) | — | — | beta-org | 3 |
| Admin (Beta) | admin@betaorg.com | Admin@Beta123! | beta-org | — |
| User (Beta) | carol@betaorg.com | User@Beta123! | beta-org | — |
| Disabled User | disabled@acme.com | User@Acme123! | acme-corp | — |

**Acceptance Criteria:**
- [x] `npx prisma db seed` runs without errors
- [x] All accounts created with correct passwords (Argon2id hashed)
- [x] Tenant slugs are URL-safe (lowercase, hyphens)
- [x] Disabled user has status='disabled'
- [x] Operator has role='operator' with system tenant

---

## Checkpoint 01: Database Layer Complete

**Status:** `[x]` COMPLETE

**Trigger:** All Phase 1 tasks completed and verified

**Completed:** March 9, 2026

**Verification Checklist:**
- [x] All migrations apply cleanly to fresh database
- [x] RLS policies prevent cross-tenant access
- [x] Seed script creates all test accounts
- [x] Password hashes are valid Argon2id format
- [x] Prisma Client generates successfully

---

## Phase 2: Auth BFF Service

### Task 2.1: Bootstrap Express/Fastify Project

**Status:** `[x]` COMPLETE

**Description:**  
Initialize the Auth BFF project with TypeScript, Express 4, Zod validation, and Prisma ORM integration.

**Files Created:**
- `packages/auth-bff/package.json` ✅
- `packages/auth-bff/tsconfig.json` ✅
- `packages/auth-bff/src/index.ts` ✅
- `packages/auth-bff/src/app.ts` ✅
- `packages/auth-bff/src/config/index.ts` ✅
- `packages/auth-bff/.env.example` ✅

**Acceptance Criteria:**
- [x] `npm install` completes without errors
- [x] TypeScript compiles in strict mode
- [x] Server starts on configured PORT
- [x] Health endpoint returns 200: `GET /health`
- [x] Environment variables loaded from process.env

---

### Task 2.2: Implement Authentication Routes

**Status:** `[-]` PARTIAL - Core auth routes complete, admin/operator routes pending

**Description:**  
Implement all authentication endpoints per Architecture Spec Section 5.

**Files Created:**
- `packages/auth-bff/src/routes/auth.routes.ts` ✅
- `packages/auth-bff/src/routes/jwks.routes.ts` ✅
- `packages/auth-bff/src/routes/admin.routes.ts` - PENDING
- `packages/auth-bff/src/routes/operator.routes.ts` - PENDING

**Endpoints Implemented:**

| Method | Path | Status |
|--------|------|--------|
| POST | /auth/login | ✅ Complete |
| POST | /auth/logout | ✅ Complete |
| POST | /auth/refresh | ✅ Complete |
| POST | /auth/register | Schema defined, not implemented |
| POST | /auth/forgot-password | ✅ Complete |
| POST | /auth/reset-password | ✅ Complete |
| GET | /auth/me | ✅ Complete |
| GET | /.well-known/jwks.json | ✅ Complete |
| GET | /admin/users | PENDING |
| POST | /admin/users | PENDING |
| PATCH | /admin/users/:id | PENDING |
| DELETE | /admin/users/:id | PENDING |
| GET | /operator/tenants | PENDING |
| POST | /operator/tenants | PENDING |
| PATCH | /operator/tenants/:id | PENDING |

**Acceptance Criteria:**
- [x] Core auth endpoints return correct HTTP status codes
- [x] Request validation with Zod schemas
- [x] Error responses follow structured JSON format
- [x] Refresh token set as HttpOnly cookie
- [x] Access token returned in response body
- [ ] Admin routes implemented
- [ ] Operator routes implemented

---

### Task 2.3: Implement JWT Token Service

**Status:** `[x]` COMPLETE

**Description:**  
Implement JWT issuance and validation using RS256 algorithm per Architecture Spec Section 6.2.

**Files Created:**
- `packages/auth-bff/src/services/token.service.ts` ✅
- `packages/auth-bff/src/routes/jwks.routes.ts` ✅

**Acceptance Criteria:**
- [x] JWTs signed with RS256 (private key from keys/private.pem)
- [x] Public key exposed at `GET /.well-known/jwks.json`
- [x] Access token expires in 15 minutes
- [x] Refresh token stored as SHA-256 hash in database
- [x] Token validation rejects expired/invalid tokens
- [x] Token refresh rotates refresh token

---

### Task 2.4: Implement Password Service (Argon2id)

**Status:** `[x]` COMPLETE

**Description:**  
Implement password hashing and verification using Argon2id per Architecture Spec Section 6.1.

**Files Created:**
- `packages/auth-bff/src/services/password.service.ts` ✅

**Acceptance Criteria:**
- [x] Passwords hashed with Argon2id (not bcrypt or other)
- [x] Hash verification completes in < 500ms
- [x] Password policy rejects weak passwords
- [x] Password history checking implemented
- [x] Passwords never logged or returned in API responses

function validatePasswordPolicy(password: string): {
  valid: boolean;
  errors: string[];
};
```

**Functions to Implement:**
```typescript
// Hash password with Argon2id
async function hashPassword(password: string): Promise<string>;

// Verify password against hash
async function verifyPassword(
  password: string, 
  hash: string
): Promise<boolean>;

// Validate password meets policy
function validatePasswordPolicy(password: string): ValidationResult;

// Check password history
async function checkPasswordHistory(
  userId: string,
  password: string,
  history: string[]
): Promise<boolean>;
```

**Acceptance Criteria:**
- [ ] Passwords hashed with Argon2id (not bcrypt or other)
- [ ] Hash verification completes in < 500ms
- [ ] Password policy rejects weak passwords
- [ ] Password history prevents reuse of last 5 passwords
- [ ] Passwords never logged or returned in API responses

---

### Task 2.5: Implement Rate Limiting Middleware

**Status:** `[x]` COMPLETE

**Description:**  
Implement rate limiting per endpoint per Architecture Spec Section 6.4.

**Files Created:**
- `packages/auth-bff/src/middleware/ratelimit.middleware.ts` ✅

**Acceptance Criteria:**
- [x] Login rate limit: 10 req/min/IP
- [x] Forgot password rate limit: 3 req/hour/email
- [x] Refresh rate limit: 60 req/min/token
- [x] Rate limit exceeded returns HTTP 429 with Retry-After header

---

### Task 2.6: Implement Audit Event Logger

**Status:** `[x]` COMPLETE

**Description:**  
Implement audit logging for all authentication events per Architecture Spec Section 6.5.

**Files Created:**
- `packages/auth-bff/src/services/audit.service.ts` ✅

**Acceptance Criteria:**
- [x] All auth events logged to auth_events table
- [x] Events include tenant_id, user_id, ip_address, user_agent
- [x] Metadata captures event-specific context
- [x] Audit records are immutable (no updates/deletes)
- [x] Structured logging format for Cloud Logging

---

### Task 2.7: Implement Tenant Resolution Middleware

**Status:** `[x]` COMPLETE

**Description:**  
Implement middleware to resolve tenant from slug or tenant_id with caching.

**Files Created:**
- `packages/auth-bff/src/middleware/tenant.middleware.ts` ✅

**Acceptance Criteria:**
- [x] Tenant resolved from slug or JWT claim
- [x] 404 returned for unknown tenant slug
- [x] 403 returned for suspended/cancelled tenant
- [x] Tenant context attached to request object

---

### Task 2.8: Implement License Enforcement

**Status:** `[ ]` Pending

**Description:**  
Implement license limit check on user creation per Architecture Spec Section 2.3.

**Files to Create:**
- `packages/auth-bff/src/services/license.service.ts`

**Acceptance Criteria:**
- [ ] User creation blocked when active users >= max_users
- [ ] HTTP 402 returned with structured error
- [ ] License count excludes disabled users
- [ ] Operator can update max_users at any time
- [ ] License check does not add > 50ms latency

---

## Checkpoint 02: Auth BFF Core Complete

**Status:** `[-]` IN PROGRESS

**Trigger:** All Phase 2 core tasks completed

**Completed:** March 9, 2026 (Core)

**Verification Checklist:**
- [x] Core API endpoints functional (login, logout, refresh, me, forgot-password, reset-password)
- [x] JWT tokens validate correctly
- [x] Password hashing meets security requirements
- [x] Rate limiting blocks excessive requests
- [x] Audit events logged correctly
- [x] Tenant resolution middleware working
- [ ] Admin routes implemented
- [ ] Operator routes implemented
- [ ] License enforcement returns 402

---

## Phase 3: Login UI Component

### Task 3.1: Bootstrap Vite + React + TypeScript Project

**Status:** `[ ]` Pending

**Description:**  
Initialize the Login UI project with Vite, React 18, and TypeScript.

**Files to Create:**
- `packages/login-ui/package.json`
- `packages/login-ui/tsconfig.json`
- `packages/login-ui/vite.config.ts`
- `packages/login-ui/index.html`
- `packages/login-ui/src/main.tsx`

**Dependencies:**
```json
{
  "dependencies": {
    "react": "^18.2.x",
    "react-dom": "^18.2.x"
  },
  "devDependencies": {
    "@types/react": "^18.2.x",
    "@types/react-dom": "^18.2.x",
    "@vitejs/plugin-react": "^4.x",
    "typescript": "^5.x",
    "vite": "^5.x",
    "vitest": "^1.x",
    "@testing-library/react": "^14.x"
  }
}
```

**Acceptance Criteria:**
- [ ] `npm run dev` starts Vite dev server on :5173
- [ ] TypeScript compiles in strict mode
- [ ] Hot module replacement works
- [ ] Build produces optimized bundle

---

### Task 3.2: Implement State Machine (useReducer)

**Status:** `[ ]` Pending

**Description:**  
Implement the UI state machine per Architecture Spec Section 8.

**Files to Create:**
- `packages/login-ui/src/hooks/useAuthMachine.ts`
- `packages/login-ui/src/types/state.ts`

**State Machine Definition:**
```typescript
type AuthState =
  | "IDLE"
  | "SUBMITTING"
  | "SUCCESS"
  | "ERROR"
  | "LOCKED"
  | "REDIRECTING"
  | "FORGOT_PASSWORD"
  | "OTP_SENT"
  | "RESET_SUCCESS";

type AuthAction =
  | { type: "SUBMIT" }
  | { type: "SUCCESS"; payload: LoginResponse }
  | { type: "ERROR"; payload: ErrorResponse }
  | { type: "LOCKED"; payload: { locked_until: string } }
  | { type: "EDIT" }
  | { type: "UNLOCK" }
  | { type: "REDIRECT" }
  | { type: "FORGOT_PASSWORD" }
  | { type: "OTP_SENT" }
  | { type: "RESET_SUCCESS" }
  | { type: "RESET" };
```

**State Transitions:**
| Current State | Action | Next State |
|---------------|--------|------------|
| IDLE | SUBMIT | SUBMITTING |
| SUBMITTING | SUCCESS | SUCCESS |
| SUBMITTING | ERROR | ERROR |
| SUBMITTING | LOCKED | LOCKED |
| ERROR | EDIT | IDLE |
| LOCKED | UNLOCK | IDLE |
| SUCCESS | REDIRECT | REDIRECTING |
| FORGOT_PASSWORD | OTP_SENT | OTP_SENT |
| OTP_SENT | RESET_SUCCESS | RESET_SUCCESS |
| RESET_SUCCESS | (5s timeout) | IDLE |

**Acceptance Criteria:**
- [ ] All state transitions implemented
- [ ] No invalid state transitions possible
- [ ] State persists across re-renders
- [ ] State machine testable in isolation

---

### Task 3.3: Implement Login, Forgot Password, Reset Password Forms

**Status:** `[ ]` Pending

**Description:**  
Create the form components for authentication flows.

**Files to Create:**
- `packages/login-ui/src/components/LoginForm.tsx`
- `packages/login-ui/src/components/ForgotPassword.tsx`
- `packages/login-ui/src/components/ResetPassword.tsx`
- `packages/login-ui/src/components/LoginComponent.tsx`

**LoginForm Props:**
```typescript
interface LoginFormProps {
  bffUrl: string;
  tenantSlug: string;
  redirectUrl?: string;
  theme?: ThemeConfig;
  showRegister?: boolean;
  logoUrl?: string;
}
```

**Form Validation:**
- Email: Valid email format
- Password: Min 10 chars (client-side hint only)
- Tenant: Required (from props)

**Acceptance Criteria:**
- [ ] Forms render correctly with theme
- [ ] Client-side validation shows errors
- [ ] API errors display user-friendly messages
- [ ] Loading states disable submit button
- [ ] Forms accessible (ARIA labels)

---

### Task 3.4: Implement Web Component Wrapper

**Status:** `[ ]` Pending

**Description:**  
Create a Custom Element wrapper for embedding in any HTML page.

**Files to Create:**
- `packages/login-ui/src/web-component/auth-login.ts`

**Custom Element Definition:**
```typescript
class AuthLoginElement extends HTMLElement {
  static observedAttributes = [
    "bff_url",
    "tenant_slug",
    "redirect_url",
    "logo_url",
    "theme_primary"
  ];

  connectedCallback() {
    // Mount React component
  }

  disconnectedCallback() {
    // Cleanup
  }

  attributeChangedCallback(name: string, oldVal: string, newVal: string) {
    // Update props
  }
}

customElements.define("auth-login", AuthLoginElement);
```

**Usage:**
```html
<script src="https://auth.yoursaas.com/component/auth-login.js"></script>
<auth-login
  bff_url="https://auth.yoursaas.com"
  tenant_slug="acme-corp"
  redirect_url="/dashboard"
  logo_url="https://cdn.acme.com/logo.png"
></auth-login>
```

**Acceptance Criteria:**
- [ ] Custom Element registers successfully
- [ ] Attributes map to React props
- [ ] Events bubble to DOM
- [ ] Works in Shadow DOM
- [ ] Build produces standalone JS bundle

---

### Task 3.5: Implement Theme System

**Status:** `[ ]` Pending

**Description:**  
Create a theming system for white-labelling support.

**Files to Create:**
- `packages/login-ui/src/styles/theme.ts`
- `packages/login-ui/src/styles/variables.css`

**Theme Interface:**
```typescript
interface ThemeConfig {
  primary?: string;      // Primary brand color
  background?: string;   // Form background
  text?: string;         // Text color
  error?: string;        // Error color
  borderRadius?: string; // Border radius
  fontFamily?: string;   // Font family
}
```

**CSS Variables:**
```css
:root {
  --auth-primary: var(--theme-primary, #2E75B6);
  --auth-background: var(--theme-background, #FFFFFF);
  --auth-text: var(--theme-text, #333333);
  --auth-error: var(--theme-error, #DC3545);
  --auth-border-radius: var(--theme-border-radius, 8px);
  --auth-font-family: var(--theme-font-family, system-ui, sans-serif);
}
```

**Acceptance Criteria:**
- [ ] Theme applies via CSS variables
- [ ] Default theme is professional/neutral
- [ ] Theme prop overrides defaults
- [ ] All colors configurable
- [ ] Theme persists across components

---

### Task 3.6: Implement CustomEvent Emissions

**Status:** `[ ]` Pending

**Description:**  
Emit DOM CustomEvents for host application integration per Architecture Spec Section 7.3.

**Events to Emit:**
```typescript
const AUTH_EVENTS = [
  "auth:login-success",
  "auth:login-error",
  "auth:logout",
  "auth:token-refresh",
  "auth:session-expired"
];
```

**Event Payloads:**
```typescript
// auth:login-success
{
  user: { id, email, role, tenant_id, tenant_name },
  access_token: string
}

// auth:login-error
{
  code: string,
  message: string
}

// auth:logout
{
  user_id: string
}

// auth:token-refresh
{
  access_token: string,
  expires_in: number
}

// auth:session-expired
{}
```

**Acceptance Criteria:**
- [ ] All events emit at correct times
- [ ] Events bubble to document
- [ ] Event detail contains correct payload
- [ ] Host apps can addEventListener successfully

---

## Checkpoint 03: Login UI Complete

**Trigger:** All Phase 3 tasks completed and verified

**Actions:**
```bash
# Git checkpoint
git add -A
git commit -m "Checkpoint 03: Login UI component complete"
git tag checkpoint_03

# Local backup
mkdir -p ../checkpoint_03
cp -r . ../checkpoint_03/

# GitHub push
git push origin main --tags
```

**Verification Checklist:**
- [ ] State machine transitions correctly
- [ ] Forms render and validate
- [ ] Web Component mounts in external HTML
- [ ] Theme applies correctly
- [ ] All events emit with correct payloads

---

## Phase 4: Testing

### Task 4.1: Unit Tests for Core Services

**Status:** `[ ]` Pending

**Description:**  
Create unit tests for password hashing, JWT, and RLS validation.

**Files to Create:**
- `packages/auth-bff/tests/unit/password.service.test.ts`
- `packages/auth-bff/tests/unit/token.service.test.ts`
- `packages/auth-bff/tests/unit/rls.test.ts`

**Test Cases:**

**Password Service:**
- [ ] Hash password returns Argon2id format
- [ ] Verify password returns true for correct password
- [ ] Verify password returns false for incorrect password
- [ ] Password policy rejects weak passwords
- [ ] Password policy accepts strong passwords

**Token Service:**
- [ ] Access token contains correct claims
- [ ] Access token expires in 15 minutes
- [ ] Token validation rejects expired tokens
- [ ] Token validation rejects malformed tokens
- [ ] Refresh token stored as hash

**RLS:**
- [ ] Tenant A cannot query Tenant B's users
- [ ] Tenant context set correctly
- [ ] RLS policy applies to all tenant-scoped tables

---

### Task 4.2: Integration Tests for Auth Flows

**Status:** `[ ]` Pending

**Description:**  
Create integration tests for complete authentication flows.

**Files to Create:**
- `packages/auth-bff/tests/integration/auth.flow.test.ts`
- `packages/auth-bff/tests/integration/admin.flow.test.ts`

**Test Flows:**

**Login Flow:**
- [ ] Valid credentials return 200 with tokens
- [ ] Invalid credentials return 401
- [ ] Disabled user returns 403
- [ ] Unknown tenant returns 404
- [ ] Refresh token set as HttpOnly cookie

**Token Refresh Flow:**
- [ ] Valid refresh token returns new access token
- [ ] Expired refresh token returns 401
- [ ] Revoked refresh token returns 401
- [ ] Refresh token rotates on use

**Logout Flow:**
- [ ] Logout revokes refresh token
- [ ] Logout clears cookie
- [ ] Subsequent refresh fails

---

### Task 4.3: License Limit Test

**Status:** `[ ]` Pending

**Description:**  
Create test to verify HTTP 402 on license limit exceeded.

**Files to Create:**
- `packages/auth-bff/tests/integration/license.test.ts`

**Test Scenario:**
1. Create tenant with max_users=2
2. Create 2 users successfully
3. Attempt to create 3rd user
4. Verify HTTP 402 response

**Acceptance Criteria:**
- [ ] HTTP 402 returned when limit reached
- [ ] Error code is LICENSE_LIMIT_REACHED
- [ ] Response includes max_users and current_users
- [ ] Disabled users don't count toward limit

---

### Task 4.4: Security Tests

**Status:** `[ ]` Pending

**Description:**  
Create tests for security controls: account lockout, cookie flags, CORS.

**Files to Create:**
- `packages/auth-bff/tests/integration/security.test.ts`

**Test Cases:**

**Account Lockout:**
- [ ] 5 failed logins lock account for 15 minutes
- [ ] 6th login returns ACCOUNT_LOCKED
- [ ] Lockout expires after 15 minutes
- [ ] Successful login resets failed_attempts

**Cookie Security:**
- [ ] Cookie has HttpOnly flag
- [ ] Cookie has Secure flag
- [ ] Cookie has SameSite=Strict
- [ ] Cookie path is /auth

**CORS:**
- [ ] Allowed origins receive CORS headers
- [ ] Non-allowed origins are rejected
- [ ] Preflight requests handled correctly

---

## Checkpoint 04: Testing Complete

**Trigger:** All Phase 4 tasks completed and verified

**Actions:**
```bash
# Git checkpoint
git add -A
git commit -m "Checkpoint 04: Testing complete"
git tag checkpoint_04

# Local backup
mkdir -p ../checkpoint_04
cp -r . ../checkpoint_04/

# GitHub push
git push origin main --tags
```

**Verification Checklist:**
- [ ] Unit test coverage > 80%
- [ ] All integration tests pass
- [ ] License limit test passes
- [ ] Security tests pass
- [ ] No skipped tests

---

## Phase 5: GCP Deployment

### Task 5.1: Write Dockerfile for BFF

**Status:** `[ ]` Pending

**Description:**  
Create multi-stage Dockerfile for Auth BFF with non-root user.

**Files to Create:**
- `packages/auth-bff/Dockerfile`
- `packages/auth-bff/.dockerignore`

**Dockerfile Requirements:**
```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
# Install dependencies, build TypeScript

# Stage 2: Runtime
FROM node:20-alpine AS runtime
# Non-root user, minimal image
# Health check
```

**Acceptance Criteria:**
- [ ] Multi-stage build
- [ ] Runs as non-root user
- [ ] Image size < 200MB
- [ ] Health check configured
- [ ] No dev dependencies in final image

---

### Task 5.2: Write Cloud Build CI/CD Pipeline

**Status:** `[ ]` Pending

**Description:**  
Create cloudbuild.yaml for automated CI/CD.

**Files to Create:**
- `cloudbuild.yaml`

**Pipeline Steps:**
1. Run tests
2. Build Docker image
3. Push to Artifact Registry
4. Run Prisma migrations
5. Deploy to Cloud Run

**Acceptance Criteria:**
- [ ] Tests run on every push
- [ ] Image pushed to Artifact Registry
- [ ] Migrations run before deployment
- [ ] Zero-downtime deployment
- [ ] Build logs to Cloud Logging

---

### Task 5.3: Write Terraform Modules

**Status:** `[ ]` Pending

**Description:**  
Create Terraform modules for all GCP infrastructure.

**Files to Create:**
- `infra/main.tf`
- `infra/modules/cloud-run/main.tf`
- `infra/modules/cloud-run/variables.tf`
- `infra/modules/cloud-run/outputs.tf`
- `infra/modules/cloud-sql/main.tf`
- `infra/modules/cloud-sql/variables.tf`
- `infra/modules/cloud-sql/outputs.tf`
- `infra/modules/secrets/main.tf`
- `infra/modules/secrets/variables.tf`
- `infra/modules/secrets/outputs.tf`
- `infra/envs/dev/main.tf`
- `infra/envs/prod/main.tf`

**Resources to Create:**
- Cloud SQL instance (PostgreSQL 15)
- Cloud Run service
- VPC connector
- Secret Manager secrets
- Service account
- Cloud Armor policy

**Acceptance Criteria:**
- [ ] `terraform plan` shows expected changes
- [ ] `terraform apply` creates all resources
- [ ] Cloud SQL has private IP only
- [ ] Cloud Run connects to Cloud SQL via VPC
- [ ] Secrets referenced from Secret Manager

---

### Task 5.4: Configure Cloud Armor WAF Rules

**Status:** `[ ]` Pending

**Description:**  
Configure Cloud Armor security policies and rate limiting.

**Files to Create:**
- `infra/modules/cloud-armor/main.tf`

**Rules to Configure:**
- OWASP Top 10 preconfigured ruleset
- Rate limiting: 1000 requests/minute per IP
- Geographic restrictions (optional)
- Custom rules for auth endpoints

**Acceptance Criteria:**
- [ ] OWASP rules applied
- [ ] Rate limiting enforced at edge
- [ ] Security policy attached to load balancer
- [ ] Blocked requests logged

---

## Checkpoint 05: GCP Deployment Complete

**Trigger:** All Phase 5 tasks completed and verified

**Actions:**
```bash
# Git checkpoint
git add -A
git commit -m "Checkpoint 05: GCP deployment complete"
git tag checkpoint_05

# Local backup
mkdir -p ../checkpoint_05
cp -r . ../checkpoint_05/

# GitHub push
git push origin main --tags
```

**Post-Deploy Verification:**
- [ ] Health endpoint returns 200
- [ ] TLS certificate valid
- [ ] CORS enforcement working
- [ ] Login flow end-to-end works
- [ ] HttpOnly cookie flags correct
- [ ] Token refresh works
- [ ] JWKS endpoint accessible
- [ ] License limit enforced
- [ ] Audit logs in BigQuery
- [ ] Cloud Armor rate limiting works

---

## Quick Reference: Checkpoint Commands

### Create Checkpoint
```bash
# Git commit and tag
git add -A
git commit -m "Checkpoint XX: Description"
git tag checkpoint_XX

# Local backup
mkdir -p ../checkpoint_XX
cp -r . ../checkpoint_XX/

# GitHub push
git push origin main --tags
```

### Rollback to Checkpoint
```bash
# Option 1: Git checkout
git checkout checkpoint_XX

# Option 2: Restore from backup
rm -rf ./*
cp -r ../checkpoint_XX/* ./
```

### List Checkpoints
```bash
git tag -l "checkpoint_*"
```

---

## Document Status

| Phase | Status | Checkpoint |
|-------|--------|------------|
| Phase 1: Database | `[ ]` Pending | checkpoint_01 |
| Phase 2: Auth BFF | `[ ]` Pending | checkpoint_02 |
| Phase 3: Login UI | `[ ]` Pending | checkpoint_03 |
| Phase 4: Testing | `[ ]` Pending | checkpoint_04 |
| Phase 5: GCP Deploy | `[ ]` Pending | checkpoint_05 |

**Next Action:** Review documents and begin Phase 1, Task 1.1

---

**Jai Jagannath!**
