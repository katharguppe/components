# Master Prompt -- Sprint 02: Admin + Operator Routes

## Context

```
Project  : Travel SaaS — Multi-Tenant Authentication (saas-auth)
Root     : D:\vaikunta-ekadashi\Components\saas-auth
Sprint   : 02 — Admin + Operator Routes
Status   : COMPLETE (do not re-implement — use for resume/debug only)
Checkpoint: CHECKPOINT_02.md, CHECKPOINT_02_STATUS.md
```

Stack: Node.js 20, TypeScript, Express, Prisma ORM, PostgreSQL 15 (Docker),
Argon2id, RS256 JWT, Zod validation, Docker Compose.

## Resume Instructions

1. Read `CHECKPOINT_02.md` — understand what is complete
2. Read `CHECKPOINT_02_STATUS.md` — understand any open items
3. Run `node test-e2e.js` — confirm Sprint 01 + 02 sections green
4. Run `node test-admin-routes.js` + `node test-operator-routes.js`
5. State current status before touching any file

## Sprint 02 Deliverables (reference)

| File | Purpose |
|------|---------|
| `packages/auth-bff/src/routes/admin.routes.ts` | GET/POST/PATCH/DELETE /admin/users, GET /admin/license |
| `packages/auth-bff/src/routes/operator.routes.ts` | Full tenant CRUD + suspend/activate + stats |
| `packages/auth-bff/src/services/license.service.ts` | User count vs maxUsers check |

## Route Prefixes (critical)

| Route group | Mounted at | NOT at |
|-------------|-----------|--------|
| Admin | `/admin` | `/api/v1/admin` |
| Operator | `/operator` | `/api/v1/operator` |
| Auth | `/auth` | `/api/v1/auth` |
| Client (Sprint 03) | `/api/v1/clients` | `/clients` |

## Key Facts

- **Admin routes**: tenant enforced via RLS (DB context), not by JWT/header cross-check — see BUG-001
- **Operator role check**: `operatorOnly` middleware — operator can access any tenant
- **Admin role check**: `adminOnly` middleware — admin + operator pass, user role fails (403)
- **Tenant isolation for admin**: JWT tenant wins via RLS; passing a foreign X-Tenant-Slug header returns 200 but scoped to the DB RLS context
- **Create tenant**: triggers schema provisioning for `tenant_{slug}` — sets up base tables
- **User disable**: soft-delete (sets `status = 'inactive'`), never hard-delete
- **License**: `GET /admin/license` returns `{ used, max, available }` from `prisma.user.count`

## Seeded Accounts (same as Sprint 01)

| Role | Email | Password | Tenant slug |
|------|-------|----------|-------------|
| operator | operator@yoursaas.com | Operator@Secure123! | system |
| admin | admin@acme.com | Admin@Acme123! | acme-corp |
| user | alice@acme.com | User@Acme123! | acme-corp |
| admin | admin@betaorg.com | Admin@Beta123! | beta-org |

## Known Gotchas

- Route prefix is `/admin` not `/api/v1/admin` — the individual test scripts use the correct path; test-e2e.js also uses bare `/admin`
- `operatorOnly` middleware checks `user.role === 'operator'` — admin token on `/operator` routes returns 403
- Tenant create requires unique slug — 409 on duplicate
- `adminOnly` passes both `admin` and `operator` roles

## Regression Gate

```bash
node test-admin-routes.js
node test-operator-routes.js
node test-e2e.js   # Sprint 01 + 02A + 02B: 35 tests must pass
```

## Git Format

```
[SPRINT-02] verb: what changed
```
