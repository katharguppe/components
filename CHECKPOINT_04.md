# CHECKPOINT_04: Sprint 03 — Client Module Plan

**Date:** 2026-04-05
**Status:** PLAN — awaiting human approval before any code changes
**Author:** Audit session (Claude Sonnet 4.6)
**Methodology:** PDCA — Present plan, wait for approval, then act

---

## 1. Audit Findings: What Is In Place (Sprint 01/02)

### 1.1 Database (Phase 1 — 100% Complete)

| Table | Schema | RLS | Notes |
|-------|--------|-----|-------|
| `tenants` | public | No | Platform-level |
| `users` | public | Yes | `app.current_tenant_id` session var |
| `refresh_tokens` | public | Yes | Same RLS pattern |
| `auth_events` | public | Yes | Immutable audit log |
| `password_history` | public | No RLS | Accessed via user FK |
| `password_reset_tokens` | public | No RLS | Short-lived, userId-scoped |

**RLS mechanism:** `current_setting('app.current_tenant_id', true)::uuid`
set via `SELECT set_tenant_context('uuid')` before queries.
Reset via `RESET app.current_tenant_id` for operator access.

### 1.2 Auth BFF Service (Phase 2 — 100% Complete)

**22 endpoints across 4 route files:**

| File | Mount | Middleware stack |
|------|-------|-----------------|
| `auth.routes.ts` | `/auth` | tenantResolver → rateLimit |
| `jwks.routes.ts` | `/.well-known` | none |
| `admin.routes.ts` | `/admin` | tenantResolver → requireTenant → authenticate → requireRole('admin','operator') |
| `operator.routes.ts` | `/operator` | authenticate → operatorOnly |

**Services:** password (Argon2id), token (RS256 JWT), audit (`auth_events` table), license.

**Test pattern (`test-admin-routes.js`):**
- Vanilla Node.js `http.request` — no test framework
- Sequential async functions `testNN_description()`
- Shared mutable state (`adminAccessToken`, `testUserId`)
- `logTest(name, passed, details)` helper
- Summary printed + results saved to `*-test-results.json`
- Exits with code 1 on any failure
- Server health check at start, exits if down

### 1.3 Login UI (Phase 3 — 100% Complete)

React web component (`<auth-login>`) — not relevant to Sprint 03.

### 1.4 Infrastructure

```
docker-compose.yml:
  postgres:15-alpine  → localhost:5432 (authdb / authuser / authpass)
  mailhog             → SMTP :1025, Web UI :8025
  (redis commented out — future use)
```

**Connection URL:** `DATABASE_URL` in `.env` → standard Prisma client.
**Tenant-schema switching:** `prisma.$executeRawUnsafe(...)` already in use.

---

## 2. Sprint 03 Architecture Decision

### 2.1 Schema Strategy: Per-Tenant Schemas

Sprint 03 introduces **schema-per-tenant** for the client module.
This is separate from the public-schema approach used in Sprint 01/02.

```
Public schema (existing, unchanged)
  tenants, users, refresh_tokens, auth_events, ...

Per-tenant schemas (new in Sprint 03)
  tenant_acme_corp.clients
  tenant_acme_corp.client_preferences
  tenant_acme_corp.groups
  tenant_acme_corp.group_members

  tenant_beta_org.clients
  ...
```

**Why separate schemas for client data?**
- Client data is completely tenant-owned; no cross-tenant admin view needed.
- Enables true hard isolation for GDPR compliance (drop schema = full erasure).
- `SET search_path = tenant_{slug}` is the access control layer.
- RLS is added as a second layer (defence-in-depth per CLAUDE.md requirement).

**Schema naming convention:** `tenant_{slug_underscored}`
e.g., `acme-corp` → `tenant_acme_corp`

### 2.2 Tenant Provisioner Pattern

`enableClientModuleForTenant(tenantSlug: string)` will:
1. Derive schema name: `tenant_${slug.replace(/-/g, '_')}`
2. `CREATE SCHEMA IF NOT EXISTS tenant_{slug}`
3. Execute `db/migrations/tenant/003_client_module.sql` inside that schema
4. Grant `USAGE` on schema + `ALL` on tables to the DB user
5. Idempotent — safe to call multiple times

**Trigger strategy for existing tenants:** The test script calls
`enableClientModuleForTenant()` in its setup phase for test tenants.
A future operator endpoint (`POST /operator/tenants/:id/enable-client-module`)
can expose this for production use without touching Sprint 01/02 code.

