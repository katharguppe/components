#!/usr/bin/env node

/**
 * Automated Verification Script for CHECKPOINT_02
 * Runs all API tests to verify implemented functionality
 * 
 * Usage: node verify-checkpoint-02.js
 * 
 * Prerequisites:
 * 1. Docker containers running (postgres, mailhog)
 * 2. Database migrated and seeded
 * 3. Auth BFF server running on port 3001
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// ─── Configuration ──────────────────────────────────────────────────────────

const BASE_URL = 'http://localhost:3001';
const COOKIES_FILE = path.join(__dirname, 'cookies.txt');

// Test accounts from seed.ts
const TEST_ACCOUNTS = {
  operator: { email: 'operator@yoursaas.com', password: 'Operator@Secure123!', tenant: 'system' },
  adminAcme: { email: 'admin@acme.com', password: 'Admin@Acme123!', tenant: 'acme-corp' },
  userAcme: { email: 'alice@acme.com', password: 'User@Acme123!', tenant: 'acme-corp' },
  disabledAcme: { email: 'disabled@acme.com', password: 'User@Acme123!', tenant: 'acme-corp' },
  adminBeta: { email: 'admin@betaorg.com', password: 'Admin@Beta123!', tenant: 'beta-org' },
  userBeta: { email: 'carol@betaorg.com', password: 'User@Beta123!', tenant: 'beta-org' },
};

// ─── Test State ─────────────────────────────────────────────────────────────

let testResults = [];
let accessToken = null;
let resetToken = null;

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

// ─── Test Cases ─────────────────────────────────────────────────────────────

async function test01_healthCheck() {
  try {
    const res = await httpRequest('GET', '/health');
    
    assertEqual(res.statusCode, 200, 'Status code');
    assertEqual(res.data.status, 'ok', 'Status');
    assertEqual(res.data.db, 'connected', 'Database');
    
    logTest('Health Check', true, `DB: ${res.data.db}, Version: ${res.data.version}`);
    return true;
  } catch (error) {
    logTest('Health Check', false, error.message);
    return false;
  }
}

async function test02_loginSuccess() {
  try {
    const res = await httpRequest('POST', '/auth/login', {
      headers: {
        'Cookie': fs.existsSync(COOKIES_FILE) ? fs.readFileSync(COOKIES_FILE, 'utf8') : '',
      },
      body: {
        email: TEST_ACCOUNTS.adminAcme.email,
        password: TEST_ACCOUNTS.adminAcme.password,
        tenant_slug: TEST_ACCOUNTS.adminAcme.tenant,
      },
    });
    
    assertEqual(res.statusCode, 200, 'Status code');
    assertContains(res.data.access_token, 'eyJ', 'Access token format');
    assertEqual(res.data.token_type, 'Bearer', 'Token type');
    assertEqual(res.data.expires_in, 900, 'Expires in');
    assertEqual(res.data.user.email, TEST_ACCOUNTS.adminAcme.email, 'User email');
    
    accessToken = res.data.access_token;
    
    // Save cookies for subsequent tests
    if (res.headers['set-cookie']) {
      fs.writeFileSync(COOKIES_FILE, res.headers['set-cookie'].join('; '));
    }
    
    logTest('Login - Success', true, `User: ${res.data.user.email}, Role: ${res.data.user.role}`);
    return true;
  } catch (error) {
    logTest('Login - Success', false, error.message);
    return false;
  }
}

async function test03_loginInvalidCredentials() {
  try {
    const res = await httpRequest('POST', '/auth/login', {
      body: {
        email: TEST_ACCOUNTS.adminAcme.email,
        password: 'wrongpassword',
        tenant_slug: TEST_ACCOUNTS.adminAcme.tenant,
      },
    });
    
    assertEqual(res.statusCode, 401, 'Status code');
    assertEqual(res.data.code, 'INVALID_CREDENTIALS', 'Error code');
    
    logTest('Login - Invalid Credentials', true, `Attempts remaining: ${res.data.attempts_remaining}`);
    return true;
  } catch (error) {
    logTest('Login - Invalid Credentials', false, error.message);
    return false;
  }
}

async function test04_loginDisabledAccount() {
  try {
    const res = await httpRequest('POST', '/auth/login', {
      body: {
        email: TEST_ACCOUNTS.disabledAcme.email,
        password: TEST_ACCOUNTS.disabledAcme.password,
        tenant_slug: TEST_ACCOUNTS.disabledAcme.tenant,
      },
    });
    
    assertEqual(res.statusCode, 403, 'Status code');
    assertEqual(res.data.code, 'ACCOUNT_DISABLED', 'Error code');
    
    logTest('Login - Disabled Account', true, res.data.message);
    return true;
  } catch (error) {
    logTest('Login - Disabled Account', false, error.message);
    return false;
  }
}

async function test05_loginUnknownTenant() {
  try {
    const res = await httpRequest('POST', '/auth/login', {
      body: {
        email: TEST_ACCOUNTS.adminAcme.email,
        password: TEST_ACCOUNTS.adminAcme.password,
        tenant_slug: 'unknown-tenant',
      },
    });
    
    assertEqual(res.statusCode, 404, 'Status code');
    assertEqual(res.data.code, 'TENANT_NOT_FOUND', 'Error code');
    
    logTest('Login - Unknown Tenant', true, res.data.message);
    return true;
  } catch (error) {
    logTest('Login - Unknown Tenant', false, error.message);
    return false;
  }
}

async function test06_getCurrentUser() {
  try {
    if (!accessToken) {
      throw new Error('No access token available - run test 02 first');
    }
    
    const res = await httpRequest('GET', '/auth/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    
    assertEqual(res.statusCode, 200, 'Status code');
    assertEqual(res.data.email, TEST_ACCOUNTS.adminAcme.email, 'User email');
    assertEqual(res.data.role, 'admin', 'Role');
    assertEqual(res.data.status, 'active', 'Status');
    
    logTest('Get Current User (Authenticated)', true, `Tenant: ${res.data.tenant.name}`);
    return true;
  } catch (error) {
    logTest('Get Current User (Authenticated)', false, error.message);
    return false;
  }
}

async function test07_getCurrentUserNoToken() {
  try {
    const res = await httpRequest('GET', '/auth/me');
    
    assertEqual(res.statusCode, 401, 'Status code');
    assertEqual(res.data.code, 'MISSING_TOKEN', 'Error code');
    
    logTest('Get Current User (No Token)', true, res.data.message);
    return true;
  } catch (error) {
    logTest('Get Current User (No Token)', false, error.message);
    return false;
  }
}

async function test08_getCurrentUserInvalidToken() {
  try {
    const res = await httpRequest('GET', '/auth/me', {
      headers: {
        'Authorization': 'Bearer invalid.token.here',
      },
    });
    
    assertEqual(res.statusCode, 401, 'Status code');
    assertEqual(res.data.code, 'TOKEN_INVALID', 'Error code');
    
    logTest('Get Current User (Invalid Token)', true, res.data.message);
    return true;
  } catch (error) {
    logTest('Get Current User (Invalid Token)', false, error.message);
    return false;
  }
}

async function test09_refreshToken() {
  try {
    const cookies = fs.existsSync(COOKIES_FILE) ? fs.readFileSync(COOKIES_FILE, 'utf8') : '';
    
    const res = await httpRequest('POST', '/auth/refresh', {
      headers: {
        'Cookie': cookies,
      },
    });
    
    assertEqual(res.statusCode, 200, 'Status code');
    assertContains(res.data.access_token, 'eyJ', 'New access token');
    
    // Save new cookies (token rotated)
    if (res.headers['set-cookie']) {
      fs.writeFileSync(COOKIES_FILE, res.headers['set-cookie'].join('; '));
    }
    
    logTest('Refresh Token', true, 'Token rotated successfully');
    return true;
  } catch (error) {
    logTest('Refresh Token', false, error.message);
    return false;
  }
}

async function test10_refreshTokenNoCookie() {
  try {
    const res = await httpRequest('POST', '/auth/refresh');
    
    assertEqual(res.statusCode, 401, 'Status code');
    assertEqual(res.data.code, 'MISSING_REFRESH_TOKEN', 'Error code');
    
    logTest('Refresh Token (No Cookie)', true, res.data.message);
    return true;
  } catch (error) {
    logTest('Refresh Token (No Cookie)', false, error.message);
    return false;
  }
}

async function test11_forgotPassword() {
  try {
    const res = await httpRequest('POST', '/auth/forgot-password', {
      body: {
        email: TEST_ACCOUNTS.adminAcme.email,
        tenant_slug: TEST_ACCOUNTS.adminAcme.tenant,
      },
    });
    
    assertEqual(res.statusCode, 200, 'Status code');
    
    // In development mode, token is returned
    if (res.data.reset_token) {
      resetToken = res.data.reset_token;
      logTest('Forgot Password', true, 'Reset token generated (dev mode)');
    } else {
      logTest('Forgot Password', true, 'Password reset initiated (prod mode)');
    }
    return true;
  } catch (error) {
    logTest('Forgot Password', false, error.message);
    return false;
  }
}

async function test12_resetPassword() {
  try {
    if (!resetToken) {
      throw new Error('No reset token available - run test 11 first');
    }
    
    const newPassword = 'NewSecure@Pass123!';
    
    const res = await httpRequest('POST', '/auth/reset-password', {
      body: {
        token: resetToken,
        password: newPassword,
      },
    });
    
    assertEqual(res.statusCode, 200, 'Status code');
    assertContains(res.data.message, 'reset successfully', 'Success message');
    
    logTest('Reset Password', true, 'Password updated');
    return true;
  } catch (error) {
    logTest('Reset Password', false, error.message);
    return false;
  }
}

async function test13_resetPasswordWeak() {
  try {
    const res = await httpRequest('POST', '/auth/reset-password', {
      body: {
        token: resetToken || 'dummy-token',
        password: 'weak',
      },
    });
    
    assertEqual(res.statusCode, 400, 'Status code');
    assertEqual(res.data.code, 'PASSWORD_POLICY_VIOLATION', 'Error code');
    
    logTest('Reset Password - Weak Password', true, `${res.data.errors.length} validation errors`);
    return true;
  } catch (error) {
    logTest('Reset Password - Weak Password', false, error.message);
    return false;
  }
}

async function test14_logout() {
  try {
    // First login to get fresh token
    const loginRes = await httpRequest('POST', '/auth/login', {
      body: {
        email: TEST_ACCOUNTS.userAcme.email,
        password: TEST_ACCOUNTS.userAcme.password,
        tenant_slug: TEST_ACCOUNTS.userAcme.tenant,
      },
    });
    
    const token = loginRes.data.access_token;
    
    const res = await httpRequest('POST', '/auth/logout', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    assertEqual(res.statusCode, 200, 'Status code');
    assertContains(res.data.message, 'Logged out', 'Success message');
    
    logTest('Logout', true, 'Session terminated');
    return true;
  } catch (error) {
    logTest('Logout', false, error.message);
    return false;
  }
}

async function test15_jwksEndpoint() {
  try {
    const res = await httpRequest('GET', '/.well-known/jwks.json');
    
    assertEqual(res.statusCode, 200, 'Status code');
    assertEqual(res.data.keys.length, 1, 'Number of keys');
    assertEqual(res.data.keys[0].kty, 'RSA', 'Key type');
    assertEqual(res.data.keys[0].alg, 'RS256', 'Algorithm');
    
    logTest('JWKS Endpoint', true, `Key ID: ${res.data.keys[0].kid}`);
    return true;
  } catch (error) {
    logTest('JWKS Endpoint', false, error.message);
    return false;
  }
}

async function test16_accountLockout() {
  try {
    let locked = false;
    
    // Make 6 failed login attempts
    for (let i = 1; i <= 6; i++) {
      const res = await httpRequest('POST', '/auth/login', {
        body: {
          email: TEST_ACCOUNTS.userBeta.email,
          password: 'wrongpass',
          tenant_slug: TEST_ACCOUNTS.userBeta.tenant,
        },
      });
      
      if (res.statusCode === 403 && res.data.code === 'ACCOUNT_LOCKED') {
        locked = true;
        assertContains(res.data.locked_until, '2026', 'Lockout timestamp');
        break;
      }
    }
    
    if (!locked) {
      throw new Error('Account did not lock after 5 failed attempts');
    }
    
    logTest('Account Lockout', true, 'Account locked after 5 failed attempts');
    return true;
  } catch (error) {
    logTest('Account Lockout', false, error.message);
    return false;
  }
}

async function test17_crossTenantIsolation() {
  try {
    const res = await httpRequest('POST', '/auth/login', {
      body: {
        email: TEST_ACCOUNTS.adminAcme.email,
        password: TEST_ACCOUNTS.adminAcme.password,
        tenant_slug: TEST_ACCOUNTS.adminBeta.tenant,
      },
    });
    
    // Should fail because admin@acme.com doesn't exist in beta-org tenant
    assertEqual(res.statusCode, 401, 'Status code');
    assertEqual(res.data.code, 'INVALID_CREDENTIALS', 'Error code');
    
    logTest('Cross-Tenant Isolation', true, 'Tenant isolation working');
    return true;
  } catch (error) {
    logTest('Cross-Tenant Isolation', false, error.message);
    return false;
  }
}

async function test18_corsAllowedOrigin() {
  try {
    const res = await httpRequest('GET', '/health', {
      headers: {
        'Origin': 'http://localhost:5173',
      },
    });
    
    const corsHeader = res.headers['access-control-allow-origin'];
    
    if (corsHeader === 'http://localhost:5173') {
      logTest('CORS - Allowed Origin', true, `Origin: ${corsHeader}`);
      return true;
    } else {
      throw new Error(`Expected CORS header http://localhost:5173, got ${corsHeader}`);
    }
  } catch (error) {
    logTest('CORS - Allowed Origin', false, error.message);
    return false;
  }
}

async function test19_corsDisallowedOrigin() {
  try {
    const res = await httpRequest('GET', '/health', {
      headers: {
        'Origin': 'http://evil.com',
      },
    });
    
    const corsHeader = res.headers['access-control-allow-origin'];
    
    // Should NOT return http://evil.com
    if (corsHeader !== 'http://evil.com') {
      logTest('CORS - Disallowed Origin', true, 'Origin correctly rejected');
      return true;
    } else {
      throw new Error('CORS allowed disallowed origin');
    }
  } catch (error) {
    logTest('CORS - Disallowed Origin', false, error.message);
    return false;
  }
}

async function test20_securityHeaders() {
  try {
    const res = await httpRequest('GET', '/health');
    
    const headers = res.headers;
    const missing = [];
    
    if (!headers['strict-transport-security']) missing.push('HSTS');
    if (!headers['x-frame-options']) missing.push('X-Frame-Options');
    if (!headers['x-content-type-options']) missing.push('X-Content-Type-Options');
    if (!headers['content-security-policy']) missing.push('CSP');
    
    if (missing.length > 0) {
      throw new Error(`Missing security headers: ${missing.join(', ')}`);
    }
    
    logTest('Security Headers', true, 'All security headers present');
    return true;
  } catch (error) {
    logTest('Security Headers', false, error.message);
    return false;
  }
}

// ─── Main Runner ────────────────────────────────────────────────────────────

async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  CHECKPOINT_02 Verification Suite                         ║');
  console.log('║  SaaS Multi-Tenant Login Component                        ║');
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
    test01_healthCheck,
    test02_loginSuccess,
    test03_loginInvalidCredentials,
    test04_loginDisabledAccount,
    test05_loginUnknownTenant,
    test06_getCurrentUser,
    test07_getCurrentUserNoToken,
    test08_getCurrentUserInvalidToken,
    test09_refreshToken,
    test10_refreshTokenNoCookie,
    test11_forgotPassword,
    test12_resetPassword,
    test13_resetPasswordWeak,
    test14_logout,
    test15_jwksEndpoint,
    test16_accountLockout,
    test17_crossTenantIsolation,
    test18_corsAllowedOrigin,
    test19_corsDisallowedOrigin,
    test20_securityHeaders,
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
    console.log('🎉 All tests passed! CHECKPOINT_02 is verified and working.\n');
    console.log('Next steps:');
    console.log('  1. Implement Admin routes (/admin/users)');
    console.log('  2. Implement Operator routes (/operator/tenants)');
    console.log('  3. Implement License enforcement service\n');
  } else {
    console.log('⚠️  Some tests failed. Review the implementation.\n');
    console.log('Troubleshooting:');
    console.log('  1. Check if database is seeded: npm run db:seed');
    console.log('  2. Check if RSA keys exist: ls keys/');
    console.log('  3. Check .env configuration\n');
  }
  
  // Write results to file
  const resultsFile = path.join(__dirname, 'test-results.json');
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
