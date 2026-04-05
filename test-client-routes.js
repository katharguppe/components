#!/usr/bin/env node

/**
 * Client Routes Verification Script
 * Tests all 15 Sprint 03 endpoints for /api/v1/clients and /api/v1/clients/groups
 *
 * Prerequisites:
 * 1. Docker containers running (postgres, mailhog)
 * 2. Database migrated and seeded
 * 3. Auth BFF server running on port 3001
 *
 * Usage:  node test-client-routes.js
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

// ─── Configuration ───────────────────────────────────────────────────────────

const BASE_URL = 'http://localhost:3001';

const TEST_ACCOUNTS = {
  admin:    { email: 'admin@acme.com',    password: 'Admin@Acme123!', tenant: 'acme-corp' },
  betaAdmin:{ email: 'admin@betaorg.com', password: 'Admin@Beta123!', tenant: 'beta-org'  },
};

// Unique mobile number for this test run (avoids collision on re-runs)
const TEST_MOBILE   = `+91${Date.now().toString().slice(-10)}`;
const TEST_MOBILE_2 = `+91${(Date.now() + 1).toString().slice(-10)}`;

// ─── Test State ──────────────────────────────────────────────────────────────

let testResults    = [];
let adminToken     = null;
let betaAdminToken = null;
let createdGroupCode = null;

// ─── HTTP Helper ─────────────────────────────────────────────────────────────

function httpRequest(method, urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);

    const reqOptions = {
      hostname : url.hostname,
      port     : url.port || 3001,
      path     : url.pathname + url.search,
      method,
      headers  : {
        'Content-Type' : 'application/json',
        ...options.headers,
      },
    };

    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data',  (chunk) => { body += chunk; });
      res.on('end', () => {
        let data = null;
        try { data = JSON.parse(body); } catch { data = body; }
        resolve({ statusCode: res.statusCode, headers: res.headers, data });
      });
    });

    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

// ─── Test Helpers ────────────────────────────────────────────────────────────

function logTest(name, passed, details = '') {
  testResults.push({ name, passed, details });
  console.log(`\n${passed ? '✅ PASS' : '❌ FAIL'} - ${name}`);
  if (details) console.log(`   ${details}`);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertExists(value, message) {
  if (value === null || value === undefined || value === '') {
    throw new Error(`${message}: expected a value, got ${JSON.stringify(value)}`);
  }
}

function assertContains(str, substring, message) {
  if (!str || !String(str).includes(substring)) {
    throw new Error(`${message}: expected "${str}" to contain "${substring}"`);
  }
}

// Admin headers helper — includes tenant slug for tenantResolver
function adminHeaders(extra = {}) {
  return {
    'Authorization' : `Bearer ${adminToken}`,
    'X-Tenant-Slug' : 'acme-corp',
    ...extra,
  };
}

// ─── Setup ───────────────────────────────────────────────────────────────────

async function setup01_loginAdmin() {
  try {
    const res = await httpRequest('POST', '/auth/login', {
      body: { email: TEST_ACCOUNTS.admin.email, password: TEST_ACCOUNTS.admin.password,
              tenant_slug: TEST_ACCOUNTS.admin.tenant },
    });
    assertExists(res.data.access_token, 'access_token');
    adminToken = res.data.access_token;
    logTest('[Setup] Login as acme-corp admin', true, 'Admin token obtained');
    return true;
  } catch (error) {
    logTest('[Setup] Login as acme-corp admin', false, error.message);
    return false;
  }
}

async function setup02_provisionTenant() {
  try {
    const res = await httpRequest('POST', '/api/v1/clients/_provision', {
      headers: adminHeaders(),
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertContains(res.data.schema, 'tenant_acme_corp', 'Schema name');
    logTest('[Setup] Provision client module for acme-corp', true, `Schema: ${res.data.schema}`);
    return true;
  } catch (error) {
    logTest('[Setup] Provision client module for acme-corp', false, error.message);
    return false;
  }
}

// ─── Client Tests ─────────────────────────────────────────────────────────────

async function test01_createClient() {
  try {
    const res = await httpRequest('POST', '/api/v1/clients', {
      headers: adminHeaders(),
      body: {
        mobile_number : TEST_MOBILE,
        full_name     : 'Ravi Kumar',
        email         : `ravi.${Date.now()}@acme.com`,
        date_of_birth : '1990-05-15',
      },
    });
    assertEqual(res.statusCode, 201, 'HTTP status');
    assertEqual(res.data.client.mobile_number, TEST_MOBILE, 'mobile_number');
    assertEqual(res.data.client.full_name, 'Ravi Kumar', 'full_name');
    assertEqual(res.data.client.status, 'active', 'status');
    logTest('Create client', true, `Created ${TEST_MOBILE}`);
    return true;
  } catch (error) {
    logTest('Create client', false, error.message);
    return false;
  }
}

async function test02_createClientDuplicate() {
  try {
    const res = await httpRequest('POST', '/api/v1/clients', {
      headers: adminHeaders(),
      body: { mobile_number: TEST_MOBILE, full_name: 'Ravi Kumar Duplicate' },
    });
    assertEqual(res.statusCode, 409, 'HTTP status');
    assertEqual(res.data.code, 'MOBILE_ALREADY_EXISTS', 'error code');
    logTest('Create client (duplicate mobile)', true, '409 MOBILE_ALREADY_EXISTS');
    return true;
  } catch (error) {
    logTest('Create client (duplicate mobile)', false, error.message);
    return false;
  }
}

async function test03_createClientInvalidMobile() {
  try {
    const res = await httpRequest('POST', '/api/v1/clients', {
      headers: adminHeaders(),
      body: { mobile_number: '9876543210', full_name: 'Bad Number' },
    });
    assertEqual(res.statusCode, 400, 'HTTP status');
    assertEqual(res.data.code, 'VALIDATION_ERROR', 'error code');
    logTest('Create client (invalid mobile — no +)', true, '400 VALIDATION_ERROR');
    return true;
  } catch (error) {
    logTest('Create client (invalid mobile — no +)', false, error.message);
    return false;
  }
}

async function test04_createClientNoAuth() {
  try {
    const res = await httpRequest('POST', '/api/v1/clients', {
      headers: { 'X-Tenant-Slug': 'acme-corp' },
      body: { mobile_number: TEST_MOBILE_2, full_name: 'No Auth' },
    });
    assertEqual(res.statusCode, 401, 'HTTP status');
    logTest('Create client (no auth)', true, '401 Unauthorized');
    return true;
  } catch (error) {
    logTest('Create client (no auth)', false, error.message);
    return false;
  }
}

async function test05_listClients() {
  try {
    const res = await httpRequest('GET', '/api/v1/clients?page=1&limit=10', {
      headers: adminHeaders(),
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertEqual(Array.isArray(res.data.clients), true, 'clients is array');
    assertExists(res.data.pagination, 'pagination object');
    logTest('List clients', true, `Found ${res.data.clients.length} clients`);
    return true;
  } catch (error) {
    logTest('List clients', false, error.message);
    return false;
  }
}

async function test06_listClientsWithFilter() {
  try {
    const encoded = encodeURIComponent(TEST_MOBILE);
    const res = await httpRequest('GET', `/api/v1/clients?search=${encoded}`, {
      headers: adminHeaders(),
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertEqual(res.data.clients.length, 1, 'exactly 1 result');
    assertEqual(res.data.clients[0].mobile_number, TEST_MOBILE, 'correct client');
    logTest('List clients (search filter)', true, 'Search returned correct client');
    return true;
  } catch (error) {
    logTest('List clients (search filter)', false, error.message);
    return false;
  }
}

async function test07_getClient() {
  try {
    const encoded = encodeURIComponent(TEST_MOBILE);
    const res = await httpRequest('GET', `/api/v1/clients/${encoded}`, {
      headers: adminHeaders(),
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertEqual(res.data.mobile_number, TEST_MOBILE, 'mobile_number');
    logTest('Get client by mobile', true, `Retrieved ${TEST_MOBILE}`);
    return true;
  } catch (error) {
    logTest('Get client by mobile', false, error.message);
    return false;
  }
}

async function test08_getClientNotFound() {
  try {
    const res = await httpRequest('GET', '/api/v1/clients/%2B919999999999', {
      headers: adminHeaders(),
    });
    assertEqual(res.statusCode, 404, 'HTTP status');
    assertEqual(res.data.code, 'CLIENT_NOT_FOUND', 'error code');
    logTest('Get client (not found)', true, '404 CLIENT_NOT_FOUND');
    return true;
  } catch (error) {
    logTest('Get client (not found)', false, error.message);
    return false;
  }
}

async function test09_updateClient() {
  try {
    const encoded = encodeURIComponent(TEST_MOBILE);
    const res = await httpRequest('PATCH', `/api/v1/clients/${encoded}`, {
      headers: adminHeaders(),
      body: { full_name: 'Ravi Kumar Updated', status: 'inactive' },
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertEqual(res.data.client.full_name, 'Ravi Kumar Updated', 'full_name updated');
    assertEqual(res.data.client.status, 'inactive', 'status updated');
    logTest('Update client', true, 'Name and status updated');
    return true;
  } catch (error) {
    logTest('Update client', false, error.message);
    return false;
  }
}

async function test10_updateClientNoFields() {
  try {
    const encoded = encodeURIComponent(TEST_MOBILE);
    const res = await httpRequest('PATCH', `/api/v1/clients/${encoded}`, {
      headers: adminHeaders(),
      body: {},
    });
    assertEqual(res.statusCode, 400, 'HTTP status');
    assertEqual(res.data.code, 'VALIDATION_ERROR', 'error code');
    logTest('Update client (empty body)', true, '400 VALIDATION_ERROR');
    return true;
  } catch (error) {
    logTest('Update client (empty body)', false, error.message);
    return false;
  }
}

async function test11_upsertPreferences() {
  try {
    const encoded = encodeURIComponent(TEST_MOBILE);
    const prefs = { language: 'en', currency: 'INR', notifications: true };
    const res = await httpRequest('PUT', `/api/v1/clients/${encoded}/preferences`, {
      headers: adminHeaders(),
      body: { preferences: prefs },
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertEqual(res.data.preferences.language, 'en', 'language saved');
    assertEqual(res.data.preferences.currency, 'INR', 'currency saved');
    logTest('Upsert client preferences', true, 'Preferences saved');
    return true;
  } catch (error) {
    logTest('Upsert client preferences', false, error.message);
    return false;
  }
}

async function test12_getPreferences() {
  try {
    const encoded = encodeURIComponent(TEST_MOBILE);
    const res = await httpRequest('GET', `/api/v1/clients/${encoded}/preferences`, {
      headers: adminHeaders(),
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertEqual(res.data.mobile_number, TEST_MOBILE, 'mobile_number');
    assertEqual(res.data.preferences.language, 'en', 'preferences retrieved');
    logTest('Get client preferences', true, 'Preferences retrieved');
    return true;
  } catch (error) {
    logTest('Get client preferences', false, error.message);
    return false;
  }
}

// ─── Group Tests ─────────────────────────────────────────────────────────────

async function test13_createGroup() {
  try {
    const res = await httpRequest('POST', '/api/v1/clients/groups', {
      headers: adminHeaders(),
      body: { name: 'VIP Travellers', description: 'Top tier clients' },
    });
    assertEqual(res.statusCode, 201, 'HTTP status');
    assertExists(res.data.group.group_code, 'group_code');
    assertContains(res.data.group.group_code, 'vip-travellers', 'kebab slug in code');
    assertEqual(res.data.group.name, 'VIP Travellers', 'name');
    createdGroupCode = res.data.group.group_code;
    logTest('Create group', true, `group_code: ${createdGroupCode}`);
    return true;
  } catch (error) {
    logTest('Create group', false, error.message);
    return false;
  }
}

async function test14_createGroupValidation() {
  try {
    const res = await httpRequest('POST', '/api/v1/clients/groups', {
      headers: adminHeaders(),
      body: { name: 'X' },
    });
    assertEqual(res.statusCode, 400, 'HTTP status');
    assertEqual(res.data.code, 'VALIDATION_ERROR', 'error code');
    logTest('Create group (name too short)', true, '400 VALIDATION_ERROR');
    return true;
  } catch (error) {
    logTest('Create group (name too short)', false, error.message);
    return false;
  }
}

async function test15_listGroups() {
  try {
    const res = await httpRequest('GET', '/api/v1/clients/groups', {
      headers: adminHeaders(),
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertEqual(Array.isArray(res.data.groups), true, 'groups is array');
    logTest('List groups', true, `Found ${res.data.groups.length} groups`);
    return true;
  } catch (error) {
    logTest('List groups', false, error.message);
    return false;
  }
}

async function test16_getGroup() {
  try {
    const res = await httpRequest('GET', `/api/v1/clients/groups/${createdGroupCode}`, {
      headers: adminHeaders(),
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertEqual(res.data.group_code, createdGroupCode, 'group_code');
    logTest('Get group by code', true, `Retrieved ${createdGroupCode}`);
    return true;
  } catch (error) {
    logTest('Get group by code', false, error.message);
    return false;
  }
}

async function test17_getGroupNotFound() {
  try {
    const res = await httpRequest('GET', '/api/v1/clients/groups/nonexistent-code-0000', {
      headers: adminHeaders(),
    });
    assertEqual(res.statusCode, 404, 'HTTP status');
    assertEqual(res.data.code, 'GROUP_NOT_FOUND', 'error code');
    logTest('Get group (not found)', true, '404 GROUP_NOT_FOUND');
    return true;
  } catch (error) {
    logTest('Get group (not found)', false, error.message);
    return false;
  }
}

async function test18_updateGroup() {
  try {
    const res = await httpRequest('PATCH', `/api/v1/clients/groups/${createdGroupCode}`, {
      headers: adminHeaders(),
      body: { description: 'Updated description' },
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertEqual(res.data.group.description, 'Updated description', 'description updated');
    logTest('Update group', true, 'Description updated');
    return true;
  } catch (error) {
    logTest('Update group', false, error.message);
    return false;
  }
}

async function test19_addMemberToGroup() {
  try {
    // Re-activate the test client (was set inactive in test09)
    const encodedMobile = encodeURIComponent(TEST_MOBILE);
    await httpRequest('PATCH', `/api/v1/clients/${encodedMobile}`, {
      headers: adminHeaders(),
      body: { status: 'active' },
    });

    const res = await httpRequest('POST', `/api/v1/clients/groups/${createdGroupCode}/members`, {
      headers: adminHeaders(),
      body: { mobile_number: TEST_MOBILE },
    });
    assertEqual(res.statusCode, 201, 'HTTP status');
    assertEqual(res.data.mobile_number, TEST_MOBILE, 'mobile_number');
    logTest('Add member to group', true, `${TEST_MOBILE} added to ${createdGroupCode}`);
    return true;
  } catch (error) {
    logTest('Add member to group', false, error.message);
    return false;
  }
}

async function test20_addMemberDuplicate() {
  try {
    const res = await httpRequest('POST', `/api/v1/clients/groups/${createdGroupCode}/members`, {
      headers: adminHeaders(),
      body: { mobile_number: TEST_MOBILE },
    });
    assertEqual(res.statusCode, 409, 'HTTP status');
    assertEqual(res.data.code, 'ALREADY_A_MEMBER', 'error code');
    logTest('Add member (already a member)', true, '409 ALREADY_A_MEMBER');
    return true;
  } catch (error) {
    logTest('Add member (already a member)', false, error.message);
    return false;
  }
}

async function test21_addMemberClientNotFound() {
  try {
    const res = await httpRequest('POST', `/api/v1/clients/groups/${createdGroupCode}/members`, {
      headers: adminHeaders(),
      body: { mobile_number: '+919000000000' },
    });
    assertEqual(res.statusCode, 404, 'HTTP status');
    assertEqual(res.data.code, 'CLIENT_NOT_FOUND', 'error code');
    logTest('Add member (client not found)', true, '404 CLIENT_NOT_FOUND');
    return true;
  } catch (error) {
    logTest('Add member (client not found)', false, error.message);
    return false;
  }
}

async function test22_listGroupMembers() {
  try {
    const res = await httpRequest('GET', `/api/v1/clients/groups/${createdGroupCode}/members`, {
      headers: adminHeaders(),
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertEqual(res.data.members.length, 1, 'one member');
    assertEqual(res.data.members[0].mobile_number, TEST_MOBILE, 'correct member');
    logTest('List group members', true, `1 member in ${createdGroupCode}`);
    return true;
  } catch (error) {
    logTest('List group members', false, error.message);
    return false;
  }
}

async function test23_removeMemberFromGroup() {
  try {
    const encoded = encodeURIComponent(TEST_MOBILE);
    const res = await httpRequest('DELETE',
      `/api/v1/clients/groups/${createdGroupCode}/members/${encoded}`,
      { headers: adminHeaders() }
    );
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertContains(res.data.message, 'removed', 'success message');
    logTest('Remove member from group', true, `${TEST_MOBILE} removed`);
    return true;
  } catch (error) {
    logTest('Remove member from group', false, error.message);
    return false;
  }
}

async function test24_removeMemberNotFound() {
  try {
    const encoded = encodeURIComponent(TEST_MOBILE);
    const res = await httpRequest('DELETE',
      `/api/v1/clients/groups/${createdGroupCode}/members/${encoded}`,
      { headers: adminHeaders() }
    );
    assertEqual(res.statusCode, 404, 'HTTP status');
    assertEqual(res.data.code, 'MEMBER_NOT_FOUND', 'error code');
    logTest('Remove member (not a member)', true, '404 MEMBER_NOT_FOUND');
    return true;
  } catch (error) {
    logTest('Remove member (not a member)', false, error.message);
    return false;
  }
}

async function test25_deleteGroup() {
  try {
    const res = await httpRequest('DELETE', `/api/v1/clients/groups/${createdGroupCode}`, {
      headers: adminHeaders(),
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertContains(res.data.message, 'deactivated', 'success message');
    logTest('Delete group (soft delete)', true, `${createdGroupCode} deactivated`);
    return true;
  } catch (error) {
    logTest('Delete group (soft delete)', false, error.message);
    return false;
  }
}

async function test26_deletedGroupNotInList() {
  try {
    const res = await httpRequest('GET', '/api/v1/clients/groups', {
      headers: adminHeaders(),
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    const codes = res.data.groups.map((g) => g.group_code);
    if (codes.includes(createdGroupCode)) {
      throw new Error(`Deactivated group ${createdGroupCode} still appears in default list`);
    }
    logTest('Deactivated group excluded from default list', true, 'Soft delete working');
    return true;
  } catch (error) {
    logTest('Deactivated group excluded from default list', false, error.message);
    return false;
  }
}

async function test27_deleteClient() {
  try {
    const encoded = encodeURIComponent(TEST_MOBILE);
    const res = await httpRequest('DELETE', `/api/v1/clients/${encoded}`, {
      headers: adminHeaders(),
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertContains(res.data.message, 'deactivated', 'success message');
    logTest('Delete client (soft delete)', true, `${TEST_MOBILE} deactivated`);
    return true;
  } catch (error) {
    logTest('Delete client (soft delete)', false, error.message);
    return false;
  }
}

async function test28_deleteClientNotFound() {
  try {
    const res = await httpRequest('DELETE', '/api/v1/clients/%2B919000000000', {
      headers: adminHeaders(),
    });
    assertEqual(res.statusCode, 404, 'HTTP status');
    assertEqual(res.data.code, 'CLIENT_NOT_FOUND', 'error code');
    logTest('Delete client (not found)', true, '404 CLIENT_NOT_FOUND');
    return true;
  } catch (error) {
    logTest('Delete client (not found)', false, error.message);
    return false;
  }
}

// ─── Main Runner ──────────────────────────────────────────────────────────────

async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Client Module Routes Verification Suite                  ║');
  console.log('║  CHECKPOINT_04 — Sprint 03                                ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nTarget:  ${BASE_URL}`);
  console.log(`Mobile:  ${TEST_MOBILE}`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  // Health check
  try {
    const health = await httpRequest('GET', '/health');
    if (health.statusCode !== 200) {
      console.log('❌ Server not healthy. Start with: cd packages/auth-bff && npm run dev');
      process.exit(1);
    }
    console.log('✅ Server healthy\n');
  } catch {
    console.log('❌ Cannot connect to server on port 3001.');
    console.log('   Start with: cd packages/auth-bff && npm run dev');
    process.exit(1);
  }

  // Setup phase (must pass before test suite runs)
  const setupOk = await setup01_loginAdmin() && await setup02_provisionTenant();
  if (!setupOk) {
    console.log('\n❌ Setup failed. Cannot run tests. Check server logs.');
    process.exit(1);
  }

  // Test suite
  const tests = [
    test01_createClient,
    test02_createClientDuplicate,
    test03_createClientInvalidMobile,
    test04_createClientNoAuth,
    test05_listClients,
    test06_listClientsWithFilter,
    test07_getClient,
    test08_getClientNotFound,
    test09_updateClient,
    test10_updateClientNoFields,
    test11_upsertPreferences,
    test12_getPreferences,
    test13_createGroup,
    test14_createGroupValidation,
    test15_listGroups,
    test16_getGroup,
    test17_getGroupNotFound,
    test18_updateGroup,
    test19_addMemberToGroup,
    test20_addMemberDuplicate,
    test21_addMemberClientNotFound,
    test22_listGroupMembers,
    test23_removeMemberFromGroup,
    test24_removeMemberNotFound,
    test25_deleteGroup,
    test26_deletedGroupNotInList,
    test27_deleteClient,
    test28_deleteClientNotFound,
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const ok = await test();
      ok ? passed++ : failed++;
    } catch (error) {
      console.log(`\n❌ EXCEPTION - ${test.name}`);
      console.log(`   ${error.message}`);
      failed++;
    }
  }

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  Test Summary                                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nTotal:  ${testResults.length} tests`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ❌`);
  console.log(`\nCompleted: ${new Date().toISOString()}\n`);

  if (failed === 0) {
    console.log('🎉 All client module tests passed!\n');
    console.log('Sprint 03 Client Module: COMPLETE ✅');
    console.log('\nNext steps:');
    console.log('  1. Append README_FULL.md with Sprint 03 endpoint table');
    console.log('  2. git add + git commit all Sprint 03 files\n');
  } else {
    console.log('⚠️  Some tests failed. Review server logs.\n');
  }

  const resultsFile = path.join(__dirname, 'client-test-results.json');
  fs.writeFileSync(resultsFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    total    : testResults.length,
    passed,
    failed,
    results  : testResults,
  }, null, 2));
  console.log(`Results saved to: ${resultsFile}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch(console.error);