---

## 3. ER Diagram — 4 New Tables (per-tenant schema)

```
┌─────────────────────────────────────────────────────────────────────┐
│  SCHEMA: tenant_{slug}                                              │
│                                                                     │
│  ┌─────────────────────────────┐                                    │
│  │ clients                     │                                    │
│  ├─────────────────────────────┤                                    │
│  │ mobile_number  VARCHAR(16)  │◄── PK  E.164: ^\+[1-9]\d{7,14}$  │
│  │ full_name      TEXT         │                                    │
│  │ email          TEXT         │    UNIQUE (nullable)               │
│  │ date_of_birth  DATE         │    nullable                        │
│  │ status         TEXT         │    active|inactive|blocked         │
│  │ created_at     TIMESTAMPTZ  │    DEFAULT now() UTC               │
│  │ updated_at     TIMESTAMPTZ  │                                    │
│  └──────────────┬──────────────┘                                    │
│                 │ 1                                                  │
│                 │ 1                                                  │
│  ┌──────────────▼──────────────┐                                    │
│  │ client_preferences          │                                    │
│  ├─────────────────────────────┤                                    │
│  │ mobile_number  VARCHAR(16)  │◄── PK + FK → clients.mobile_number│
│  │ preferences    JSONB        │    NOT NULL DEFAULT '{}'           │
│  │ created_at     TIMESTAMPTZ  │                                    │
│  │ updated_at     TIMESTAMPTZ  │                                    │
│  └─────────────────────────────┘                                    │
│                                                                     │
│  ┌─────────────────────────────┐                                    │
│  │ groups                      │                                    │
│  ├─────────────────────────────┤                                    │
│  │ id           UUID           │◄── PK  gen_random_uuid()          │
│  │ name         TEXT           │    NOT NULL                        │
│  │ group_code   TEXT           │    UNIQUE  kebab-slug-XXXX        │
│  │ description  TEXT           │    nullable                        │
│  │ is_active    BOOLEAN        │    DEFAULT true                    │
│  │ created_by   TEXT           │    user id from JWT (not FK)       │
│  │ created_at   TIMESTAMPTZ    │                                    │
│  │ updated_at   TIMESTAMPTZ    │                                    │
│  └──────────────┬──────────────┘                                    │
│                 │ 1                                                  │
│                 │ N                                                  │
│  ┌──────────────▼──────────────┐                                    │
│  │ group_members               │                                    │
│  ├─────────────────────────────┤                                    │
│  │ mobile_number  VARCHAR(16)  │◄── PK (composite) FK→clients      │
│  │ group_id       UUID         │◄── PK (composite) FK→groups.id    │
│  │ added_by       TEXT         │    user id from JWT                │
│  │ joined_at      TIMESTAMPTZ  │    DEFAULT now()                   │
│  └─────────────────────────────┘                                    │
└─────────────────────────────────────────────────────────────────────┘

Notes:
  - created_by / added_by are TEXT (not FK) — users table is in public schema,
    not in tenant schema. Cross-schema FKs are not used.
  - group_code = kebab(name) + '-' + nanoid(4)
    e.g., "VIP Travellers" → "vip-travellers-a7k2"
  - RLS is applied to all 4 tables (defense-in-depth).
    Policy: search_path must equal this schema (enforced at app layer).
```

---

## 4. API Contract Table

**Base prefix:** `/api/v1/clients`
**Auth chain:** `tenantResolver → requireTenant → authenticate → requireRole('admin','operator')`

### 4.1 Client Endpoints (`client.routes.ts`)

| # | Method | Path | Role | Status | Description |
|---|--------|------|------|--------|-------------|
| 1 | GET | `/api/v1/clients` | admin,operator | 200 | List clients (paginated: `?page=1&limit=20`) |
| 2 | POST | `/api/v1/clients` | admin,operator | 201 | Create client |
| 3 | GET | `/api/v1/clients/:mobile` | admin,operator | 200 / 404 | Get client by E.164 mobile |
| 4 | PATCH | `/api/v1/clients/:mobile` | admin,operator | 200 / 404 | Update client fields |
| 5 | DELETE | `/api/v1/clients/:mobile` | admin,operator | 200 / 404 | Soft delete (status → inactive) |
| 6 | GET | `/api/v1/clients/:mobile/preferences` | admin,operator | 200 / 404 | Get client preferences |
| 7 | PUT | `/api/v1/clients/:mobile/preferences` | admin,operator | 200 | Upsert client preferences (JSONB merge) |

