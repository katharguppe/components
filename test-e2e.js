#!/usr/bin/env node
/**
 * End-to-End Test Suite — All Sprints
 * Sprint 01: Auth (login, refresh, /me, logout)
 * Sprint 02: Operator (tenant CRUD) + Admin (user CRUD, license)
 * Sprint 03: Client module (provision, clients CRUD, groups CRUD, membership)
 *
 * Run: node test-e2e.js
 * Prerequisite: server on :3001, Docker containers up
 */

'use strict';
const http = require('http');
const BASE = 'http://localhost:3001';

// ─── Unique mobile numbers so parallel runs don't collide ───────────────────
const TS          = Date.now().toString().slice(-9);
const CLIENT_MOB  = `+91${TS}`;
const CLIENT_MOB2 = `+91${(Date.now()+2).toString().slice(-9)}`;

// ─── Seeded accounts ────────────────────────────────────────────────────────
const OPERATOR = { email: 'operator@yoursaas.com', password: 'Operator@Secure123!', tenant: 'system' };
const ADMIN    = { email: 'admin@acme.com',         password: 'Admin@Acme123!',      tenant: 'acme-corp' };
const USER     = { email: 'alice@acme.com',         password: 'User@Acme123!',       tenant: 'acme-corp' };

// ─── State shared across tests ──────────────────────────────────────────────
let operatorToken = null;
let adminToken    = null;
let userToken     = null;
let createdTenantId = null;
let createdUserId   = null;
let groupCode       = null;

// ─── Results ─────────────────────────────────────────────────────────────────
const results = [];
let passed = 0, failed = 0;

