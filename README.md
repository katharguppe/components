# SaaS Multi-Tenant Login Component

A cloud-native, multi-tenant authentication system designed for deployment on Google Cloud Platform (GCP).

## Overview

This project implements a complete authentication solution for SaaS applications with:

- **Three-tier principal model**: Platform Operator → Company Admin → End User
- **Tenant isolation**: Row-Level Security (RLS) at database level
- **Modern security**: Argon2id password hashing, RS256 JWT tokens
- **Backend-For-Frontend (BFF)**: Centralized auth API for multiple host applications
- **Embeddable UI**: React component with Web Component wrapper

## Quick Start

### Prerequisites

- Node.js 20+
- Docker Desktop 4.x (or Docker Engine + Compose v2)
- Git

### Initial Setup

```bash
# Clone the repository
git clone <repo-url> saas-auth
cd saas-auth

# Copy environment file
cp .env.example .env

# Install dependencies
npm install

# Generate JWT keys
mkdir -p keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem

# Start Docker services (PostgreSQL + Mailhog)
npm run docker:up

# Wait for services to be healthy
docker compose ps

# Run database migrations and seed data
cd packages/auth-bff
npx prisma migrate dev --name init
npx prisma db seed
cd ../..

# Start the Auth BFF (in one terminal)
npm run dev

# Start the Login UI (in another terminal)
npm run dev:ui
```

### Access Points

| Service | URL |
|---------|-----|
| Login UI (Stub App) | http://localhost:5173 |
| Auth BFF API | http://localhost:3001 |
| BFF Health Check | http://localhost:3001/health |
| Mailhog (Email UI) | http://localhost:8025 |
| Prisma Studio | `npm run db:studio` → http://localhost:5555 |

## Test Accounts

| Account Type | Email | Password | Tenant |
|--------------|-------|----------|--------|
| Platform Operator | operator@yoursaas.com | Operator@Secure123! | — |
| Tenant Admin (Acme) | admin@acme.com | Admin@Acme123! | acme-corp |
| Tenant User (Acme) | alice@acme.com | User@Acme123! | acme-corp |
| Tenant User (Acme) | bob@acme.com | User@Acme123! | acme-corp |
| Tenant Admin (Beta) | admin@betaorg.com | Admin@Beta123! | beta-org |
| Tenant User (Beta) | carol@betaorg.com | User@Beta123! | beta-org |
| Disabled User | disabled@acme.com | User@Acme123! | acme-corp |

## Project Structure

```
saas-auth/
├── packages/
│   ├── auth-bff/           # Node.js BFF API
│   │   ├── src/
│   │   │   ├── routes/     # Express route handlers
│   │   │   ├── middleware/ # Auth, tenant, rate limiting
│   │   │   ├── services/   # Token, password, audit
│   │   │   └── db/         # Prisma client
│   │   └── prisma/         # Schema and migrations
│   └── login-ui/           # React Login Component
│       ├── src/
│       │   ├── components/ # Login forms
│       │   ├── hooks/      # State machine
│       │   └── web-component/ # Custom Element wrapper
│       └── vite.config.ts
├── infra/                  # Terraform modules
├── docker-compose.yml      # Local development
└── cloudbuild.yaml         # GCP CI/CD
```

## API Endpoints

### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /auth/login | Authenticate user |
| POST | /auth/register | Self-registration |
| POST | /auth/forgot-password | Request password reset |
| POST | /auth/reset-password | Complete password reset |
| GET | /.well-known/jwks.json | JWT public keys |

### Authenticated Endpoints

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | /auth/logout | Any | Revoke session |
| POST | /auth/refresh | Any | Refresh access token |
| GET | /auth/me | Any | Current user profile |
| GET | /admin/users | Admin | List tenant users |
| POST | /admin/users | Admin | Create user |
| PATCH | /admin/users/:id | Admin | Update user |
| DELETE | /admin/users/:id | Admin | Disable user |
| GET | /operator/tenants | Operator | List all tenants |
| POST | /operator/tenants | Operator | Create tenant |
| PATCH | /operator/tenants/:id | Operator | Update tenant |

## Development

### Available Scripts

```bash
# Development
npm run dev           # Start BFF in dev mode
npm run dev:ui        # Start UI in dev mode

# Building
npm run build         # Build all packages

# Testing
npm run test          # Run all tests
npm run test:coverage # Run with coverage

# Database
npm run db:migrate    # Run migrations
npm run db:seed       # Seed test data
npm run db:studio     # Open Prisma Studio

# Docker
npm run docker:up     # Start containers
npm run docker:down   # Stop containers
npm run docker:logs   # View logs
```

### Testing API with cURL

```bash
# Login
curl -X POST http://localhost:3001/auth/login \
  -H 'Content-Type: application/json' \
  -c cookies.txt \
  -d '{
    "email": "admin@acme.com",
    "password": "Admin@Acme123!",
    "tenant_slug": "acme-corp"
  }'

# Get current user
curl http://localhost:3001/auth/me \
  -H 'Authorization: Bearer <access_token>'

# Token refresh
curl -X POST http://localhost:3001/auth/refresh \
  -b cookies.txt \
  -c cookies.txt
```

## Security Features

- **Password Hashing**: Argon2id (memory=64MB, iterations=3, parallelism=4)
- **JWT Algorithm**: RS256 with rotating keys
- **Token TTL**: Access=15min, Refresh=7 days
- **Rate Limiting**: Per-endpoint limits with account lockout
- **Cookie Security**: HttpOnly, Secure, SameSite=Strict
- **Tenant Isolation**: PostgreSQL Row-Level Security

## Deployment

See `implementation.md` and `task.md` for detailed deployment instructions.

### GCP Services Used

- Cloud Run (BFF)
- Cloud SQL PostgreSQL (Database)
- Secret Manager (Credentials)
- Cloud Armor (WAF)
- Cloud Build (CI/CD)
- Firebase Hosting (UI)

## Documentation

- [`implementation.md`](./implementation.md) - Comprehensive implementation plan
- [`task.md`](./task.md) - Detailed task breakdown with checkpoints

## License

UNLICENSED - Internal use only.

---

**Jai Jagannath!**
