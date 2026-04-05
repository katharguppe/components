# 🚀 SaaS Authentication Lifecycle Guide

This guide outlines the complete flow from platform initialization to tenant-level user management.

---

## 👤 Step 1: The Seeded Root User
The system is initialized with a "Super Admin" (Root Operator). All platform operations start here.

**Seeded Credentials:**
- **Email:** `operator@yoursaas.com`
- **Password:** `Operator@Secure123!`
- **Tenant Slug:** `system`

### Root Login
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "operator@yoursaas.com",
    "password": "Operator@Secure123!",
    "tenant_slug": "system"
  }'
```
> **Action:** Copy the `access_token` from the response. This is your **ROOT_TOKEN**.

---

## 🏗️ Step 2: Root Creates a Tenant
Using the **ROOT_TOKEN**, create a new organization.

```bash
curl -X POST http://localhost:3001/operator/tenants \
  -H "Authorization: Bearer ROOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corporation",
    "slug": "acme-corp",
    "maxUsers": 5
  }'
```

---

## 🔑 Step 3: Root Creates the Tenant Admin
The Root user provisions the primary administrator for the new `acme-corp` tenant.

```bash
curl -X POST http://localhost:3001/admin/users \
  -H "Authorization: Bearer ROOT_TOKEN" \
  -H "x-tenant-slug: acme-corp" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@acme.com",
    "password": "InitialAdminPass@123!",
    "role": "admin"
  }'
```

---

## 🔐 Step 4: Tenant Admin Login
The Root user's job is done. The **Tenant Admin** now logs into their own organization.

```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@acme.com",
    "password": "InitialAdminPass@123!",
    "tenant_slug": "acme-corp"
  }'
```
> **Action:** Copy the `access_token` from the response. This is your **ADMIN_TOKEN**.

---

## 👥 Step 5: Tenant Admin Creates Users
The Tenant Admin is now the authority for `acme-corp` and creates their own team members.

```bash
curl -X POST http://localhost:3001/admin/users \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "x-tenant-slug: acme-corp" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "employee@acme.com",
    "password": "StandardUserPass@123!",
    "role": "user"
  }'
```

---

## 📋 Summary of Access Levels
| User Role | Can Create Tenants? | Can Create Admins? | Scope |
| :--- | :--- | :--- | :--- |
| **Root (Operator)** | ✅ Yes | ✅ Yes (Any Tenant) | Global Platform |
| **Tenant Admin** | ❌ No | ✅ Yes (Self Tenant) | Single Tenant |
| **Tenant User** | ❌ No | ❌ No | Single Tenant (View Only) |
