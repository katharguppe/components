# Known Bugs

---

## BUG-001 — `requireSameTenant` middleware not wired into routes

**Severity:** High (Security)
**Status:** Open
**Discovered:** 2026-04-05 during Sprint 03 end-to-end testing
**Reported by:** Automated e2e test (`test-e2e.js`)

### Description

The `requireSameTenant` middleware in `packages/auth-bff/src/middleware/auth.middleware.ts`
(lines ~137–162) checks that the authenticated user's `tid` (tenant ID from JWT) matches
the resolved tenant from the `X-Tenant-Slug` request header.

This middleware is **never called** — it is not mounted in `app.ts`, `admin.routes.ts`,
`client.routes.ts`, or any other route file.

### Impact

A user authenticated against `tenant-A` can pass `X-Tenant-Slug: tenant-B` in the header
and receive `tenant-B`'s data, provided they know the slug.

**Confirmed exploitable paths:**
- `GET /api/v1/clients` — returns another tenant's clients
- `GET /admin/users` — returns another tenant's users (via RLS context switch)

### Reproduction

```bash
# 1. Login as acme-corp admin, get token
TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@acme.com","password":"Admin@Acme123!","tenant_slug":"acme-corp"}' \
  | node -e "process.stdin.resume();let b='';process.stdin.on('data',d=>b+=d);process.stdin.on('end',()=>console.log(JSON.parse(b).access_token))")

# 2. Access beta-org data using acme-corp token
curl -s http://localhost:3001/api/v1/clients \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Slug: beta-org"
# Returns HTTP 200 with beta-org client data
```

### Fix

Apply `requireSameTenant` to all tenant-scoped routes in `app.ts` or in each route file,
after `authenticate` and `tenantResolver`:

```typescript
// app.ts — add requireSameTenant after authenticate in the middleware chain
import { requireSameTenant } from './middleware/auth.middleware';

app.use('/admin',          tenantResolver, authenticate, requireTenant, requireSameTenant, adminRoutes);
app.use('/api/v1/clients', tenantResolver, authenticate, requireTenant, requireSameTenant, clientRoutes);
```

Or apply it per-router at the top of each route file.

Note: `requireSameTenant` already handles the operator exception (operators can access any tenant).

### Files Affected

- `packages/auth-bff/src/middleware/auth.middleware.ts` — middleware exists, unused
- `packages/auth-bff/src/app.ts` — needs middleware wired in
- `packages/auth-bff/src/routes/admin.routes.ts` — alternative fix location
- `packages/auth-bff/src/routes/client.routes.ts` — alternative fix location
- `packages/auth-bff/src/routes/group.routes.ts` — alternative fix location

---
