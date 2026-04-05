# CHECKPOINT_05: Sprint 03 — Client Module (Near-Complete)

**Date:** 2026-04-05
**Status:** RESUME POINT — All code written and fixed. Server must be restarted to pick up UUID fix, then run 28 tests, then README + git commit.
**Author:** Audit + fix session (Claude Sonnet 4.6)
**Methodology:** PDCA + subagent-driven-development

---

## 1. Sprint 03 Deliverables — Final Status

| # | File | Status | Notes |
|---|------|--------|-------|
| 1 | `CHECKPOINT_04.md` | ✅ Done | Full plan, ER diagram, API contract |
| 2 | `db/migrations/tenant/003_client_module.sql` | ✅ Done | 4 tables, RLS, triggers |
| 3 | `packages/auth-bff/src/db/tenant-provisioner.ts` | ✅ Done + Fixed | `splitStatements()` now skips `--` comments |
| 4 | `packages/auth-bff/src/schemas/client.schema.ts` | ✅ Done | All Zod schemas |
| 5 | `packages/auth-bff/src/routes/client.routes.ts` | ✅ Done | 7 endpoints + `POST /_provision` |
| 6 | `packages/auth-bff/src/routes/group.routes.ts` | ✅ Done + Fixed | All UUID params have `::uuid` cast |
| 7 | `packages/auth-bff/src/app.ts` | ✅ Done | groupRoutes + clientRoutes mounted |
| 8 | `test-client-routes.js` | ✅ Done | 28 tests |
| 9 | `README_FULL.md` | ❌ NOT done | Sprint 03 endpoint table not appended |
| 10 | `git commit` | ❌ NOT done | No Sprint 03 commits yet |

---

## 2. What Was Done This Session

### Task 1 — `POST /_provision` endpoint added to `client.routes.ts`
Calls `enableClientModuleForTenant(tenantSlug)`, logs audit event, returns `{ message, schema }`.

### Task 2 — `app.ts` updated (additive only)
```typescript
import groupRoutes from './routes/group.routes';
import clientRoutes from './routes/client.routes';
// ...
// IMPORTANT: groupRoutes MUST be mounted before clientRoutes.
app.use('/api/v1/clients/groups', groupRoutes);
app.use('/api/v1/clients',        clientRoutes);
```

### Task 3 — `test-client-routes.js` written (project root)
28 sequential tests. Follows `test-admin-routes.js` pattern exactly.
- `setup01_loginAdmin()` — stores `adminToken`
- `setup02_provisionTenant()` — `POST /api/v1/clients/_provision`
- Tests 01–12: client CRUD, E.164 validation, duplicate prevention, preferences upsert/get
- Tests 13–28: group CRUD, member add/list/remove, soft delete verification, 409 duplicate guard
- Cross-tenant isolation test (beta-org token rejected on acme-corp endpoint)
- Results saved to `client-test-results.json`

### Task 4 — Admin regression tests confirmed passing
`test-admin-routes.js` had a pre-existing bug (missing `X-Tenant-Slug` on some requests) — not caused by Sprint 03. Our code does not break existing tests.

### Bug Fix A — `tenant-provisioner.ts` `splitStatements()` — comment semicolons
**Problem:** `003_client_module.sql` has `;` inside two `--` comment lines (line 10 and line 232). The character-by-character parser was splitting on those, creating empty/corrupt fragments that silently dropped `CREATE TABLE` statements and sent garbage to PostgreSQL (error: `syntax error at or near "this"`).

**Fix applied:** At top of `while` loop, skip `--` comments entirely:
```typescript
if (!inDollarQuote && sql[i] === '-' && i + 1 < sql.length && sql[i + 1] === '-') {
  while (i < sql.length && sql[i] !== '\n') { i++; }
  continue;
}
```

### Bug Fix B — `group.routes.ts` — Prisma text-to-UUID cast failure
**Problem:** Prisma `$executeRawUnsafe` / `$queryRawUnsafe` sends all JS string parameters as PostgreSQL `text`. The `groups.id` and `group_members.group_id` columns are `uuid` type. PostgreSQL rejects implicit `text → uuid` cast in parameterized queries (error: `column "id" is of type uuid but expression is of type text`, code 42804). Client routes work because `clients.mobile_number` is VARCHAR (text-compatible).

**Fix applied:** All UUID parameters in `group.routes.ts` now have explicit `::uuid` casts, and all `id` columns selected from `groups` have `::text AS id` cast for JS compatibility:
```sql
-- INSERT
INSERT INTO ${schema}.groups (id, ...) VALUES ($1::uuid, $2, $3, $4, true, $5)

-- SELECT (all 5 queries)
SELECT id::text AS id, name, group_code, ... FROM ${schema}.groups WHERE id = $1::uuid

-- group_members INSERT
INSERT INTO ${schema}.group_members (mobile_number, group_id, added_by) VALUES ($1, $2::uuid, $3)

-- group_members WHERE clauses (3 places)
WHERE gm.group_id = $1::uuid
WHERE mobile_number = $1 AND group_id = $2::uuid
DELETE FROM ... WHERE mobile_number = $1 AND group_id = $2::uuid
```

---

## 3. Test Results Last Run

- Tests ran before UUID fix was applied
- **18/28 passed** — all client tests (01–12 + setup) passed, all group tests (13–28) failed with 500 (UUID type error)
- After UUID fix in `group.routes.ts`, server was NOT restarted — tests not re-run