// ─── HTTP helper ─────────────────────────────────────────────────────────────
function req(method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost', port: 3001,
      path, method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    const r = http.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        let data;
        try { data = JSON.parse(raw); } catch { data = raw; }
        resolve({ status: res.statusCode, data });
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

// ─── Assertion helpers ───────────────────────────────────────────────────────
function check(name, cond, detail = '') {
  if (cond) {
    passed++;
    results.push({ name, ok: true });
    console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    failed++;
    results.push({ name, ok: false, detail });
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function section(title) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'─'.repeat(60)}`);
}

// ════════════════════════════════════════════════════════════════
//  SPRINT 01 — AUTHENTICATION
// ════════════════════════════════════════════════════════════════

async function s01_health() {
  const r = await req('GET', '/health');
  check('Health check — server up', r.status === 200);
  check('Health check — db connected', r.data.db === 'connected', r.data.db);
}

async function s01_loginOperator() {
  const r = await req('POST', '/auth/login', {
    body: { email: OPERATOR.email, password: OPERATOR.password, tenant_slug: OPERATOR.tenant },
  });
  check('Operator login', r.status === 200, r.data.message || '');
  if (r.data.access_token) operatorToken = r.data.access_token;
  check('Operator token received', !!operatorToken);
}

async function s01_loginAdmin() {
  const r = await req('POST', '/auth/login', {
    body: { email: ADMIN.email, password: ADMIN.password, tenant_slug: ADMIN.tenant },
  });
  check('Admin login', r.status === 200);
  if (r.data.access_token) adminToken = r.data.access_token;
  check('Admin token received', !!adminToken);
}

async function s01_loginUser() {
  const r = await req('POST', '/auth/login', {
    body: { email: USER.email, password: USER.password, tenant_slug: USER.tenant },
  });
  check('Regular user login', r.status === 200);
  if (r.data.access_token) userToken = r.data.access_token;
}

async function s01_loginBadPassword() {
  const r = await req('POST', '/auth/login', {
    body: { email: ADMIN.email, password: 'wrongpassword', tenant_slug: ADMIN.tenant },
  });
  check('Login rejects bad password (401)', r.status === 401);
}

async function s01_loginNoTenant() {
  const r = await req('POST', '/auth/login', {
    body: { email: ADMIN.email, password: ADMIN.password },
  });
  check('Login rejects missing tenant slug (400)', r.status === 400);
}

async function s01_me() {
  const r = await req('GET', '/auth/me', {
    headers: { 'Authorization': `Bearer ${adminToken}`, 'X-Tenant-Slug': ADMIN.tenant },
  });
  check('GET /auth/me returns profile', r.status === 200);
  check('GET /auth/me — correct email', r.data.email === ADMIN.email, r.data.email);
}

async function s01_meNoAuth() {
  const r = await req('GET', '/auth/me');
  check('GET /auth/me — 401 without token', r.status === 401);
}

async function s01_jwks() {
  const r = await req('GET', '/.well-known/jwks.json');
  check('JWKS endpoint returns keys', r.status === 200);
  check('JWKS has keys array', Array.isArray(r.data.keys) && r.data.keys.length > 0);
}

// ════════════════════════════════════════════════════════════════
//  SPRINT 02A — OPERATOR: TENANT MANAGEMENT
// ════════════════════════════════════════════════════════════════

async function s02_listTenants() {
  const r = await req('GET', '/operator/tenants', {
    headers: { 'Authorization': `Bearer ${operatorToken}`, 'X-Tenant-Slug': 'system' },
  });
  check('Operator — list tenants (200)', r.status === 200);
  check('Operator — tenants is array', Array.isArray(r.data.tenants || r.data));
}

async function s02_listTenantsNoAuth() {
  const r = await req('GET', '/operator/tenants');
  check('Operator — list tenants 401 without auth', r.status === 401);
}

async function s02_listTenantsWrongRole() {
  const r = await req('GET', '/operator/tenants', {
    headers: { 'Authorization': `Bearer ${adminToken}`, 'X-Tenant-Slug': ADMIN.tenant },
  });
  check('Operator — admin cannot list tenants (403)', r.status === 403);
}

async function s02_createTenant() {
  const slug = `e2e-tenant-${TS}`;
  const r = await req('POST', '/operator/tenants', {
    headers: { 'Authorization': `Bearer ${operatorToken}`, 'X-Tenant-Slug': 'system' },
    body: {
      name: 'E2E Test Corp',
      slug,
      adminEmail: `admin@${slug}.com`,
      adminPassword: 'Admin@E2E123!',
      maxUsers: 10,
    },
  });
  check('Operator — create tenant (201)', r.status === 201);
  if (r.data.tenant?.id) createdTenantId = r.data.tenant.id;
  check('Operator — new tenant id returned', !!createdTenantId, createdTenantId);
}

async function s02_createTenantDuplicateSlug() {
  const r = await req('POST', '/operator/tenants', {
    headers: { 'Authorization': `Bearer ${operatorToken}`, 'X-Tenant-Slug': 'system' },
    body: { name: 'Acme Dupe', slug: 'acme-corp', adminEmail: 'x@x.com', adminPassword: 'Admin@123!' },
  });
  check('Operator — duplicate slug rejected (409)', r.status === 409);
}

async function s02_platformStats() {
  const r = await req('GET', '/operator/stats', {
    headers: { 'Authorization': `Bearer ${operatorToken}`, 'X-Tenant-Slug': 'system' },
  });
  check('Operator — platform stats (200)', r.status === 200);
}

async function s02_suspendTenant() {
  if (!createdTenantId) return check('Operator — suspend tenant', false, 'no tenant id');
  const r = await req('POST', `/operator/tenants/${createdTenantId}/suspend`, {
    headers: { 'Authorization': `Bearer ${operatorToken}`, 'X-Tenant-Slug': 'system' },
  });
  check('Operator — suspend tenant (200)', r.status === 200);
}

async function s02_activateTenant() {
  if (!createdTenantId) return check('Operator — activate tenant', false, 'no tenant id');
  const r = await req('POST', `/operator/tenants/${createdTenantId}/activate`, {
    headers: { 'Authorization': `Bearer ${operatorToken}`, 'X-Tenant-Slug': 'system' },
  });
  check('Operator — activate tenant (200)', r.status === 200);
}

async function s02_deleteTenant() {
  if (!createdTenantId) return check('Operator — delete tenant', false, 'no tenant id');
  const r = await req('DELETE', `/operator/tenants/${createdTenantId}`, {
    headers: { 'Authorization': `Bearer ${operatorToken}`, 'X-Tenant-Slug': 'system' },
  });
  check('Operator — delete e2e tenant (200/204)', r.status === 200 || r.status === 204);
}

// ════════════════════════════════════════════════════════════════
//  SPRINT 02B — ADMIN: USER MANAGEMENT
// ════════════════════════════════════════════════════════════════

async function s02_listUsers() {
  const r = await req('GET', '/admin/users', {
    headers: { 'Authorization': `Bearer ${adminToken}`, 'X-Tenant-Slug': ADMIN.tenant },
  });
  check('Admin — list users (200)', r.status === 200);
  check('Admin — users is array', Array.isArray(r.data.users || r.data));
}

async function s02_listUsersNoAuth() {
  const r = await req('GET', '/admin/users', {
    headers: { 'X-Tenant-Slug': ADMIN.tenant },
  });
  check('Admin — list users 401 without auth', r.status === 401);
}

async function s02_createUser() {
  const r = await req('POST', '/admin/users', {
    headers: { 'Authorization': `Bearer ${adminToken}`, 'X-Tenant-Slug': ADMIN.tenant },
    body: {
      email: `e2euser${TS}@acme.com`,
      password: 'User@E2E1234!',
      firstName: 'E2E',
      lastName: 'User',
      role: 'user',
    },
  });
  check('Admin — create user (201)', r.status === 201);
  if (r.data.user?.id) createdUserId = r.data.user.id;
  check('Admin — new user id returned', !!createdUserId, createdUserId);
}

async function s02_createUserWeakPassword() {
  const r = await req('POST', '/admin/users', {
    headers: { 'Authorization': `Bearer ${adminToken}`, 'X-Tenant-Slug': ADMIN.tenant },
    body: { email: `weak${TS}@acme.com`, password: '123', firstName: 'W', lastName: 'P', role: 'user' },
  });
  check('Admin — weak password rejected (400)', r.status === 400);
}

async function s02_getUser() {
  if (!createdUserId) return check('Admin — get user', false, 'no user id');
  const r = await req('GET', `/admin/users/${createdUserId}`, {
    headers: { 'Authorization': `Bearer ${adminToken}`, 'X-Tenant-Slug': ADMIN.tenant },
  });
  check('Admin — get user by id (200)', r.status === 200);
}

async function s02_updateUser() {
  if (!createdUserId) return check('Admin — update user', false, 'no user id');
  const r = await req('PATCH', `/admin/users/${createdUserId}`, {
    headers: { 'Authorization': `Bearer ${adminToken}`, 'X-Tenant-Slug': ADMIN.tenant },
    body: { firstName: 'UpdatedE2E' },
  });
  check('Admin — update user (200)', r.status === 200);
}

async function s02_disableUser() {
  if (!createdUserId) return check('Admin — disable user', false, 'no user id');
  const r = await req('DELETE', `/admin/users/${createdUserId}`, {
    headers: { 'Authorization': `Bearer ${adminToken}`, 'X-Tenant-Slug': ADMIN.tenant },
  });
  check('Admin — disable user (200)', r.status === 200);
}

async function s02_getLicense() {
  const r = await req('GET', '/admin/license', {
    headers: { 'Authorization': `Bearer ${adminToken}`, 'X-Tenant-Slug': ADMIN.tenant },
  });
  check('Admin — get license info (200)', r.status === 200);
}

async function s02_adminWrongTenant() {
  // Admin routes enforce tenant via RLS on the JWT, not the header.
  // The header is ignored; acme-corp admin always sees only acme-corp users.
  const r = await req('GET', '/admin/users', {
    headers: { 'Authorization': `Bearer ${adminToken}`, 'X-Tenant-Slug': 'beta-org' },
  });
  check('Admin — wrong-tenant header still returns 200 (RLS via DB context)', r.status === 200);
  check('Admin — response has users array', Array.isArray(r.data.users));
}

// ════════════════════════════════════════════════════════════════
//  SPRINT 03 — CLIENT MODULE
// ════════════════════════════════════════════════════════════════

function clientHeaders() {
  return { 'Authorization': `Bearer ${adminToken}`, 'X-Tenant-Slug': ADMIN.tenant };
}

async function s03_provision() {
  const r = await req('POST', '/api/v1/clients/_provision', { headers: clientHeaders() });
  check('Client module — provision schema (200)', r.status === 200);
  check('Client module — schema name returned', !!r.data.schema, r.data.schema);
}

async function s03_createClient() {
  const r = await req('POST', '/api/v1/clients', {
    headers: clientHeaders(),
    body: { mobile_number: CLIENT_MOB, full_name: 'E2E Tester', email: `e2e${TS}@test.com` },
  });
  check('Client — create (201)', r.status === 201);
  check('Client — mobile returned', r.data.client?.mobile_number === CLIENT_MOB);
}

async function s03_createClientDuplicate() {
  const r = await req('POST', '/api/v1/clients', {
    headers: clientHeaders(),
    body: { mobile_number: CLIENT_MOB, full_name: 'E2E Dupe' },
  });
  check('Client — duplicate mobile rejected (409)', r.status === 409);
}

async function s03_createClientInvalidMobile() {
  const r = await req('POST', '/api/v1/clients', {
    headers: clientHeaders(),
    body: { mobile_number: '9999999999', full_name: 'Bad Mobile' },
  });
  check('Client — invalid mobile rejected (400)', r.status === 400);
}

async function s03_listClients() {
  const r = await req('GET', '/api/v1/clients', { headers: clientHeaders() });
  check('Client — list (200)', r.status === 200);
  check('Client — clients array', Array.isArray(r.data.clients));
}

async function s03_getClient() {
  const enc = encodeURIComponent(CLIENT_MOB);
  const r = await req('GET', `/api/v1/clients/${enc}`, { headers: clientHeaders() });
  check('Client — get by mobile (200)', r.status === 200);
  check('Client — correct mobile returned', r.data.mobile_number === CLIENT_MOB);
}

async function s03_getClientNotFound() {
  const r = await req('GET', `/api/v1/clients/${encodeURIComponent('+910000000001')}`, { headers: clientHeaders() });
  check('Client — not found (404)', r.status === 404);
}

async function s03_updateClient() {
  const enc = encodeURIComponent(CLIENT_MOB);
  const r = await req('PATCH', `/api/v1/clients/${enc}`, {
    headers: clientHeaders(),
    body: { full_name: 'E2E Tester Updated' },
  });
  check('Client — update (200)', r.status === 200);
}

async function s03_upsertPreferences() {
  const enc = encodeURIComponent(CLIENT_MOB);
  const r = await req('PUT', `/api/v1/clients/${enc}/preferences`, {
    headers: clientHeaders(),
    body: { preferences: { language: 'en', notifications: true } },
  });
  check('Client — upsert preferences (200)', r.status === 200);
}

async function s03_getPreferences() {
  const enc = encodeURIComponent(CLIENT_MOB);
  const r = await req('GET', `/api/v1/clients/${enc}/preferences`, { headers: clientHeaders() });
  check('Client — get preferences (200)', r.status === 200);
  check('Client — preferences contain language', r.data.preferences?.language === 'en');
}

async function s03_createGroup() {
  const r = await req('POST', '/api/v1/clients/groups', {
    headers: clientHeaders(),
    body: { name: `E2E Group ${TS}`, description: 'end-to-end test group' },
  });
  check('Group — create (201)', r.status === 201);
  if (r.data.group?.group_code) groupCode = r.data.group.group_code;
  check('Group — group_code returned', !!groupCode, groupCode);
}

async function s03_listGroups() {
  const r = await req('GET', '/api/v1/clients/groups', { headers: clientHeaders() });
  check('Group — list (200)', r.status === 200);
  check('Group — groups array', Array.isArray(r.data.groups));
}

async function s03_getGroup() {
  if (!groupCode) return check('Group — get by code', false, 'no group_code');
  const r = await req('GET', `/api/v1/clients/groups/${groupCode}`, { headers: clientHeaders() });
  check('Group — get by code (200)', r.status === 200);
}

async function s03_updateGroup() {
  if (!groupCode) return check('Group — update', false, 'no group_code');
  const r = await req('PATCH', `/api/v1/clients/groups/${groupCode}`, {
    headers: clientHeaders(),
    body: { description: 'updated description' },
  });
  check('Group — update (200)', r.status === 200);
}

async function s03_addMember() {
  if (!groupCode) return check('Group — add member', false, 'no group_code');
  const r = await req('POST', `/api/v1/clients/groups/${groupCode}/members`, {
    headers: clientHeaders(),
    body: { mobile_number: CLIENT_MOB },
  });
  check('Group — add member (201)', r.status === 201);
}

async function s03_addMemberDuplicate() {
  if (!groupCode) return check('Group — add member duplicate', false, 'no group_code');
  const r = await req('POST', `/api/v1/clients/groups/${groupCode}/members`, {
    headers: clientHeaders(),
    body: { mobile_number: CLIENT_MOB },
  });
  check('Group — duplicate member rejected (409)', r.status === 409);
}

async function s03_listMembers() {
  if (!groupCode) return check('Group — list members', false, 'no group_code');
  const r = await req('GET', `/api/v1/clients/groups/${groupCode}/members`, { headers: clientHeaders() });
  check('Group — list members (200)', r.status === 200);
  check('Group — member present', Array.isArray(r.data.members) && r.data.members.length === 1);
}

async function s03_removeMember() {
  if (!groupCode) return check('Group — remove member', false, 'no group_code');
  const enc = encodeURIComponent(CLIENT_MOB);
  const r = await req('DELETE', `/api/v1/clients/groups/${groupCode}/members/${enc}`, { headers: clientHeaders() });
  check('Group — remove member (200)', r.status === 200);
}

async function s03_deleteGroup() {
  if (!groupCode) return check('Group — soft delete', false, 'no group_code');
  const r = await req('DELETE', `/api/v1/clients/groups/${groupCode}`, { headers: clientHeaders() });
  check('Group — soft delete (200)', r.status === 200);
}

async function s03_softDeletedGroupExcluded() {
  if (!groupCode) return check('Group — soft delete excluded from list', false, 'no group_code');
  const r = await req('GET', '/api/v1/clients/groups', { headers: clientHeaders() });
  const groups = r.data.groups || [];
  const found = groups.some(g => g.group_code === groupCode);
  check('Group — soft-deleted excluded from default list', !found);
}

async function s03_deleteClient() {
  const enc = encodeURIComponent(CLIENT_MOB);
  const r = await req('DELETE', `/api/v1/clients/${enc}`, { headers: clientHeaders() });
  check('Client — soft delete (200)', r.status === 200);
}

async function s03_tenantIsolation() {
  // Unauthenticated request must be rejected
  const r1 = await req('GET', '/api/v1/clients', {
    headers: { 'X-Tenant-Slug': ADMIN.tenant },
  });
  check('Security — unauthenticated client access rejected (401)', r1.status === 401);

  // Wrong role (regular user token) must be rejected
  const r2 = await req('GET', '/api/v1/clients', {
    headers: { 'Authorization': `Bearer ${userToken}`, 'X-Tenant-Slug': ADMIN.tenant },
  });
  check('Security — non-admin role rejected on client routes (403)', r2.status === 403);
}

// ─── Logout last ────────────────────────────────────────────────
async function s01_logout() {
  const r = await req('POST', '/auth/logout', {
    headers: { 'Authorization': `Bearer ${adminToken}`, 'X-Tenant-Slug': ADMIN.tenant },
  });
  check('Auth — logout (200)', r.status === 200);
}

// ════════════════════════════════════════════════════════════════
//  RUNNER
// ════════════════════════════════════════════════════════════════

async function run() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  End-to-End Test Suite — Sprint 01 + 02 + 03             ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Target : ${BASE}`);
  console.log(`  Mobile : ${CLIENT_MOB}`);
  console.log(`  Started: ${new Date().toISOString()}`);

  // ── Sprint 01: Auth ──────────────────────────────────────────
  section('SPRINT 01 — Auth');
  await s01_health();
  await s01_loginOperator();
  await s01_loginAdmin();
  await s01_loginUser();
  await s01_loginBadPassword();
  await s01_loginNoTenant();
  await s01_me();
  await s01_meNoAuth();
  await s01_jwks();

  // ── Sprint 02A: Operator ─────────────────────────────────────
  section('SPRINT 02A — Operator: Tenant Management');
  await s02_listTenants();
  await s02_listTenantsNoAuth();
  await s02_listTenantsWrongRole();
  await s02_createTenant();
  await s02_createTenantDuplicateSlug();
  await s02_platformStats();
  await s02_suspendTenant();
  await s02_activateTenant();
  await s02_deleteTenant();

  // ── Sprint 02B: Admin ────────────────────────────────────────
  section('SPRINT 02B — Admin: User Management');
  await s02_listUsers();
  await s02_listUsersNoAuth();
  await s02_createUser();
  await s02_createUserWeakPassword();
  await s02_getUser();
  await s02_updateUser();
  await s02_disableUser();
  await s02_getLicense();
  await s02_adminWrongTenant();

  // ── Sprint 03: Client Module ─────────────────────────────────
  section('SPRINT 03 — Client Module');
  await s03_provision();
  await s03_createClient();
  await s03_createClientDuplicate();
  await s03_createClientInvalidMobile();
  await s03_listClients();
  await s03_getClient();
  await s03_getClientNotFound();
  await s03_updateClient();
  await s03_upsertPreferences();
  await s03_getPreferences();
  await s03_createGroup();
  await s03_listGroups();
  await s03_getGroup();
  await s03_updateGroup();
  await s03_addMember();
  await s03_addMemberDuplicate();
  await s03_listMembers();
  await s03_removeMember();
  await s03_deleteGroup();
  await s03_softDeletedGroupExcluded();
  await s03_deleteClient();
  await s03_tenantIsolation();

  // ── Cleanup ──────────────────────────────────────────────────
  section('Cleanup');
  await s01_logout();

  // ── Summary ──────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  Summary                                                 ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Total  : ${passed + failed}`);
  console.log(`  Passed : ${passed} ✅`);
  console.log(`  Failed : ${failed} ❌`);

  if (failed > 0) {
    console.log('\n  Failed tests:');
    results.filter(r => !r.ok).forEach(r => console.log(`    ✗ ${r.name}${r.detail ? ' — ' + r.detail : ''}`));
  }

  console.log(`\n  Completed: ${new Date().toISOString()}`);

  if (failed === 0) {
    console.log('\n  🎉 All sprints passing — full stack healthy!\n');
  } else {
    console.log('\n  ⚠️  Some tests failed — see above.\n');
    process.exit(1);
  }
}

run().catch(err => { console.error(err); process.exit(1); });
