# Master Prompt -- Sprint 01: Auth Foundation

## Context

```
Project  : Travel SaaS — Multi-Tenant Authentication (saas-auth)
Root     : D:\vaikunta-ekadashi\Components\saas-auth
Sprint   : 01 — Auth Foundation
Status   : COMPLETE (do not re-implement — use for resume/debug only)
Checkpoint: CHECKPOINT_01.md
```

Stack: Node.js 20, TypeScript, Express, Prisma ORM, PostgreSQL 15 (Docker),
Argon2id password hashing, RS256 JWT (HttpOnly cookies), Zod validation,
Docker Compose (postgres + mailhog), npm workspaces monorepo.

## Resume Instructions

1. Read `CHECKPOINT_01.md` — understand what is complete and what is open
2. Read `CHECKPOINT_02.md` — understand Sprint 02 dependency
3. State current status before touching any file
4. Run `node test-e2e.js` — confirm Sprint 01 section is green before anything

## Sprint 01 Deliverables (reference)

| File | Purpose |
|------|---------|
| `packages/auth-bff/src/routes/auth.routes.ts` | Login, logout, refresh, forgot-password, reset-password, /me |
| `packages/auth-bff/src/middleware/auth.middleware.ts` | authenticate, requireRole, requireSameTenant |
| `packages/auth-bff/src/middleware/tenant.middleware.ts` | tenantResolver, requireTenant, operatorOnly, adminOnly |
| `packages/auth-bff/src/services/token.service.ts` | RS256 sign/verify |
| `packages/auth-bff/src/services/password.service.ts` | Argon2id hash/verify |
| `packages/auth-bff/src/services/audit.service.ts` | Audit log writes |
| `packages/auth-bff/src/routes/jwks.routes.ts` | /.well-known/jwks.json |
| `packages/auth-bff/prisma/seed.ts` | Platform seed — operator, acme-corp, beta-org |
| `db/migrations/` | Base schema |

## Scope

Auth routes and middleware ONLY. Do NOT touch admin, operator, or client routes.

## Key Facts

- **Login body**: `{ email, password, tenant_slug }` — `tenant_slug` must be in the body (Zod schema requires it, not just the header)
- **JWT keys**: `keys/private.pem` (RS256 sign) + `keys/public.pem` (verify) — generate with openssl, never commit
- **Token flow**: access_token (short-lived) in response body + refresh_token in HttpOnly cookie
- **Tenant resolution order**: `req.body.tenant_slug` → `req.headers['x-tenant-slug']` → `req.query.tenant_slug`
- **`requireSameTenant` is NOT wired** — see BUGS.md BUG-001 (security sprint backlog)
- **Auth route prefix**: `/auth/` (NOT `/api/v1/auth/`) — mounted at `/auth` in app.ts
- **MailHog** captures all email at http://localhost:8025 — no real email sent

## Seeded Accounts

| Role | Email | Password | Tenant slug |
|------|-------|----------|-------------|
| operator | operator@yoursaas.com | Operator@Secure123! | system |
| admin | admin@acme.com | Admin@Acme123! | acme-corp |
| user | alice@acme.com | User@Acme123! | acme-corp |
| admin | admin@betaorg.com | Admin@Beta123! | beta-org |

## Known Gotchas

- `tenant_slug` in login body — not just header
- Keys must exist before server starts — run `openssl genrsa -out keys/private.pem 2048` first
- `npm run dev --workspace=packages/auth-bff` — not bare `npm run dev`
- Docker must be up before starting the server — `docker compose up -d`

## Regression Gate

```bash
node test-e2e.js   # Sprint 01 section: 14 tests must pass
```

## Git Format

```
[SPRINT-01] verb: what changed
```
