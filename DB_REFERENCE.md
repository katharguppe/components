# Database Reference — Travel SaaS Auth

> Quick reference for UI developers. Shows every table, every column,
> types, constraints, and which schema it lives in.

---

## Architecture: Two Schemas Per Tenant

```
PostgreSQL (authdb)
│
├── public                          ← shared across ALL tenants (Prisma managed)
│   ├── tenants
│   ├── users
│   ├── refresh_tokens
│   ├── auth_events
│   ├── password_history
│   └── password_reset_tokens
│
├── tenant_acme_corp                ← isolated schema for tenant "acme-corp"
│   ├── clients
│   ├── client_preferences
│   ├── groups
│   └── group_members
│
├── tenant_beta_org                 ← isolated schema for tenant "beta-org"
│   ├── clients
│   ├── client_preferences
│   ├── groups
│   └── group_members
│
└── tenant_{slug_with_underscores}  ← one schema per tenant, same 4 tables
```

**Schema naming rule:** replace hyphens with underscores, prefix with `tenant_`
```
acme-corp   →  tenant_acme_corp
beta-org    →  tenant_beta_org
my-travel   →  tenant_my_travel
```

The client module schema is created by calling `POST /api/v1/clients/_provision`.

---

## PUBLIC SCHEMA — Shared Tables

### tenants

Stores every tenant registered on the platform. Created by the operator.

| Column     | Type        | Nullable | Default           | Notes                          |
|------------|-------------|----------|-------------------|--------------------------------|
| id         | UUID        | NO       | gen_random_uuid() | Primary key                    |
| name       | TEXT        | NO       |                   | Display name e.g. "Acme Corp"  |
| slug       | TEXT        | NO       |                   | URL-safe e.g. "acme-corp" UNIQUE |
| status     | TEXT        | NO       | 'active'          | 'active' or 'suspended'        |
| max_users  | INTEGER     | NO       | 5                 | User seat limit                |
| created_at | TIMESTAMPTZ | NO       | CURRENT_TIMESTAMP |                                |
| updated_at | TIMESTAMPTZ | NO       |                   |                                |

---

### users

One row per user. Scoped to a tenant via `tenant_id`. RLS enforced.

| Column          | Type        | Nullable | Default           | Notes                              |
|-----------------|-------------|----------|-------------------|------------------------------------|
| id              | UUID        | NO       | gen_random_uuid() | Primary key                        |
| tenant_id       | UUID        | NO       |                   | FK → tenants.id (CASCADE DELETE)   |
| email           | TEXT        | NO       |                   | Unique per tenant                  |
| password_hash   | TEXT        | NO       |                   | Argon2id hash                      |
| role            | TEXT        | NO       | 'user'            | 'user', 'admin', 'operator'        |
| status          | TEXT        | NO       | 'active'          | 'active', 'inactive', 'locked'     |
| failed_attempts | INTEGER     | NO       | 0                 | Increments on bad login            |
| locked_until    | TIMESTAMPTZ | YES      |                   | NULL = not locked                  |
| last_login_at   | TIMESTAMPTZ | YES      |                   | Updated on successful login        |
| created_at      | TIMESTAMPTZ | NO       | CURRENT_TIMESTAMP |                                    |
| updated_at      | TIMESTAMPTZ | NO       |                   |                                    |

**Unique constraint:** `(email, tenant_id)` — same email allowed across different tenants.

---

### refresh_tokens

Stores hashed refresh tokens. Invalidated on logout or rotation.

| Column     | Type        | Nullable | Default           | Notes                            |
|------------|-------------|----------|-------------------|----------------------------------|
| id         | UUID        | NO       | gen_random_uuid() | Primary key                      |
| user_id    | UUID        | NO       |                   | FK → users.id (CASCADE DELETE)   |
| tenant_id  | UUID        | NO       |                   | FK → tenants.id (CASCADE DELETE) |
| token_hash | TEXT        | NO       |                   | SHA-256 hash of token UNIQUE     |
| expires_at | TIMESTAMPTZ | NO       |                   | Token expiry                     |
| revoked_at | TIMESTAMPTZ | YES      |                   | NULL = still valid               |
| user_agent | TEXT        | YES      |                   | Browser/client info              |
| ip_address | TEXT        | YES      |                   | Client IP at login               |
| created_at | TIMESTAMPTZ | NO       | CURRENT_TIMESTAMP |                                  |

---

### auth_events

