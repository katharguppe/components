# SaaS Multi-Tenant Login Component - Implementation Plan

**Document Version:** 1.0  
**Date:** March 2026  
**Classification:** Confidential — Internal  
**Jai Jagannath**

---

## 1. Executive Summary

This document provides a comprehensive implementation plan for the SaaS Multi-Tenant Login Component. The implementation follows a phased approach with clear checkpoints for verification at each stage. The system is designed for cloud-native deployment on Google Cloud Platform (GCP) with complete local development support via Docker Compose.

### Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| API Framework | Express 4 / Fastify 4 | Mature ecosystem, TypeScript support |
| ORM | Prisma | Type-safe database access, migration management |
| Password Hashing | Argon2id | OWASP recommended, GPU/side-channel resistant |
| JWT Algorithm | RS256 | Asymmetric, supports public key verification |
| Database | PostgreSQL 15 | RLS support, Cloud SQL compatible |
| Deployment | Cloud Run | Auto-scaling, pay-per-use, VPC integration |

---

## 2. Project Structure

```
saas-auth/
├── packages/
│   ├── auth-bff/                    # Node.js BFF API
│   │   ├── src/
│   │   │   ├── routes/              # Express route handlers
│   │   │   │   ├── auth.routes.ts
│   │   │   │   ├── admin.routes.ts
│   │   │   │   └── operator.routes.ts
│   │   │   ├── middleware/
│   │   │   │   ├── auth.middleware.ts    # JWT validation
│   │   │   │   ├── tenant.middleware.ts  # Tenant resolution
│   │   │   │   └── ratelimit.middleware.ts
│   │   │   ├── services/
│   │   │   │   ├── token.service.ts     # JWT issuance
│   │   │   │   ├── password.service.ts  # Argon2id
│   │   │   │   └── audit.service.ts
│   │   │   ├── db/
│   │   │   │   ├── prisma/schema.prisma
│   │   │   │   └── migrations/
│   │   │   └── index.ts
│   │   ├── tests/
│   │   │   ├── unit/
│   │   │   └── integration/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── login-ui/                    # React Login Component
│       ├── src/
│       │   ├── components/
│       │   │   ├── LoginForm.tsx
│       │   │   ├── ForgotPassword.tsx
│       │   │   └── ResetPassword.tsx
│       │   ├── hooks/
│       │   │   ├── useAuthMachine.ts    # State machine
│       │   │   └── useApi.ts
│       │   ├── web-component/
│       │   │   └── auth-login.ts        # Custom Element wrapper
│       │   └── stub/
│       │       └── StubApp.tsx          # Local testing harness
│       ├── vite.config.ts
│       └── package.json
├── infra/                           # Terraform
│   ├── modules/
│   │   ├── cloud-run/
│   │   ├── cloud-sql/
│   │   └── secrets/
│   ├── envs/
│   │   ├── dev/
│   │   └── prod/
│   └── main.tf
├── docker-compose.yml               # Local stub orchestration
├── .env.example
├── package.json                     # Monorepo root (npm workspaces)
├── cloudbuild.yaml                  # GCP CI/CD
└── README.md
```

---

## 3. Implementation Phases

### Phase 1: Database & Migrations (Estimated: 2-3 days)

**Objective:** Establish the data layer with proper tenant isolation.

| Task | Description | Deliverable |
|------|-------------|-------------|
| 1.1 | Implement SQL migration files for all tables | `packages/auth-bff/prisma/migrations/` |
| 1.2 | Implement RLS policies | Migration with RLS SQL |
| 1.3 | Implement seed script for local development | `packages/auth-bff/prisma/seed.ts` |

**Checkpoint 1 Criteria:**
- [ ] All migrations run successfully against local PostgreSQL
- [ ] RLS policies verified (tenant isolation test passes)
- [ ] Seed script creates all test accounts
- [ ] Prisma Client generates without errors

---

### Phase 2: Auth BFF Service (Estimated: 5-7 days)

**Objective:** Build the core authentication API with all security controls.

| Task | Description | Deliverable |
|------|-------------|-------------|
| 2.1 | Bootstrap Express/Fastify project with TypeScript, Zod, Prisma | Project scaffold |
| 2.2 | Implement all API endpoints | `src/routes/*.routes.ts` |
| 2.3 | Implement JWT issuance and validation (RS256) | `src/services/token.service.ts` |
| 2.4 | Implement Argon2id password hashing | `src/services/password.service.ts` |
| 2.5 | Implement rate limiting middleware | `src/middleware/ratelimit.middleware.ts` |
| 2.6 | Implement audit event logger | `src/services/audit.service.ts` |
| 2.7 | Implement tenant resolution middleware | `src/middleware/tenant.middleware.ts` |
| 2.8 | Implement license enforcement | User creation logic |

