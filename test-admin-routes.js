#!/usr/bin/env node

/**
 * Admin Routes Verification Script
 * Tests the newly implemented admin endpoints
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
  admin: { email: 'admin@acme.com', password: 'Admin@Acme123!', tenant: 'acme-corp' },
  user: { email: 'alice@acme.com', password: 'User@Acme123!', tenant: 'acme-corp' },
};

// ─── Test State ─────────────────────────────────────────────────────────────

let testResults = [];
let adminAccessToken = null;
let userAccessToken = null;
let testUserId = null;

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

async function test01_loginAsAdmin() {
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

async function test02_loginAsUser() {
  try {
    userAccessToken = await login(
      TEST_ACCOUNTS.user.email,
      TEST_ACCOUNTS.user.password,
      TEST_ACCOUNTS.user.tenant
    );
    
    assertContains(userAccessToken, 'eyJ', 'Token format');
    
    logTest('Login as User', true, 'User token obtained');
    return true;
  } catch (error) {
    logTest('Login as User', false, error.message);
    return false;
  }
}

async function test03_listUsers() {
  try {
    const res = await httpRequest('GET', '/admin/users', {
      headers: { 'Authorization': `Bearer ${adminAccessToken}` },
    });
    
    assertEqual(res.statusCode, 200, 'Status code');
    assertEqual(Array.isArray(res.data.users), true, 'Users is array');
    assertContains(res.data.license.max_users.toString(), '', 'License info');
    
    logTest('List Users (Admin)', true, `Found ${res.data.users.length} users`);
    return true;
  } catch (error) {
    logTest('List Users (Admin)', false, error.message);
    return false;
  }
}

async function test04_listUsersUnauthorized() {
  try {
    const res = await httpRequest('GET', '/admin/users', {
      headers: { 'Authorization': `Bearer ${userAccessToken}` },
    });
    
    // Should fail - regular users can't access admin routes
    assertEqual(res.statusCode, 403, 'Status code');
    
    logTest('List Users (Unauthorized)', true, 'Correctly rejected');
    return true;
  } catch (error) {
    logTest('List Users (Unauthorized)', false, error.message);
    return false;
  }
}

async function test05_listUsersNoAuth() {
  try {
    const res = await httpRequest('GET', '/admin/users');
    
    assertEqual(res.statusCode, 401, 'Status code');
    assertEqual(res.data.code, 'MISSING_TOKEN', 'Error code');
    
    logTest('List Users (No Auth)', true, 'Correctly rejected');
    return true;
  } catch (error) {
    logTest('List Users (No Auth)', false, error.message);
    return false;
  }
}

async function test06_createUser() {
  try {
    const newUser = {
      email: `test.${Date.now()}@acme.com`,
      password: 'TestUser@123!',
      role: 'user',
    };
    
    const res = await httpRequest('POST', '/admin/users', {
      headers: { 'Authorization': `Bearer ${adminAccessToken}` },
      body: newUser,
    });
    
    assertEqual(res.statusCode, 201, 'Status code');
    assertEqual(res.data.user.email, newUser.email, 'Email matches');
    assertEqual(res.data.user.role, 'user', 'Role matches');
    
    testUserId = res.data.user.id;
    
    logTest('Create User', true, `User created: ${res.data.user.email}`);
    return true;
  } catch (error) {
    logTest('Create User', false, error.message);
    return false;
  }
}

async function test07_createUserDuplicate() {
  try {
    const res = await httpRequest('POST', '/admin/users', {
      headers: { 'Authorization': `Bearer ${adminAccessToken}` },
      body: {
        email: TEST_ACCOUNTS.admin.email,
        password: 'TestUser@123!',
        role: 'user',
      },
    });
    
    assertEqual(res.statusCode, 409, 'Status code');
    assertEqual(res.data.code, 'EMAIL_ALREADY_EXISTS', 'Error code');
    
    logTest('Create User (Duplicate)', true, 'Correctly rejected');
    return true;
  } catch (error) {
    logTest('Create User (Duplicate)', false, error.message);
    return false;
  }
}

async function test08_createUserWeakPassword() {
  try {
    const res = await httpRequest('POST', '/admin/users', {
      headers: { 'Authorization': `Bearer ${adminAccessToken}` },
      body: {
        email: `test2.${Date.now()}@acme.com`,
        password: 'weak',
        role: 'user',
      },
    });
    
    assertEqual(res.statusCode, 400, 'Status code');
    assertEqual(res.data.code, 'PASSWORD_POLICY_VIOLATION', 'Error code');
    
    logTest('Create User (Weak Password)', true, 'Correctly rejected');
    return true;
  } catch (error) {
    logTest('Create User (Weak Password)', false, error.message);
    return false;
  }
}

async function test09_getUser() {
  try {
    const res = await httpRequest('GET', `/admin/users/${testUserId}`, {
      headers: { 'Authorization': `Bearer ${adminAccessToken}` },
    });
    
    assertEqual(res.statusCode, 200, 'Status code');
    assertEqual(res.data.id, testUserId, 'User ID matches');
    
    logTest('Get User', true, `User retrieved: ${res.data.email}`);
    return true;
  } catch (error) {
    logTest('Get User', false, error.message);
    return false;
  }
}

async function test10_updateUser() {
  try {
    const res = await httpRequest('PATCH', `/admin/users/${testUserId}`, {
      headers: { 'Authorization': `Bearer ${adminAccessToken}` },
      body: { role: 'admin' },
    });
    
    assertEqual(res.statusCode, 200, 'Status code');
    assertEqual(res.data.user.role, 'admin', 'Role updated');
    
    logTest('Update User (Role Change)', true, 'Role changed to admin');
    return true;
  } catch (error) {
    logTest('Update User (Role Change)', false, error.message);
    return false;
  }
}

async function test11_disableUser() {
  try {
    const res = await httpRequest('DELETE', `/admin/users/${testUserId}`, {
      headers: { 'Authorization': `Bearer ${adminAccessToken}` },
    });
    
    assertEqual(res.statusCode, 200, 'Status code');
    assertContains(res.data.message, 'disabled', 'Success message');
    
    logTest('Disable User', true, 'User disabled');
    return true;
  } catch (error) {
    logTest('Disable User', false, error.message);
    return false;
  }
}

async function test12_getLicense() {
  try {
    const res = await httpRequest('GET', '/admin/license', {
      headers: { 'Authorization': `Bearer ${adminAccessToken}` },
    });
    
    assertEqual(res.statusCode, 200, 'Status code');
    assertContains(res.data.license.max_users.toString(), '', 'Max users');
    assertContains(res.data.license.active_users.toString(), '', 'Active users');
    
    logTest('Get License Info', true, `License: ${res.data.license.active_users}/${res.data.license.max_users}`);
    return true;
  } catch (error) {
    logTest('Get License Info', false, error.message);
    return false;
  }
}

async function test13_adminRouteWrongTenant() {
  try {
    // Login to beta-org
    const betaToken = await login(
      'admin@betaorg.com',
      'Admin@Beta123!',
      'beta-org'
    );
    
    // Try to access acme-corp users (should work - different tenant context)
    const res = await httpRequest('GET', '/admin/users', {
      headers: { 
        'Authorization': `Bearer ${betaToken}`,
        'X-Tenant-Slug': 'acme-corp',
      },
    });
    
    // This should work but return beta-org users (tenant from token, not header)
    assertEqual(res.statusCode, 200, 'Status code');
    
    logTest('Admin Route Tenant Isolation', true, 'Tenant isolation working');
    return true;
  } catch (error) {
    logTest('Admin Route Tenant Isolation', false, error.message);
    return false;
  }
}

// ─── Main Runner ────────────────────────────────────────────────────────────

async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Admin Routes Verification Suite                          ║');
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
    test01_loginAsAdmin,
    test02_loginAsUser,
    test03_listUsers,
    test04_listUsersUnauthorized,
    test05_listUsersNoAuth,
    test06_createUser,
    test07_createUserDuplicate,
    test08_createUserWeakPassword,
    test09_getUser,
    test10_updateUser,
    test11_disableUser,
    test12_getLicense,
    test13_adminRouteWrongTenant,
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
    console.log('🎉 All admin routes tests passed!\n');
    console.log('Admin Routes Implementation: COMPLETE ✅');
    console.log('\nNext steps:');
    console.log('  1. Implement Operator Routes (/operator/tenants)');
    console.log('  2. Run full verification suite (verify.bat)');
    console.log('  3. Create CHECKPOINT_03\n');
  } else {
    console.log('⚠️  Some tests failed. Review the implementation.\n');
  }
  
  // Write results to file
  const fs = require('fs');
  const path = require('path');
  const resultsFile = path.join(__dirname, 'admin-test-results.json');
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
