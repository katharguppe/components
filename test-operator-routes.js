#!/usr/bin/env node

/**
 * Operator Routes Verification Script
 * Tests the newly implemented operator endpoints
 * 
 * Prerequisites:
 * 1. Docker containers running (postgres, mailhog)
 * 2. Database migrated and seeded
 * 3. Auth BFF server running on port 3001
 */

const http = require('http');

// ─── Configuration ──────────────────────────────────────────────────────────

const BASE_URL = 'http://localhost:3001';

// Test accounts from seed.ts
const TEST_ACCOUNTS = {
  operator: { email: 'operator@yoursaas.com', password: 'Operator@Secure123!', tenant: 'system' },
  admin: { email: 'admin@acme.com', password: 'Admin@Acme123!', tenant: 'acme-corp' },
};

// ─── Test State ─────────────────────────────────────────────────────────────

let testResults = [];
let operatorAccessToken = null;
let adminAccessToken = null;
let testTenantId = null;

// ─── HTTP Helper ────────────────────────────────────────────────────────────

function httpRequest(method, urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    
    const reqOptions = {
      hostname: url.hostname,
      port: url.port || 3001,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    const req = http.request(reqOptions, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        let data = null;
        try {
          data = JSON.parse(body);
        } catch (e) {
          data = body;
        }
        
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data,
        });
      });
    });

    req.on('error', reject);
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

// ─── Test Helpers ───────────────────────────────────────────────────────────