**Checkpoint 2 Criteria:**
- [ ] All API endpoints return correct responses
- [ ] JWT tokens validate correctly
- [ ] Password hashing meets Argon2id parameters
- [ ] Rate limiting blocks excessive requests
- [ ] Audit events written to database
- [ ] License limit returns HTTP 402

---

### Phase 3: Login UI Component (Estimated: 4-5 days)

**Objective:** Create the embeddable React login component.

| Task | Description | Deliverable |
|------|-------------|-------------|
| 3.1 | Bootstrap Vite + React + TypeScript project | Project scaffold |
| 3.2 | Implement state machine (useReducer) | `src/hooks/useAuthMachine.ts` |
| 3.3 | Implement Login, Forgot Password, Reset Password forms | `src/components/*.tsx` |
| 3.4 | Implement Web Component wrapper | `src/web-component/auth-login.ts` |
| 3.5 | Implement theme prop for white-labelling | Theme system |
| 3.6 | Emit all CustomEvents | Event emission |

**Checkpoint 3 Criteria:**
- [ ] State machine transitions correctly
- [ ] Forms validate input properly
- [ ] Web Component mounts in external HTML
- [ ] Theme changes apply correctly
- [ ] All events emit with correct payloads

---

### Phase 4: Testing (Estimated: 3-4 days)

**Objective:** Comprehensive test coverage for security and functionality.

| Task | Description | Deliverable |
|------|-------------|-------------|
| 4.1 | Unit tests: password, JWT, RLS | `tests/unit/*.test.ts` |
| 4.2 | Integration tests: full auth flows | `tests/integration/*.test.ts` |
| 4.3 | License limit test | License test file |
| 4.4 | Security tests: lockout, cookies, CORS | Security test files |

**Checkpoint 4 Criteria:**
- [ ] Unit test coverage > 80%
- [ ] Integration tests pass for all flows
- [ ] License limit test returns 402
- [ ] Account lockout triggers after 5 failures

---

### Phase 5: GCP Deployment (Estimated: 3-4 days)

**Objective:** Production-ready infrastructure on GCP.

| Task | Description | Deliverable |
|------|-------------|-------------|
| 5.1 | Write Dockerfile for BFF | `packages/auth-bff/Dockerfile` |
| 5.2 | Write cloudbuild.yaml for CI/CD | `cloudbuild.yaml` |
| 5.3 | Write Terraform modules | `infra/modules/*/main.tf` |
| 5.4 | Configure Cloud Armor WAF rules | Terraform security policies |

**Checkpoint 5 Criteria:**
- [ ] Docker image builds successfully
- [ ] Cloud Build pipeline runs end-to-end
- [ ] Terraform applies without errors
- [ ] All post-deploy verification checks pass

---

## 4. Security Requirements Summary

### 4.1 Password Policy
- **Minimum Length:** 10 characters
- **Complexity:** Uppercase, lowercase, digit, special character
- **Algorithm:** Argon2id
- **Parameters:** memory=65536 KiB, iterations=3, parallelism=4
- **History:** Last 5 passwords cannot be reused

### 4.2 JWT Configuration
- **Algorithm:** RS256
- **Access Token TTL:** 15 minutes
- **Refresh Token TTL:** 7 days (sliding)
- **Claims:** sub, tid, role, iss, aud, iat, exp

### 4.3 Rate Limiting
| Endpoint | Limit | Lockout |
|----------|-------|---------|
| /auth/login | 10 req/min/IP | 15 min after 5 failures |
| /auth/forgot-password | 3 req/hour/email | Silent fail |
| /auth/refresh | 60 req/min/token | Token revoked |
| Admin endpoints | 120 req/min/tenant | 429 response |

### 4.4 Cookie Security
- **HttpOnly:** true
- **Secure:** true
- **SameSite:** Strict
- **Path:** /auth

---

## 5. Environment Variables

```bash
# Database
DATABASE_URL=postgresql://authuser:authpass@localhost:5432/authdb

# JWT
JWT_PRIVATE_KEY_PATH=./keys/private.pem
JWT_PUBLIC_KEY_PATH=./keys/public.pem
JWT_ACCESS_TOKEN_TTL=900
JWT_REFRESH_TOKEN_TTL=604800
JWT_ISSUER=https://auth.yoursaas.com
JWT_AUDIENCE=saas-platform

# App
PORT=3001
NODE_ENV=development
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# Email
EMAIL_PROVIDER=smtp
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_FROM=noreply@yoursaas.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_LOGIN_MAX=10

# Operator Bootstrap
OPERATOR_EMAIL=operator@yoursaas.com
OPERATOR_PASSWORD=Operator@Secure123!
```

---

## 6. Test Data Accounts

