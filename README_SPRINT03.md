# Sprint 03 — Client Module: Tester's Guide

**For:** UI developers, QA testers, and integration teams
**Repo:** https://github.com/katharguppe/components
**Stack:** Node.js + TypeScript backend · Next.js frontend (recommended)
**Date:** 2026-04-05

---

## What You Are Testing

This sprint adds the **Client Module** — a per-tenant database schema and REST API that lets
tenant admins manage their clients (customers) and organise them into groups.

The full end-to-end journey you will walk through:

```
1. Platform operator creates a tenant        ← Sprint 01/02 (regression)
2. Tenant admin logs in                      ← Sprint 01/02 (regression)
3. Admin provisions the client module        ← Sprint 03 NEW
4. Admin creates / reads / updates / deletes clients  ← Sprint 03 NEW
5. Admin creates groups and adds clients     ← Sprint 03 NEW
```

You can also run **regression tests** for Sprint 01 and 02 to confirm nothing is broken.

---

## Prerequisites

Install these before you start:

| Tool | Version | Download |
|------|---------|----------|
| Git | any | https://git-scm.com |
| Node.js | 20 or higher | https://nodejs.org |
| Docker Desktop | 4.x | https://www.docker.com/products/docker-desktop |
| VS Code | any | https://code.visualstudio.com |

> **Windows users:** All commands below work in Git Bash, PowerShell, or the VS Code integrated terminal.

---

## Part A — Get the Code

### Option 1: Clone the full repository (recommended for first-time setup)

```bash
git clone https://github.com/katharguppe/components.git
cd components/saas-auth
```

### Option 2: Pull only the `saas-auth` folder (sparse checkout — saves bandwidth)

Use this if you already have the repo or only want this component:

```bash
# 1. Create a new empty folder and initialise git
mkdir saas-auth-only && cd saas-auth-only
git init

# 2. Add the remote
git remote add origin https://github.com/katharguppe/components.git

# 3. Enable sparse checkout
git config core.sparseCheckout true

# 4. Tell git which folder you want
echo "saas-auth/" >> .git/info/sparse-checkout

# 5. Pull only that folder from main branch
git pull origin master

# 6. Move into the component
cd saas-auth
```

### Stay up to date (pull latest changes)

```bash
# Inside the saas-auth folder:
git pull origin master
```

---

## Part B — First-Time Setup

Run these steps **once** when you first check out the project.

### 1. Open in VS Code

```bash
code .
```