function logTest(name, passed, details = '') {
  testResults.push({ name, passed, details });
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`\n${status} - ${name}`);
  if (details) {
    console.log(`   ${details}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertContains(str, substring, message) {
  if (!str || !str.includes(substring)) {
    throw new Error(`${message}: expected to contain "${substring}", got "${str}"`);
  }
}

// ─── Helper: Login ──────────────────────────────────────────────────────────

async function login(email, password, tenant) {
  const res = await httpRequest('POST', '/auth/login', {
    body: { email, password, tenant_slug: tenant },
  });
  return res.data.access_token;
}

// ─── Test Cases ─────────────────────────────────────────────────────────────

async function test01_loginAsOperator() {
  try {
    operatorAccessToken = await login(
      TEST_ACCOUNTS.operator.email,
      TEST_ACCOUNTS.operator.password,
      TEST_ACCOUNTS.operator.tenant
    );
    
    assertContains(operatorAccessToken, 'eyJ', 'Token format');
    
    logTest('Login as Operator', true, 'Operator token obtained');
    return true;
  } catch (error) {
    logTest('Login as Operator', false, error.message);
    return false;
  }
}

async function test02_loginAsAdmin() {
  try {
    adminAccessToken = await login(
      TEST_ACCOUNTS.admin.email,
      TEST_ACCOUNTS.admin.password,
      TEST_ACCOUNTS.admin.tenant
    );
    
    assertContains(adminAccessToken, 'eyJ', 'Token format');
    
    logTest('Login as Admin', true, 'Admin token obtained');
    return true;
  } catch (error) {
    logTest('Login as Admin', false, error.message);
    return false;
  }
}

async function test03_listTenants() {
  try {
    const res = await httpRequest('GET', '/operator/tenants', {
      headers: { 'Authorization': `Bearer ${operatorAccessToken}` },
    });
    
    assertEqual(res.statusCode, 200, 'Status code');
    assertEqual(Array.isArray(res.data.tenants), true, 'Tenants is array');
    assertEqual(res.data.total >= 2, true, 'Has at least 2 tenants');
    
    logTest('List Tenants (Operator)', true, `Found ${res.data.total} tenants`);
    return true;
  } catch (error) {
    logTest('List Tenants (Operator)', false, error.message);
    return false;
  }
}

async function test04_listTenantsUnauthorized() {
  try {
    const res = await httpRequest('GET', '/operator/tenants', {
      headers: { 'Authorization': `Bearer ${adminAccessToken}` },
    });
    
    // Should fail - regular admins can't access operator routes
    assertEqual(res.statusCode, 403, 'Status code');
    
    logTest('List Tenants (Unauthorized)', true, 'Correctly rejected');
    return true;
  } catch (error) {
    logTest('List Tenants (Unauthorized)', false, error.message);
    return false;
  }
}

async function test05_listTenantsNoAuth() {
  try {
    const res = await httpRequest('GET', '/operator/tenants');
    
    assertEqual(res.statusCode, 401, 'Status code');
    assertEqual(res.data.code, 'MISSING_TOKEN', 'Error code');
    
    logTest('List Tenants (No Auth)', true, 'Correctly rejected');
    return true;
  } catch (error) {
    logTest('List Tenants (No Auth)', false, error.message);
    return false;
  }
}

async function test06_createTenant() {
  try {
    const newTenant = {
      name: `Test Tenant ${Date.now()}`,
      slug: `test-tenant-${Date.now()}`,
      maxUsers: 10,
    };
    
    const res = await httpRequest('POST', '/operator/tenants', {
      headers: { 'Authorization': `Bearer ${operatorAccessToken}` },
      body: newTenant,
    });
    
    assertEqual(res.statusCode, 201, 'Status code');
    assertEqual(res.data.tenant.name, newTenant.name, 'Name matches');
    assertEqual(res.data.tenant.slug, newTenant.slug, 'Slug matches');
    assertEqual(res.data.tenant.maxUsers, newTenant.maxUsers, 'maxUsers matches');
    
    testTenantId = res.data.tenant.id;
    
    logTest('Create Tenant', true, `Tenant created: ${res.data.tenant.name}`);
    return true;
  } catch (error) {
    logTest('Create Tenant', false, error.message);
    return false;
  }
}

async function test07_createTenantDuplicateSlug() {
  try {
    const res = await httpRequest('POST', '/operator/tenants', {
      headers: { 'Authorization': `Bearer ${operatorAccessToken}` },
      body: {
        name: 'Duplicate Tenant',
        slug: 'acme-corp', // Already exists
        maxUsers: 5,
      },
    });
    
    assertEqual(res.statusCode, 409, 'Status code');
    assertEqual(res.data.code, 'SLUG_ALREADY_EXISTS', 'Error code');
    
    logTest('Create Tenant (Duplicate Slug)', true, 'Correctly rejected');
    return true;
  } catch (error) {
    logTest('Create Tenant (Duplicate Slug)', false, error.message);
    return false;
  }
}

async function test08_createTenantInvalidSlug() {
  try {
    const res = await httpRequest('POST', '/operator/tenants', {
      headers: { 'Authorization': `Bearer ${operatorAccessToken}` },
      body: {
        name: 'Invalid Tenant',
        slug: 'INVALID_SLUG!', // Invalid characters
        maxUsers: 5,
      },
    });
    
    assertEqual(res.statusCode, 400, 'Status code');
    
    logTest('Create Tenant (Invalid Slug)', true, 'Correctly rejected');
    return true;
  } catch (error) {
    logTest('Create Tenant (Invalid Slug)', false, error.message);
    return false;
  }
}

async function test09_getTenant() {
  try {
    const res = await httpRequest('GET', `/operator/tenants/${testTenantId}`, {
      headers: { 'Authorization': `Bearer ${operatorAccessToken}` },
    });
    
    assertEqual(res.statusCode, 200, 'Status code');
    assertEqual(res.data.id, testTenantId, 'Tenant ID matches');
    assertEqual(Array.isArray(res.data.users), true, 'Users is array');
    
    logTest('Get Tenant', true, `Tenant retrieved: ${res.data.name}`);
    return true;
  } catch (error) {
    logTest('Get Tenant', false, error.message);
    return false;
  }
}

async function test10_updateTenant() {
  try {
    const res = await httpRequest('PATCH', `/operator/tenants/${testTenantId}`, {
      headers: { 'Authorization': `Bearer ${operatorAccessToken}` },
      body: { maxUsers: 15 },
    });
    
    assertEqual(res.statusCode, 200, 'Status code');
    assertEqual(res.data.tenant.maxUsers, 15, 'maxUsers updated');
    
    logTest('Update Tenant (maxUsers)', true, 'maxUsers changed to 15');
    return true;
  } catch (error) {
    logTest('Update Tenant (maxUsers)', false, error.message);
    return false;
  }
}

async function test11_suspendTenant() {
  try {
    const res = await httpRequest('POST', `/operator/tenants/${testTenantId}/suspend`, {
      headers: { 'Authorization': `Bearer ${operatorAccessToken}` },
    });
    
    assertEqual(res.statusCode, 200, 'Status code');
    assertContains(res.data.message, 'suspended', 'Success message');
    
    logTest('Suspend Tenant', true, 'Tenant suspended');
    return true;
  } catch (error) {
    logTest('Suspend Tenant', false, error.message);
    return false;
  }
}

async function test12_activateTenant() {
  try {
    const res = await httpRequest('POST', `/operator/tenants/${testTenantId}/activate`, {
      headers: { 'Authorization': `Bearer ${operatorAccessToken}` },
    });
    
    assertEqual(res.statusCode, 200, 'Status code');
    assertContains(res.data.message, 'activated', 'Success message');
    
    logTest('Activate Tenant', true, 'Tenant activated');
    return true;
  } catch (error) {
    logTest('Activate Tenant', false, error.message);
    return false;
  }
}

async function test13_getPlatformStats() {
  try {
    const res = await httpRequest('GET', '/operator/stats', {
      headers: { 'Authorization': `Bearer ${operatorAccessToken}` },
    });
    
    assertEqual(res.statusCode, 200, 'Status code');
    assertEqual(typeof res.data.stats.tenants.total, 'number', 'Total tenants');
    assertEqual(typeof res.data.stats.users.total, 'number', 'Total users');
    assertEqual(Array.isArray(res.data.recentTenants), true, 'Recent tenants');
    
    logTest('Get Platform Stats', true, 
      `Tenants: ${res.data.stats.tenants.total}, Users: ${res.data.stats.users.total}`);
    return true;
  } catch (error) {
    logTest('Get Platform Stats', false, error.message);
    return false;
  }
}

async function test14_deleteTenant() {
  try {
    const res = await httpRequest('DELETE', `/operator/tenants/${testTenantId}`, {
      headers: { 'Authorization': `Bearer ${operatorAccessToken}` },
    });
    
    assertEqual(res.statusCode, 200, 'Status code');
    assertContains(res.data.message, 'cancelled', 'Success message');
    
    logTest('Delete (Cancel) Tenant', true, 'Tenant cancelled');
    return true;
  } catch (error) {
    logTest('Delete (Cancel) Tenant', false, error.message);
    return false;
  }
}

async function test15_deleteTenantWithUsers() {
  try {
    // Try to delete acme-corp which has users
    const acmeTenant = await httpRequest('GET', '/operator/tenants', {
      headers: { 'Authorization': `Bearer ${operatorAccessToken}` },
    });
    
    const acmeId = acmeTenant.data.tenants.find(t => t.slug === 'acme-corp')?.id;
    
    if (!acmeId) {
      logTest('Delete Tenant with Users', false, 'Could not find acme-corp tenant');
      return false;
    }
    
    const res = await httpRequest('DELETE', `/operator/tenants/${acmeId}`, {
      headers: { 'Authorization': `Bearer ${operatorAccessToken}` },
    });
    
    assertEqual(res.statusCode, 400, 'Status code');
    assertEqual(res.data.code, 'TENANT_HAS_USERS', 'Error code');
    
    logTest('Delete Tenant with Users', true, 'Correctly rejected');
    return true;
  } catch (error) {
    logTest('Delete Tenant with Users', false, error.message);
    return false;
  }
}

// ─── Main Runner ────────────────────────────────────────────────────────────

async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Operator Routes Verification Suite                       ║');
  console.log('║  CHECKPOINT_02 - Phase 2 Completion                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nTarget: ${BASE_URL}`);
  console.log(`Started: ${new Date().toISOString()}\n`);
  
  // Check if server is running
  try {
    const healthRes = await httpRequest('GET', '/health');
    if (healthRes.statusCode !== 200) {
      console.log('❌ Server is not healthy. Please start the Auth BFF server first.');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ Cannot connect to server. Is it running on port 3001?');
    console.log('   Start with: cd packages/auth-bff && npm run dev');
    process.exit(1);
  }
  
  // Run all tests
  const tests = [
    test01_loginAsOperator,
    test02_loginAsAdmin,
    test03_listTenants,
    test04_listTenantsUnauthorized,
    test05_listTenantsNoAuth,
    test06_createTenant,
    test07_createTenantDuplicateSlug,
    test08_createTenantInvalidSlug,
    test09_getTenant,
    test10_updateTenant,
    test11_suspendTenant,
    test12_activateTenant,
    test13_getPlatformStats,
    test14_deleteTenant,
    test15_deleteTenantWithUsers,
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      const result = await test();
      if (result) {
        passed++;
      } else {
        failed++;
      }
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
    console.log('🎉 All operator routes tests passed!\n');
    console.log('Operator Routes Implementation: COMPLETE ✅');
    console.log('\nPHASE 2 IS NOW COMPLETE!');
    console.log('\nNext steps:');
    console.log('  1. Run full verification suite (verify.bat)');
    console.log('  2. Create CHECKPOINT_03');
    console.log('  3. Begin Phase 3 - Login UI Component\n');
  } else {
    console.log('⚠️  Some tests failed. Review the implementation.\n');
  }
  
  // Write results to file
  const fs = require('fs');
  const path = require('path');
  const resultsFile = path.join(__dirname, 'operator-test-results.json');
  fs.writeFileSync(resultsFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    total: testResults.length,
    passed,
    failed,
    results: testResults,
  }, null, 2));
  
  console.log(`Results saved to: ${resultsFile}\n`);
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(console.error);