| Account Type | Email | Password | Tenant |
|--------------|-------|----------|--------|
| Platform Operator | operator@yoursaas.com | Operator@Secure123! | — |
| Tenant Admin (Acme) | admin@acme.com | Admin@Acme123! | acme-corp |
| Tenant User (Acme) | alice@acme.com | User@Acme123! | acme-corp |
| Tenant User (Acme) | bob@acme.com | User@Acme123! | acme-corp |
| Tenant Admin (Beta) | admin@betaorg.com | Admin@Beta123! | beta-org |
| Tenant User (Beta) | carol@betaorg.com | User@Beta123! | beta-org |
| Disabled User | disabled@acme.com | User@Acme123! | acme-corp |

---

## 7. API Endpoints Summary

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | /auth/login | No | — | Authenticate user |
| POST | /auth/logout | Access Token | Any | Revoke session |
| POST | /auth/refresh | Refresh Cookie | Any | Refresh access token |
| POST | /auth/register | No | — | Self-registration |
| POST | /auth/forgot-password | No | — | Initiate password reset |
| POST | /auth/reset-password | OTP token | — | Complete password reset |
| GET | /auth/me | Access Token | Any | Current user profile |
| GET | /admin/users | Access Token | Admin | List tenant users |
| POST | /admin/users | Access Token | Admin | Create user |
| PATCH | /admin/users/:id | Access Token | Admin | Update user |
| DELETE | /admin/users/:id | Access Token | Admin | Disable user |
| GET | /operator/tenants | Access Token | Operator | List tenants |
| POST | /operator/tenants | Access Token | Operator | Create tenant |
| PATCH | /operator/tenants/:id | Access Token | Operator | Update tenant |

---

## 8. Error Response Format

All errors must return structured JSON:

```json
{
  "code": "ERROR_CODE",
  "message": "Human-readable message",
  "details": {}
}
```

### Standard Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| INVALID_CREDENTIALS | 401 | Wrong email/password |
| ACCOUNT_LOCKED | 403 | Account temporarily locked |
| TENANT_NOT_FOUND | 404 | Tenant slug invalid |
| LICENSE_LIMIT_REACHED | 402 | Max users reached |
| EMAIL_ALREADY_EXISTS | 409 | Duplicate email |
| TOKEN_EXPIRED | 401 | JWT expired |
| TOKEN_INVALID | 401 | JWT malformed |
| RATE_LIMITED | 429 | Too many requests |

---

## 9. GCP Infrastructure Components

| Service | Component | Configuration |
|---------|-----------|---------------|
| Cloud Run | Auth BFF | Min: 1, Max: 10 instances |
| Cloud SQL | PostgreSQL 15 | Private IP, PITR enabled |
| Secret Manager | Credentials | JWT key, DB password, SMTP |
| Cloud Load Balancing | TLS Termination | Managed SSL cert |
| Cloud Logging + BigQuery | Audit Log | Log sink for compliance |
| Cloud Armor | WAF | Rate limiting, OWASP rules |
| VPC | Network | Private service connect |

---

## 10. Checkpoint Strategy

### Local Checkpoints
Each checkpoint creates a git tag and a local directory backup:

```bash
# Create checkpoint
git add -A
git commit -m "Checkpoint XX: Description"
git tag checkpoint_XX
mkdir -p ../checkpoint_XX
cp -r . ../checkpoint_XX/
```

### GitHub Checkpoints
Push to GitHub with tags:

```bash
git push origin main --tags
```

### Rollback Procedure
```bash
# Rollback to checkpoint
git checkout checkpoint_XX
# Or restore from local backup
rm -rf ./*
cp -r ../checkpoint_XX/* ./
```

---

## 11. Non-Functional Requirements

| Category | Requirement | Measurement |
|----------|-------------|-------------|
| Availability | 99.9% monthly uptime | GCP SLA + alerting |
| Latency | P95 login < 400ms | Cloud Trace |
| Scalability | 500 concurrent logins/tenant | k6 load test |
| Security | Zero critical CVEs | Snyk scan |
| Data Retention | 7 years audit logs | BigQuery policy |
| Recovery | RTO < 1hr, RPO < 15min | PITR config |

---

## 12. Development Workflow

### Initial Setup
```bash
# Clone and install
git clone <repo-url> saas-auth && cd saas-auth
cp .env.example .env
npm install

# Generate JWT keys
mkdir -p keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem

# Start infrastructure
docker compose up -d

# Run migrations
cd packages/auth-bff
npx prisma migrate dev --name init
npx prisma db seed

# Start services
npm run dev  # BFF on :3001
cd ../login-ui && npm run dev  # UI on :5173
```

### Daily Development
```bash
# Start infrastructure
docker compose up -d

# Run tests
npm test

# Run specific test file
npm test -- path/to/test.ts
```

---

## 13. Next Steps

1. Review this implementation plan
2. Review task.md for detailed task breakdown
3. Begin Phase 1: Database & Migrations
4. Create Checkpoint 01 after Phase 1 completion

---

**Document Status:** Ready for Review  
**Next Action:** Create task.md with detailed task breakdown
