# 🔧 SaaS Auth Setup Fix - Database Migration Issue

## Problem Identified

If you're seeing this error:

```
ERROR: function set_tenant_context(uuid) does not exist
```

This document provides the fix.

---

## 📍 Repository Location

The code **IS available on GitHub** at:

**https://github.com/katharguppe/components.git**

### Direct Links to Source Code

| Package | GitHub Path |
|---------|-------------|
| **Auth BFF (Backend)** | https://github.com/katharguppe/components/tree/master/packages/auth-bff |
| **Login UI (Frontend)** | https://github.com/katharguppe/components/tree/master/packages/login-ui |

> **Note:** The code is inside the `components/` directory under `packages/`, not a standalone `saas-auth` folder.

---

## 🐛 Root Cause

The database migration that creates the `set_tenant_context()` PostgreSQL function was not applied to your database. This function is required for multi-tenant Row-Level Security (RLS).

---

## ✅ Solution - Apply Database Migrations

### Option 1: Using Prisma CLI (Recommended)

```bash
# Navigate to the auth-bff package
cd components/packages/auth-bff

# Install dependencies (if not already done)
npm install

# Apply all pending migrations to your database
npx prisma migrate deploy

# Generate Prisma Client
npx prisma generate
```

### Option 2: Manual SQL Execution

If Prisma CLI is not working, run this SQL directly in your PostgreSQL database:

```sql
-- ─── Enable RLS on Users Table ─────────────────────────────────────────────

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

-- Policy: Users can only see users within their own tenant
CREATE POLICY tenant_isolation_on_users ON users
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy: Operators (no tenant_id) can see all users
CREATE POLICY operator_access_on_users ON users
  USING (current_setting('app.current_tenant_id', true) IS NULL);

-- ─── Enable RLS on Refresh Tokens Table ────────────────────────────────────

ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens FORCE ROW LEVEL SECURITY;

-- Policy: Refresh tokens are isolated by tenant
CREATE POLICY tenant_isolation_on_refresh_tokens ON refresh_tokens
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy: Operators can access all refresh tokens
CREATE POLICY operator_access_on_refresh_tokens ON refresh_tokens
  USING (current_setting('app.current_tenant_id', true) IS NULL);

-- ─── Enable RLS on Auth Events Table ───────────────────────────────────────

ALTER TABLE auth_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_events FORCE ROW LEVEL SECURITY;

-- Policy: Auth events are isolated by tenant
CREATE POLICY tenant_isolation_on_auth_events ON auth_events
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy: Operators can access all auth events
CREATE POLICY operator_access_on_auth_events ON auth_events
  USING (current_setting('app.current_tenant_id', true) IS NULL);

-- ─── Helper Functions ──────────────────────────────────────────────────────

-- Function to set the current tenant context for a session
CREATE OR REPLACE FUNCTION set_tenant_context(tenant_uuid uuid)
RETURNS void AS $$
BEGIN
  EXECUTE format('SET app.current_tenant_id = %L', tenant_uuid::text);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get the current tenant context
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS uuid AS $$
BEGIN
  RETURN current_setting('app.current_tenant_id', true)::uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 🧪 Verification Steps

After applying the migration, verify the fix:

### Step 1: Check Functions Exist

Run this in PostgreSQL:

```sql
-- Should return the function definition
\dF set_tenant_context
\dF get_current_tenant_id
```

### Step 2: Test the Function

```sql
-- Test setting tenant context (replace with a valid tenant UUID from your DB)
SELECT set_tenant_context('abb5facd-b9c5-48a0-9e68-d50e31ae7d3e'::uuid);

-- Should complete without error
```

### Step 3: Restart the Auth BFF Service

```bash
cd components/packages/auth-bff
npm run dev
```

You should see:
```
🚀 Auth BFF service running on port 3001
📝 Environment: development
🔗 Health check: http://localhost:3001/health
```

### Step 4: Test Login Flow

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"tenant_slug":"your-tenant-slug","email":"user@example.com","password":"your-password"}'
```

Should return a successful response (no more `set_tenant_context` error).

---

## 📋 Complete Setup Checklist

- [ ] Clone repository: `https://github.com/katharguppe/components.git`
- [ ] Navigate to auth-bff: `cd components/packages/auth-bff`
- [ ] Copy `.env.example` to `.env` and configure DATABASE_URL
- [ ] Install dependencies: `npm install`
- [ ] **Apply migrations: `npx prisma migrate deploy`** ← **THIS IS THE KEY STEP**
- [ ] Generate Prisma Client: `npx prisma generate`
- [ ] Seed the database (optional): `npx prisma db seed`
- [ ] Start the service: `npm run dev`
- [ ] Verify health: `curl http://localhost:3001/health`

---

## 🔗 Additional Resources

| Document | Description |
|----------|-------------|
| [README_TESTING.md](./README_TESTING.md) | Testing guide for UI team |
| [README_FULL.md](./README_FULL.md) | Complete setup documentation |
| [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) | Architecture overview |

---

## ❓ Still Having Issues?

If you still see errors after applying the migration:

1. **Check DATABASE_URL** - Ensure it points to the correct PostgreSQL instance
2. **Check migration_lock.toml** - Verify migrations were applied:
   ```bash
   cat prisma/migrations/migration_lock.toml
   ```
3. **Check Prisma schema** - Regenerate client:
   ```bash
   npx prisma generate
   ```
4. **Restart PostgreSQL** - Sometimes required after function creation

---

**Last Updated:** 2026-03-12  
**Issue:** Missing `set_tenant_context()` PostgreSQL function  
**Fix:** Apply RLS migration (Option 1 or Option 2 above)