### 4.2 Group Endpoints (`group.routes.ts`)

| # | Method | Path | Role | Status | Description |
|---|--------|------|------|--------|-------------|
| 8 | GET | `/api/v1/clients/groups` | admin,operator | 200 | List groups |
| 9 | POST | `/api/v1/clients/groups` | admin,operator | 201 | Create group (auto-generates group_code) |
| 10 | GET | `/api/v1/clients/groups/:code` | admin,operator | 200 / 404 | Get group by group_code |
| 11 | PATCH | `/api/v1/clients/groups/:code` | admin,operator | 200 / 404 | Update group (name, description, is_active) |
| 12 | DELETE | `/api/v1/clients/groups/:code` | admin,operator | 200 / 404 | Soft delete (is_active → false) |
| 13 | GET | `/api/v1/clients/groups/:code/members` | admin,operator | 200 / 404 | List group members |
| 14 | POST | `/api/v1/clients/groups/:code/members` | admin,operator | 201 / 404 / 409 | Add member to group |
| 15 | DELETE | `/api/v1/clients/groups/:code/members/:mobile` | admin,operator | 200 / 404 | Remove member from group |

**Total new endpoints: 15**

### 4.3 Request/Response Shapes (key ones)

**POST /api/v1/clients**
```json
Request:  { "mobile_number": "+919876543210", "full_name": "Ravi Kumar",
            "email": "ravi@acme.com", "date_of_birth": "1990-05-15" }
Response: { "message": "Client created successfully", "client": { ...fields } }
Errors:   400 VALIDATION_ERROR | 409 MOBILE_ALREADY_EXISTS
```

**POST /api/v1/clients/groups**
```json
Request:  { "name": "VIP Travellers", "description": "..." }
Response: { "message": "Group created successfully",
            "group": { "id": "...", "group_code": "vip-travellers-a7k2", ... } }
Errors:   400 VALIDATION_ERROR
```

**POST /api/v1/clients/groups/:code/members**
```json
Request:  { "mobile_number": "+919876543210" }
Response: { "message": "Member added successfully" }
Errors:   404 CLIENT_NOT_FOUND | 404 GROUP_NOT_FOUND | 409 ALREADY_A_MEMBER
```

---

## 5. Audit Events (New)

To avoid touching `audit.service.ts` (Sprint 01/02 code), Sprint 03 will
create `src/services/client-audit.service.ts` that calls `prisma.authEvent.create`
directly, using extended event type strings:

| Event Type | Triggered On |
|------------|-------------|
| `client_created` | POST /clients |
| `client_updated` | PATCH /clients/:mobile |
| `client_deleted` | DELETE /clients/:mobile |
| `group_created` | POST /groups |
| `group_updated` | PATCH /groups/:code |
| `group_deleted` | DELETE /groups/:code |
| `group_member_added` | POST /groups/:code/members |
| `group_member_removed` | DELETE /groups/:code/members/:mobile |

---

## 6. Sprint 03 Deliverables (in order)

| # | File | Description | Touches existing code? |
|---|------|-------------|----------------------|
| 1 | `CHECKPOINT_04.md` | This file — plan + ER + API contract | No |
| 2 | `db/migrations/tenant/003_client_module.sql` | 4 tables + RLS | No (new dir) |
| 3 | `packages/auth-bff/src/db/tenant-provisioner.ts` | `enableClientModuleForTenant()` | No (new file) |
| 4 | `packages/auth-bff/src/services/client-audit.service.ts` | Audit helpers for client events | No (new file) |
| 5 | `packages/auth-bff/src/schemas/client.schema.ts` | Zod schemas | No (new file) |
| 6 | `packages/auth-bff/src/routes/client.routes.ts` | Client CRUD (7 endpoints) | No (new file) |
| 7 | `packages/auth-bff/src/routes/group.routes.ts` | Group + member (8 endpoints) | No (new file) |
| 8 | `packages/auth-bff/src/app.ts` | Register 2 new route files | **YES — additive only** |
| 9 | `test-client-routes.js` | Test script (mirrors test-admin-routes.js) | No (new file) |
| 10 | `README_FULL.md` | Append new endpoint table | No (append only) |

**Only file 8 touches existing code**, and only additively (2 import lines + 2 `app.use()` lines).

---