Audit log of all auth activity (login, logout, failed attempts, etc.).

| Column     | Type        | Nullable | Default           | Notes                          |
|------------|-------------|----------|-------------------|--------------------------------|
| id         | UUID        | NO       | gen_random_uuid() | Primary key                    |
| tenant_id  | UUID        | NO       |                   | FK → tenants.id                |
| user_id    | UUID        | YES      |                   | FK → users.id (NULL if no user)|
| event_type | TEXT        | NO       |                   | e.g. 'LOGIN', 'LOGOUT', 'FAILED_LOGIN' |
| ip_address | TEXT        | YES      |                   |                                |
| user_agent | TEXT        | YES      |                   |                                |
| metadata   | JSONB       | YES      |                   | Extra event data               |
| created_at | TIMESTAMPTZ | NO       | CURRENT_TIMESTAMP |                                |

---

### password_history

Last N password hashes per user. Prevents password reuse.

| Column        | Type        | Nullable | Default           | Notes                          |
|---------------|-------------|----------|-------------------|--------------------------------|
| id            | UUID        | NO       | gen_random_uuid() | Primary key                    |
| user_id       | UUID        | NO       |                   | FK → users.id (CASCADE DELETE) |
| password_hash | TEXT        | NO       |                   | Argon2id hash                  |
| created_at    | TIMESTAMPTZ | NO       | CURRENT_TIMESTAMP |                                |

---

### password_reset_tokens

One-time tokens for the forgot-password flow.

| Column     | Type        | Nullable | Default           | Notes                          |
|------------|-------------|----------|-------------------|--------------------------------|
| id         | UUID        | NO       | gen_random_uuid() | Primary key                    |
| user_id    | UUID        | NO       |                   | FK → users.id (CASCADE DELETE) |
| token_hash | TEXT        | NO       |                   | SHA-256 hash UNIQUE            |
| expires_at | TIMESTAMPTZ | NO       |                   |                                |
| used_at    | TIMESTAMPTZ | YES      |                   | NULL = not yet used            |
| created_at | TIMESTAMPTZ | NO       | CURRENT_TIMESTAMP |                                |

---

## PER-TENANT SCHEMA — Client Module Tables

> These 4 tables exist inside each tenant's own schema e.g. `tenant_acme_corp`.
> They are created by calling `POST /api/v1/clients/_provision`.
> There is NO `tenant_id` column — the schema boundary IS the tenant isolation.
> RLS is enabled on all 4 tables as defence-in-depth.

---

### clients

One row per client (customer). Primary key is the E.164 mobile number.

| Column        | Type        | Nullable | Default  | Notes                                     |
|---------------|-------------|----------|----------|-------------------------------------------|
| mobile_number | VARCHAR(16) | NO       |          | Primary key. E.164 e.g. +911234567890     |
| full_name     | TEXT        | NO       |          |                                           |
| email         | TEXT        | YES      |          | Unique within tenant (nullable)           |
| date_of_birth | DATE        | YES      |          |                                           |
| status        | TEXT        | NO       | 'active' | 'active', 'inactive', 'blocked'           |
| created_at    | TIMESTAMPTZ | NO       | now()    |                                           |
| updated_at    | TIMESTAMPTZ | NO       | now()    | Auto-updated by trigger                   |

**E.164 rule:** must match `^\+[1-9][0-9]{7,14}$`
Examples: `+911234567890` (India), `+14155552671` (USA), `+447911123456` (UK)

---

### client_preferences

1:1 with clients. Stores all preference data as a JSONB blob.

| Column        | Type        | Nullable | Default | Notes                                        |
|---------------|-------------|----------|---------|----------------------------------------------|
| mobile_number | VARCHAR(16) | NO       |         | Primary key. FK → clients.mobile_number      |
| preferences   | JSONB       | NO       | '{}'    | Free-form JSON. Store anything you need.     |
| created_at    | TIMESTAMPTZ | NO       | now()   |                                              |
| updated_at    | TIMESTAMPTZ | NO       | now()   | Auto-updated by trigger                      |

**Example preferences payload:**
```json
{
  "language": "hi",
  "notifications": true,
  "theme": "dark",
  "preferred_currency": "INR",
  "seat_preference": "window"
}
```

Row is created automatically on first PUT. Use `PUT /api/v1/clients/:mobile/preferences`.
Always send the full object — it replaces the existing value entirely.

---

### groups