Open the integrated terminal: `View → Terminal` (or `` Ctrl+` ``).

### 2. Generate JWT signing keys

```bash
mkdir -p keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
```

> **Windows without OpenSSL?**
> Install Git for Windows — it ships with OpenSSL. Run the commands in Git Bash.

### 3. Install dependencies

```bash
npm install
```

### 4. Start the database and mail server

```bash
docker compose up -d
```

You should see:
```
Container saas-auth-postgres   Started
Container saas-auth-mailhog    Started
```

### 5. Run database migrations

```bash
npm run db:migrate --workspace=packages/auth-bff
```

### 6. Start the API server

```bash
npm run dev --workspace=packages/auth-bff
```

Leave this terminal open. The server runs on **http://localhost:3001**.

### 7. Confirm the server is healthy

Open a **second terminal** and run:

```bash
curl http://localhost:3001/health
```

Expected response:
```json
{ "status": "ok", "db": "connected", "version": "1.0.0" }
```

---

## Part C — Regression Tests (Sprint 01 & 02)

Before testing Sprint 03, confirm the previous sprints still pass.

```bash
# Sprint 01 + 02 — Auth, Admin, Operator routes
node test-admin-routes.js
node test-operator-routes.js
```

All tests should report **PASS**. If anything fails, do not proceed — check that the server
is running and the database is up.

---

## Part D — Sprint 03 Automated Test (28 tests)

```bash
node test-client-routes.js
```

Expected output:

```
Total:  30 tests
Passed: 28 ✅
Failed: 0 ❌

🎉 All client module tests passed!
```

This single script covers the entire Sprint 03 journey automatically.
Results are also saved to `client-test-results.json`.

---

## Part E — Manual Testing with Next.js UI

Build a minimal Next.js UI to test each API step interactively.

### Create the Next.js project (one time)

```bash
# From the components/ root (outside saas-auth/)
npx create-next-app@latest saas-ui --typescript --app --tailwind
cd saas-ui
npm install
```

### Environment variable

Create `saas-ui/.env.local`:

```
NEXT_PUBLIC_API_BASE=http://localhost:3001/api/v1
```

### Step-by-step UI flows to build and test

---

#### Step 1 — Login as Operator · create a new tenant

**API call:**
```
POST /api/v1/auth/login
Body: { "email": "operator@platform.com", "password": "your-password" }
```

Then create a tenant:
```
POST /api/v1/operator/tenants
Header: Authorization: Bearer <operator-token>
Body:
{
  "name": "Demo Corp",
  "slug": "demo-corp",
  "adminEmail": "admin@demo-corp.com",
  "adminPassword": "Admin1234!"
}
```

> Creating a tenant automatically provisions the base database schema `tenant_demo_corp`
> — this is the Sprint 01/02 work you are regression-testing here.

---

#### Step 2 — Login as Tenant Admin

```
POST /api/v1/auth/login
Header: X-Tenant-Slug: demo-corp
Body: { "email": "admin@demo-corp.com", "password": "Admin1234!" }
```

Save the returned JWT token — all Sprint 03 calls need it.

---

#### Step 3 — Provision the Client Module (Sprint 03)

This creates the 4 client-module tables inside `tenant_demo_corp`:

```
POST /api/v1/clients/_provision
Header: Authorization: Bearer <admin-token>
Header: X-Tenant-Slug: demo-corp
```

Expected response:
```json
{
  "message": "Client module provisioned",
  "schema": "tenant_demo_corp"
}
```

> This call is **idempotent** — safe to call multiple times.

---

#### Step 4 — Create a Client

```
POST /api/v1/clients
Header: Authorization: Bearer <admin-token>
Header: X-Tenant-Slug: demo-corp
Body:
{
  "mobile_number": "+911234567890",
  "full_name": "Arjun Sharma",
  "email": "arjun@example.com",
  "date_of_birth": "1990-05-15"
}
```

> Mobile number **must** be in E.164 format: `+` followed by country code and number.
> Example: `+911234567890` (India), `+14155552671` (USA).

---

#### Step 5 — List, Get, Update, Delete Clients

```
# List all clients
GET /api/v1/clients?page=1&limit=10
Header: X-Tenant-Slug: demo-corp

# Search by name
GET /api/v1/clients?search=Arjun

# Get one client
GET /api/v1/clients/+911234567890

# Update client
PATCH /api/v1/clients/+911234567890
Body: { "full_name": "Arjun K. Sharma", "status": "active" }

# Soft-delete client (sets status = inactive, does NOT erase data)
DELETE /api/v1/clients/+911234567890
```

---

#### Step 6 — Client Preferences (JSONB — store anything)

```
# Save preferences
PUT /api/v1/clients/+911234567890/preferences
Body: { "language": "hi", "notifications": true, "theme": "dark" }

# Read preferences
GET /api/v1/clients/+911234567890/preferences
```

---

#### Step 7 — Create a Group

```
POST /api/v1/clients/groups
Header: X-Tenant-Slug: demo-corp
Body: { "name": "VIP Travellers", "description": "Top tier customers" }
```

Response includes an auto-generated `group_code` like `vip-travellers-a3f2`.
Use this code for all subsequent group calls.

---

#### Step 8 — Add / List / Remove Group Members

```
# Add a client to the group
POST /api/v1/clients/groups/vip-travellers-a3f2/members
Body: { "mobile_number": "+911234567890" }

# List members
GET /api/v1/clients/groups/vip-travellers-a3f2/members

# Remove a member
DELETE /api/v1/clients/groups/vip-travellers-a3f2/members/+911234567890
```

---

#### Step 9 — Update and Soft-Delete a Group

```
# Update
PATCH /api/v1/clients/groups/vip-travellers-a3f2
Body: { "description": "Updated description" }

# Soft-delete (sets is_active = false, members are preserved)
DELETE /api/v1/clients/groups/vip-travellers-a3f2

# Confirm it is excluded from the default list
GET /api/v1/clients/groups

# To see all groups including inactive:
GET /api/v1/clients/groups?include_inactive=true
```

---

## Part F — Tenant Isolation Verification

A critical safety check: one tenant's token must be rejected on another tenant's endpoint.

```bash
# 1. Get a token for beta-org
curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Slug: beta-org" \
  -d '{"email":"admin@beta-org.com","password":"Admin1234!"}' \
  | grep token

# 2. Try to access acme-corp data using beta-org token — MUST return 403
curl -s http://localhost:3001/api/v1/clients \
  -H "Authorization: Bearer <beta-org-token>" \
  -H "X-Tenant-Slug: acme-corp"
```

Expected: `403 Forbidden` — the system refuses cross-tenant access.

---

## Quick Reference — All Sprint 03 Endpoints

| Method | Path | What it does |
|--------|------|--------------|
| POST | `/api/v1/clients/_provision` | Provision client schema for tenant |
| GET | `/api/v1/clients` | List clients (`status`, `search`, `page`, `limit`) |
| POST | `/api/v1/clients` | Create client |
| GET | `/api/v1/clients/:mobile` | Get client by mobile number |
| PATCH | `/api/v1/clients/:mobile` | Update client |
| DELETE | `/api/v1/clients/:mobile` | Soft-delete client |
| GET | `/api/v1/clients/:mobile/preferences` | Get preferences |
| PUT | `/api/v1/clients/:mobile/preferences` | Save preferences |
| GET | `/api/v1/clients/groups` | List groups |
| POST | `/api/v1/clients/groups` | Create group |
| GET | `/api/v1/clients/groups/:code` | Get group |
| PATCH | `/api/v1/clients/groups/:code` | Update group |
| DELETE | `/api/v1/clients/groups/:code` | Soft-delete group |
| GET | `/api/v1/clients/groups/:code/members` | List members |
| POST | `/api/v1/clients/groups/:code/members` | Add member |
| DELETE | `/api/v1/clients/groups/:code/members/:mobile` | Remove member |

All endpoints require:
- `Authorization: Bearer <token>` header
- `X-Tenant-Slug: <your-tenant-slug>` header
- Role: `admin` or `operator`

---

## Common Errors and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `{"status":"error","db":"disconnected"}` | Docker not running | `docker compose up -d` |
| `401 Unauthorized` | Missing or expired token | Re-login and get a fresh token |
| `403 Forbidden` | Wrong tenant slug or insufficient role | Check `X-Tenant-Slug` header matches your JWT |
| `400 VALIDATION_ERROR` on mobile | Not E.164 format | Use `+<countrycode><number>` e.g. `+911234567890` |
| `404 CLIENT_NOT_FOUND` | Client doesn't exist or was soft-deleted | Check mobile number or use `?status=inactive` |
| `409 MOBILE_ALREADY_EXISTS` | Duplicate create attempt | The client already exists — use PATCH to update |
| `409 ALREADY_A_MEMBER` | Member already in group | No action needed — member is present |
| Port 3001 already in use | Old server still running | Kill it: `npx kill-port 3001` then restart |

---

## Viewing Emails (Password Reset, Invites)

MailHog captures all outgoing emails locally.

Open your browser: **http://localhost:8025**

No real emails are sent. All email traffic is intercepted here.

---

## Stopping Everything

```bash
# Stop the API server
Ctrl+C   (in the terminal running npm run dev)

# Stop Docker containers
docker compose down

# Stop Docker AND delete all database data (full reset)
docker compose down -v
```

---

*Jai Jagannath!*