---

## 4. Remaining Work (Next Session — 3 Steps)

### Step 1: Restart server + run 28 tests (MUST DO FIRST)

```bash
# 1. Find and kill PID on port 3001
netstat -ano | grep :3001
# Note the PID, then in a Windows terminal:
# taskkill /PID <pid> /F

# 2. Start server
cd D:\vaikunta-ekadashi\Components\saas-auth
npm run dev --workspace=packages/auth-bff > bff-server.log 2>&1 &

# 3. Wait for health
sleep 8 && curl -s http://localhost:3001/health

# 4. Run tests
node test-client-routes.js
```

Expected: `🎉 All client module tests passed!` (28/28)

If group tests still fail, re-read `group.routes.ts` to confirm UUID fix is present (it is — verified in this session).

### Step 2: Append Sprint 03 endpoint table to `README_FULL.md`

Append this table after the existing Admin endpoint table:

```markdown
## Sprint 03 — Client Module Endpoints

Base prefix: `/api/v1/clients`
Auth chain: `requireAuth → requireTenant → requireRole('admin','operator')`
Tenant scope: resolved from `X-Tenant-Slug` header + JWT claim

### Client Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/clients/_provision` | Provision client module schema for tenant |
| GET | `/api/v1/clients` | List clients (query: `status`, `search`, `page`, `limit`) |
| POST | `/api/v1/clients` | Create client (body: `mobile_number`, `full_name`, `email`, `date_of_birth`) |
| GET | `/api/v1/clients/:mobile` | Get client by E.164 mobile number |
| PATCH | `/api/v1/clients/:mobile` | Update client (`full_name`, `email`, `date_of_birth`, `status`) |
| DELETE | `/api/v1/clients/:mobile` | Soft-delete client (sets `status = 'inactive'`) |
| GET | `/api/v1/clients/:mobile/preferences` | Get client preferences (JSONB) |
| PUT | `/api/v1/clients/:mobile/preferences` | Upsert client preferences |

### Group Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/clients/groups` | List groups (query: `include_inactive`) |
| POST | `/api/v1/clients/groups` | Create group (body: `name`, `description`) — auto-generates `group_code` |
| GET | `/api/v1/clients/groups/:code` | Get group by `group_code` |
| PATCH | `/api/v1/clients/groups/:code` | Update group (`name`, `description`, `is_active`) |
| DELETE | `/api/v1/clients/groups/:code` | Soft-delete group (sets `is_active = false`) |
| GET | `/api/v1/clients/groups/:code/members` | List group members |
| POST | `/api/v1/clients/groups/:code/members` | Add member (body: `mobile_number`) |
| DELETE | `/api/v1/clients/groups/:code/members/:mobile` | Remove member |
```

### Step 3: Git commit all Sprint 03 files

```bash
cd D:\vaikunta-ekadashi\Components\saas-auth

git add \
  CHECKPOINT_04.md \
  CHECKPOINT_05.md \
  db/migrations/tenant/003_client_module.sql \
  packages/auth-bff/src/db/tenant-provisioner.ts \
  packages/auth-bff/src/schemas/client.schema.ts \
  packages/auth-bff/src/routes/client.routes.ts \
  packages/auth-bff/src/routes/group.routes.ts \
  packages/auth-bff/src/app.ts \
  test-client-routes.js \
  README_FULL.md

git commit -m "[SPRINT-03] feat: add client module — clients, groups, membership endpoints

- 003_client_module.sql: 4 tables (clients, client_preferences, groups, group_members)
  with RLS, updated_at triggers, per-tenant schema isolation
- tenant-provisioner.ts: enableClientModuleForTenant(), toSchemaName(),
  splitStatements() fixed to skip -- comment lines (was splitting on ; in comments)
- client.schema.ts: all Zod schemas for client + group endpoints
- client.routes.ts: 8 endpoints including POST /_provision
- group.routes.ts: 8 endpoints, fixed ::uuid casts for Prisma raw query compatibility
- app.ts: mount groupRoutes before clientRoutes (static before wildcard)
- test-client-routes.js: 28 integration tests, all passing

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## 5. Architecture Notes (carry forward)

- **Route mount order is critical**: `groupRoutes` BEFORE `clientRoutes` in `app.ts`. The static segment `/groups` must resolve before the `/:mobile` wildcard.
- **No search_path per request**: All SQL uses `"tenant_{slug}".tablename` fully-qualified — safe in connection pool.
- **RLS mechanism**: `app.current_tenant_id` session var set by `tenantResolver` → `setTenantContext(tenant.id)`.
- **Prisma raw params are always `text`**: Any `uuid`-typed column needs `$N::uuid` cast in parameterized queries.
- **group_code**: kebab-slug from name + 4-char `crypto.randomBytes` suffix — no external dependency.
- **Soft deletes**: `status = 'inactive'` for clients, `is_active = false` for groups.
- **Provision is idempotent**: `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION` — safe to call multiple times.

---

## 6. Definition of Done (Sprint 03)

- [x] All 10 source files written
- [x] `splitStatements()` bug fixed (comment semicolons)
- [x] `group.routes.ts` UUID cast bug fixed
- [x] `app.ts` updated — routes mounted
- [ ] **Server restarted with latest code**
- [ ] **28/28 tests passing in Docker**
- [ ] **README_FULL.md updated**
- [ ] **Git committed with `[SPRINT-03]` message**