Tenant-scoped dynamic groups. `group_code` is the stable identifier used in API calls.

| Column      | Type        | Nullable | Default              | Notes                                       |
|-------------|-------------|----------|----------------------|---------------------------------------------|
| id          | UUID        | NO       | gen_random_uuid()    | Internal primary key                        |
| name        | TEXT        | NO       |                      | Display name e.g. "VIP Travellers"          |
| group_code  | TEXT        | NO       |                      | Auto-generated slug UNIQUE e.g. "vip-travellers-a7k2" |
| description | TEXT        | YES      |                      |                                             |
| is_active   | BOOLEAN     | NO       | true                 | false = soft-deleted                        |
| created_by  | TEXT        | NO       |                      | UUID of the admin user who created it       |
| created_at  | TIMESTAMPTZ | NO       | now()                |                                             |
| updated_at  | TIMESTAMPTZ | NO       | now()                | Auto-updated by trigger                     |

**group_code format:** `{kebab-slug-of-name}-{4-char-nanoid}`
```
"VIP Travellers"   →  vip-travellers-a7k2
"Business Class"   →  business-class-x9p1
"Budget Seekers"   →  budget-seekers-3mq8
```
The `group_code` is what you use in every API call — NOT the UUID.

---

### group_members

Many-to-many join between clients and groups. Composite primary key.

| Column        | Type        | Nullable | Default | Notes                                        |
|---------------|-------------|----------|---------|----------------------------------------------|
| mobile_number | VARCHAR(16) | NO       |         | FK → clients.mobile_number (CASCADE DELETE)  |
| group_id      | UUID        | NO       |         | FK → groups.id (CASCADE DELETE)              |
| added_by      | TEXT        | NO       |         | UUID of the admin who added the member       |
| joined_at     | TIMESTAMPTZ | NO       | now()   | When the client was added to the group       |

**Primary key:** `(mobile_number, group_id)` — a client can only appear once per group.

---

## Relationships Summary

```
public.tenants ──────────────── public.users (1:many via tenant_id)
                                      │
                                      ├── public.refresh_tokens (1:many)
                                      ├── public.auth_events (1:many)
                                      └── public.password_history (1:many)

tenant_{slug}.clients ──────────── tenant_{slug}.client_preferences (1:1)
                    │
                    └── tenant_{slug}.group_members (many:many)
                              │
                    tenant_{slug}.groups ── tenant_{slug}.group_members
```

---

## Seed Data — Test Accounts

These accounts exist after running `npm run db:seed --workspace=packages/auth-bff`.

### Tenants

| Slug      | Name     | Schema            |
|-----------|----------|-------------------|
| acme-corp | Acme Corp| tenant_acme_corp  |
| beta-org  | Beta Org | tenant_beta_org   |

### Users

| Email                   | Password        | Role     | Tenant    |
|-------------------------|-----------------|----------|-----------|
| admin@acme.com          | Admin@Acme123!  | admin    | acme-corp |
| alice@acme.com          | User@Acme123!   | user     | acme-corp |
| admin@betaorg.com       | Admin@Beta123!  | admin    | beta-org  |
| operator@platform.com   | (set at seed)   | operator | —         |

---

## RLS — Row Level Security Summary

| Table                    | Schema        | RLS | Policy                                          |
|--------------------------|---------------|-----|-------------------------------------------------|
| users                    | public        | YES | tenant_id = app.current_tenant_id               |
| refresh_tokens           | public        | YES | tenant_id = app.current_tenant_id               |
| auth_events              | public        | YES | tenant_id = app.current_tenant_id               |
| clients                  | tenant_{slug} | YES | app.current_tenant_id must be set (not null/empty) |
| client_preferences       | tenant_{slug} | YES | app.current_tenant_id must be set               |
| groups                   | tenant_{slug} | YES | app.current_tenant_id must be set               |
| group_members            | tenant_{slug} | YES | app.current_tenant_id must be set               |

The server sets `app.current_tenant_id` automatically when it sees the
`X-Tenant-Slug` header. You never set this yourself from the UI.

---

## What the UI Must Send on Every Request

| What           | Where              | Example                        |
|----------------|--------------------|--------------------------------|
| Auth token     | Authorization header | `Bearer eyJhbGci...`          |
| Tenant context | X-Tenant-Slug header | `X-Tenant-Slug: acme-corp`    |

Login is the only exception — it sends `tenant_slug` in the POST body instead.
