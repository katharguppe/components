# Master Prompt -- Sprint 03: Client Module

## Context

```
Project  : Travel SaaS — Multi-Tenant Authentication (saas-auth)
Root     : D:\vaikunta-ekadashi\Components\saas-auth
Sprint   : 03 — Client Module (clients, groups, membership)
Status   : COMPLETE — 28/28 tests + 69/69 e2e passing
Checkpoints: CHECKPOINT_04.md, CHECKPOINT_05.md
```

Stack: Node.js 20, TypeScript, Express, Prisma ORM (raw SQL for tenant schemas),
PostgreSQL 15, RS256 JWT, Zod validation, Docker Compose.

## Resume Instructions

1. Read `CHECKPOINT_05.md` — it is the authoritative resume point for Sprint 03
2. Run `node test-client-routes.js` — expect 28/28 (30 total including setup steps)
3. Run `node test-e2e.js` — expect 69/69
4. State current status. Do not touch any source file unless a test fails.

## Sprint 03 Deliverables (reference)

| File | Purpose |
|------|---------|
| `db/migrations/tenant/003_client_module.sql` | 4 tables: clients, client_preferences, groups, group_members + RLS + triggers |
| `packages/auth-bff/src/db/tenant-provisioner.ts` | `enableClientModuleForTenant(slug)` — idempotent provisioner |
| `packages/auth-bff/src/schemas/client.schema.ts` | All Zod schemas for client + group endpoints |
| `packages/auth-bff/src/routes/client.routes.ts` | 8 client endpoints including POST /_provision |
| `packages/auth-bff/src/routes/group.routes.ts` | 8 group + membership endpoints |
| `packages/auth-bff/src/app.ts` | groupRoutes mounted BEFORE clientRoutes (static before wildcard) |
| `test-client-routes.js` | 28 integration tests |

## Route Prefix

All Sprint 03 routes: `/api/v1/clients` and `/api/v1/clients/groups`

## Key Facts

- **Provision is idempotent**: `POST /api/v1/clients/_provision` is safe to call multiple times (`CREATE TABLE IF NOT EXISTS`)
- **Mobile number key**: clients PK is E.164 mobile (`^\\+[1-9]\\d{7,14}$`) — must be URL-encoded in path params
- **Prisma raw + UUID**: all UUID columns need `$1::uuid` cast in parameterized queries — Prisma sends all params as `text`
- **Route mount order**: `groupRoutes` MUST be mounted before `clientRoutes` — `/groups` is a static segment, `/:mobile` is a wildcard
- **Soft deletes**: clients → `status = 'inactive'`, groups → `is_active = false`
- **Preferences body**: `PUT /preferences` expects `{ preferences: { key: value } }` — nested under `preferences` key
- **group_code**: auto-generated kebab-slug + 4-char random suffix — use this as the identifier for all group operations
- **No search_path per request**: all SQL uses `"tenant_{slug}".tablename` fully qualified

## Seeded Accounts

| Role | Email | Password | Tenant slug |
|------|-------|----------|-------------|
| admin | admin@acme.com | Admin@Acme123! | acme-corp |

Beta-org does NOT have the client module provisioned — calling client endpoints with beta-org header will 500 (unprovisioned schema). Provision first.

## Known Gotchas

- `splitStatements()` in `tenant-provisioner.ts` skips `--` comment lines — fixed in Sprint 03 (comments had `;` inside them)
- `::uuid` cast required on ALL uuid-typed columns in raw Prisma queries
- Cross-tenant client access is NOT enforced (BUG-001) — `requireSameTenant` not wired
- Preferences upsert body is `{ preferences: { ... } }` not flat

## Regression Gate

```bash
node test-client-routes.js   # 28/28 (30 total)
node test-e2e.js             # 69/69
```

## Git Format

```
[SPRINT-03] verb: what changed
```