## 7. Risks and Blockers

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| R1 | **`app.ts` must be modified** to register new routes. CLAUDE.md says "do NOT touch existing auth code". | Medium | Modification is additive only (2 imports + 2 `app.use()`). No existing behavior changes. Will flag in session notes. |
| R2 | **Existing tenants have no client schema**. `acme-corp` and `beta-org` test schemas don't exist yet. | High | Test script setup calls `enableClientModuleForTenant()` for both test tenants before running tests. |
| R3 | **nanoid dependency** may not be installed in `auth-bff`. | Low | Check `package.json`; add `nanoid` if missing (additive). |
| R4 | **`SET search_path` is session-scoped**, not connection-scoped. Concurrent requests sharing a connection could see wrong schema if not wrapped carefully. | High | Each handler sets search_path at the start of the request using `prisma.$executeRawUnsafe`. Since Prisma uses a connection pool, search_path must be set per-query-sequence, not assumed to persist. Wrap in transactions where critical. |
| R5 | **`/api/v1/clients` prefix** is inconsistent with existing route mounts (`/auth`, `/admin`, `/operator`). | Low | Noted as a known inconsistency. Tests will use `/api/v1/clients` as specified. |
| R6 | **group_code uniqueness** depends on nanoid suffix. Collision probability with 4 chars (base 62) = 1/14.7M per tenant. Acceptable. | Low | Add UNIQUE constraint on `group_code`. |
| R7 | **E.164 validation** at both Zod layer and DB CHECK constraint. | Low | Zod: `.regex(/^\+[1-9]\d{7,14}$/)`. SQL: `CHECK (mobile_number ~ '^\+[1-9][0-9]{7,14}$')`. |

---

## 8. Patterns to Follow for Sprint 03

### Route file structure (copy from admin.routes.ts)
```typescript
// 1. Validation schemas (Zod) at top
// 2. Helper functions: getClientIp(), getUserAgent()
// 3. router.use() middleware stack:
router.use(tenantResolver);
router.use(requireTenant);
router.use(authenticate);
router.use(requireRole('admin', 'operator'));
router.use(adminRateLimiter);  // reuse existing
// 4. Route handlers: try/catch, safeParse body, audit log on mutation
// 5. export default router
```

### Response shapes
```typescript
// Success create:   { message: '...', client: {...} }  → 201
// Success get/update: { client: {...} }                → 200
// Success delete:   { message: '...' }                 → 200
// Error:            { code: 'SNAKE_CASE', message: '...' } → 4xx/5xx
```

### Schema-switching helper (to add in tenant-provisioner.ts)
```typescript
export async function setClientModuleSchema(tenantSlug: string): Promise<void> {
  const schema = `tenant_${tenantSlug.replace(/-/g, '_')}`;
  await prisma.$executeRawUnsafe(`SET search_path = "${schema}"`);
}
```

### Test file structure (copy from test-admin-routes.js)
```javascript
const BASE_URL = 'http://localhost:3001';
// Setup: login as admin + call enableClientModuleForTenant for both test tenants
// Tests: testNN_description() → logTest(name, passed, details)
// Runner: sequential for loop, summary, exit code
```

---

## 9. Session Boundaries

Each implementation session is one file at a time:

| Session tag | File |
|-------------|------|
| `migration` | `db/migrations/tenant/003_client_module.sql` |
| `provisioner` | `packages/auth-bff/src/db/tenant-provisioner.ts` |
| `schema` | `packages/auth-bff/src/schemas/client.schema.ts` |
| `clientroutes` | `packages/auth-bff/src/routes/client.routes.ts` |
| `grouproutes` | `packages/auth-bff/src/routes/group.routes.ts` |
| `tests` | `test-client-routes.js` |

---

## 10. Definition of Done

- [ ] All 4 SQL tables created with correct types, constraints, indexes, RLS
- [ ] `enableClientModuleForTenant()` is idempotent and tested for acme-corp + beta-org
- [ ] All 15 endpoints return correct HTTP status codes
- [ ] E.164 validation rejects invalid numbers at app layer
- [ ] group_code is auto-generated (kebab + 4-char nanoid)
- [ ] Audit log entry written for every mutation
- [ ] Existing 48 tests still pass (no regressions)
- [ ] `test-client-routes.js` passes all tests
- [ ] `README_FULL.md` appended with new endpoint table

---

**PLAN COMPLETE — awaiting human approval before any code changes.**

Jai Jagannath! 🙏
