# 📘 SaaS Auth API - UI Companion Guide (React Integration)

**Version:** 1.0.0
**Target Audience:** React UI Developers
**Context:** This document is the companion to `README_FULL.md` and provides precise, step-by-step instructions on integrating the API responses into React state. 

> **🚨 CRITICAL INSTRUCTION:** Read every word of this guide. Do not assume the shape of the API response. You MUST handle data exactly as specified below to prevent local state corruption.

---

## 🎯 1. Integration Test Reference

Before writing any code, review the complete API test harness and results to understand exactly how the backend behaves. 

* **The Integration Test Code:** [`packages/login-ui/src/__tests__/api-integration.test.ts`](./packages/login-ui/src/__tests__/api-integration.test.ts)
* **The Successful Test Run Output:** [`test-results-vitest.md`](./test-results-vitest.md)

You can run the test suite locally at any time:
```bash
cd packages/login-ui
npm run test
```

---

## 🏗️ 2. React State Management Requirements

A common mistake is assuming that `PATCH`, `POST`, and `DELETE` requests all return the updated entity object. **This is not always the case.**

### A. Operations That Return The Entity Object

When you update data, some endpoints will return the updated object. You can use this immediately to update your React state without a second network request.

**Endpoints:**
* `POST /operator/tenants` (Create Tenant)
* `PATCH /operator/tenants/:id` (Update Tenant Details)
* `POST /admin/users` (Create User)
* `PATCH /admin/users/:id` (Update User)

**✅ DO THIS (React State Update):**
```javascript
// Example: Updating a tenant's max Users
const response = await fetch('http://localhost:3001/operator/tenants/...', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ maxUsers: 15 })
});

const data = await response.json();

// The backend returns { message: "...", tenant: { id: "...", maxUsers: 15, ... } }
// You can directly update the local list state:
setTenants(prevTenants => prevTenants.map(t => t.id === data.tenant.id ? data.tenant : t));
```

### B. Operations That Return A "Success Message" Only

Some endpoints, particularly status toggles, only return a success message. **They do not return the updated object.**

**Endpoints:**
* `POST /operator/tenants/:id/suspend`
* `POST /operator/tenants/:id/activate`
* `DELETE /operator/tenants/:id` (Cancel Tenant)
* `DELETE /admin/users/:id` (Disable User)

**❌ DO NOT DO THIS:**
```javascript
// BAD CODE - Will crash your app!
const data = await fetch('/operator/tenants/uuid/suspend', { method: 'POST' }).then(res => res.json());

// THIS WILL FAIL: 'data.tenant' is undefined! The API only returns { message: "Tenant suspended successfully" }
setTenants(prev => prev.map(t => t.id === data.tenant.id ? data.tenant : t)); 
```

**✅ DO THIS INSTEAD:**
You must manually mutate the specific field in your local React state or trigger a full refetch.

**Option 1: Manual Local State Mutation (Fastest, UX Preferred)**
```javascript
const suspendTenant = async (tenantId) => {
  const response = await fetch(`http://localhost:3001/operator/tenants/${tenantId}/suspend`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });

  if (response.ok) {
    // 1. We know the request succeeded.
    // 2. We don't get the updated tenant back, so we manually update the 'status' in our local array.
    setTenants(prevTenants => 
      prevTenants.map(tenant => 
        tenant.id === tenantId 
          ? { ...tenant, status: 'suspended' } // Manually force the status change locally
          : tenant
      )
    );
  }
};
```

**Option 2: Trigger a Refetch (Safest, but causes loading spinners)**
```javascript
const suspendTenant = async (tenantId) => {
  const response = await fetch(`http://localhost:3001/operator/tenants/${tenantId}/suspend`, { ... });
  
  if (response.ok) {
    // Re-fetch the entire list from the server to guarantee it's up to date
    fetchAllTenants(); 
  }
};
```

---

## 📝 3. Summary Checklist for UI Tasks

1. **Check the Tests First:** Always refer to the `api-integration.test.ts` to see exactly what assertions passed during our QA cycle.
2. **Handle Messages vs Objects:** Never destruct `data.tenant` from the `suspend` or `activate` endpoints.
3. **Handle Errors Gracefully:** All API endpoints use the standardized error format described in `README_FULL.md`. Make sure your UI handles `402 Payment Required` (License Limit) gracefully.
