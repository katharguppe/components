#!/usr/bin/env node

/**
 * TripJack Flight Routes Verification Script
 * Prerequisites: BFF running on :3001, DB migrated/seeded, TRIPJACK_FLIGHT_MODE=stub.
 */

const http = require('http');

const BASE_URL = 'http://localhost:3001';
const TEST_ACCOUNTS = {
  admin: { email: 'admin@acme.com', password: 'Admin@Acme123!', tenant: 'acme-corp' },
  betaAdmin: { email: 'admin@betaorg.com', password: 'Admin@Beta123!', tenant: 'beta-org' },
};

let adminToken = null;
let betaAdminToken = null;
let priceId = null;
let secondPriceId = null;
let bookingId = null;
let heldBookingId = null;
let amendmentId = null;
// Failure-test state (fresh data, independent of happy-path state)
let failPriceId = null;
let failBookingId = null;
let failHeldBookingId = null;
const testResults = [];

function httpRequest(method, urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const req = http.request({
      hostname: url.hostname,
      port: url.port || 3001,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        let data = body;
        try {
          data = JSON.parse(body);
        } catch {
          // keep text body
        }
        resolve({ statusCode: res.statusCode, data });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

function logTest(name, passed, details = '') {
  testResults.push({ name, passed, details });
  console.log(`\n${passed ? 'PASS' : 'FAIL'} - ${name}`);
  if (details) console.log(`   ${details}`);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertExists(value, message) {
  if (value === null || value === undefined || value === '') {
    throw new Error(`${message}: expected value, got ${JSON.stringify(value)}`);
  }
}

function adminHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${adminToken}`,
    'X-Tenant-Slug': 'acme-corp',
    ...extra,
  };
}

function betaHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${betaAdminToken}`,
    'X-Tenant-Slug': 'beta-org',
    ...extra,
  };
}

const searchBody = {
  cabinClass: 'ECONOMY',
  paxInfo: { ADULT: 1 },
  routeInfos: [
    {
      fromCityOrAirport: 'DEL',
      toCityOrAirport: 'BOM',
      travelDate: '2026-06-15',
    },
  ],
  searchModifiers: { pft: 'REGULAR' },
};

const travellerInfo = [
  {
    ti: 'Mr',
    pt: 'ADULT',
    fN: 'John',
    lN: 'Doe',
    dob: '1990-01-15',
  },
];

const deliveryInfo = {
  emails: ['customer@example.com'],
  contacts: ['+919500112233'],
};

async function runTest(name, fn) {
  try {
    await fn();
    logTest(name, true);
  } catch (error) {
    logTest(name, false, error.message);
  }
}

async function login(account) {
  const res = await httpRequest('POST', '/auth/login', {
    body: {
      email: account.email,
      password: account.password,
      tenant_slug: account.tenant,
    },
  });
  assertEqual(res.statusCode, 200, 'HTTP status');
  assertExists(res.data.access_token, 'access token');
  return res.data.access_token;
}

async function main() {
  await runTest('[Setup] Login acme admin', async () => {
    adminToken = await login(TEST_ACCOUNTS.admin);
  });

  await runTest('[Setup] Login beta admin', async () => {
    betaAdminToken = await login(TEST_ACCOUNTS.betaAdmin);
  });

  await runTest('[Setup] Provision flight module', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/_provision', { headers: adminHeaders() });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertEqual(res.data.table, 'tripjack_flight_bookings', 'table');
  });

  await runTest('POST /search - valid', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/search', {
      headers: adminHeaders(),
      body: searchBody,
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertExists(res.data.data.searchId, 'searchId');
    const onward = res.data.data.tripInfos.ONWARD;
    assertEqual(Array.isArray(onward), true, 'ONWARD is array');
    priceId = onward[0].priceId;
    secondPriceId = onward[1].priceId;
    assertExists(priceId, 'priceId');
  });

  await runTest('POST /search - missing routes', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/search', {
      headers: adminHeaders(),
      body: { cabinClass: 'ECONOMY', paxInfo: { ADULT: 1 } },
    });
    assertEqual(res.statusCode, 400, 'HTTP status');
  });

  await runTest('POST /review - valid', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/review', {
      headers: adminHeaders(),
      body: { priceIds: [priceId] },
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    bookingId = res.data.data.bookingId;
    assertExists(bookingId, 'bookingId');
  });

  await runTest('POST /review - invalid priceId', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/review', {
      headers: adminHeaders(),
      body: { priceIds: ['missing-price-id'] },
    });
    assertEqual(res.statusCode, 404, 'HTTP status');
  });

  await runTest('POST /fare-rule - valid', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/fare-rule', {
      headers: adminHeaders(),
      body: { priceIds: [priceId] },
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertEqual(Array.isArray(res.data.data.rules), true, 'rules array');
  });

  await runTest('POST /seat-map - valid', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/seat-map', {
      headers: adminHeaders(),
      body: { priceIds: [priceId] },
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertEqual(Array.isArray(res.data.data.seats), true, 'seats array');
  });

  await runTest('POST /fare-validate-book - valid', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/fare-validate-book', {
      headers: adminHeaders(),
      body: { bookingId },
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertEqual(res.data.data.amount > 0, true, 'amount positive');
  });

  await runTest('POST /book - instant', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/book', {
      headers: adminHeaders(),
      body: { bookingId, amount: 4800, deliveryInfo, travellerInfo },
    });
    assertEqual(res.statusCode, 201, 'HTTP status');
    assertEqual(res.data.data.status, 'SUCCESS', 'status');
    assertExists(res.data.data.pnr, 'pnr');
  });

  await runTest('POST /booking-details - instant booking', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/booking-details', {
      headers: adminHeaders(),
      body: { bookingId },
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertEqual(res.data.data.status, 'SUCCESS', 'status');
  });

  await runTest('POST /book - hold flow setup', async () => {
    const review = await httpRequest('POST', '/api/v1/tripjack/flights/review', {
      headers: adminHeaders(),
      body: { priceIds: [secondPriceId] },
    });
    heldBookingId = review.data.data.bookingId;
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/book', {
      headers: adminHeaders(),
      body: { bookingId: heldBookingId, hold: true, deliveryInfo, travellerInfo },
    });
    assertEqual(res.statusCode, 201, 'HTTP status');
    assertEqual(res.data.data.status, 'ON_HOLD', 'status');
  });

  await runTest('POST /fare-validate - held booking', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/fare-validate', {
      headers: adminHeaders(),
      body: { bookingId: heldBookingId },
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
  });

  await runTest('POST /confirm-book - held booking', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/confirm-book', {
      headers: adminHeaders(),
      body: { bookingId: heldBookingId, amount: 5650 },
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertEqual(res.data.data.status, 'SUCCESS', 'status');
  });

  await runTest('POST /amendment-charges - valid', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/amendment-charges', {
      headers: adminHeaders(),
      body: { bookingId, remarks: 'Customer requested cancellation' },
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertEqual(res.data.data.refundAmount > 0, true, 'refund positive');
  });

  await runTest('POST /submit-amendment - valid', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/submit-amendment', {
      headers: adminHeaders(),
      body: { bookingId, remarks: 'Customer requested cancellation' },
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    amendmentId = res.data.data.amendmentId;
    assertExists(amendmentId, 'amendmentId');
  });

  await runTest('POST /amendment-details - valid', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/amendment-details', {
      headers: adminHeaders(),
      body: { amendmentId },
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertEqual(res.data.data.amendmentStatus, 'SUCCESS', 'amendment status');
  });

  await runTest('GET /user-balance - valid', async () => {
    const res = await httpRequest('GET', '/api/v1/tripjack/flights/user-balance', {
      headers: adminHeaders(),
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertEqual(res.data.data.balance > 0, true, 'balance positive');
  });

  await runTest('Cross-tenant token mismatch rejected', async () => {
    const res = await httpRequest('GET', '/api/v1/tripjack/flights/user-balance', {
      headers: betaHeaders({ 'X-Tenant-Slug': 'acme-corp' }),
    });
    assertEqual(res.statusCode, 403, 'HTTP status');
  });

  // ─── Failure / edge-case tests ───────────────────────────────────────────
  console.log('\n── Failure & Edge-Case Tests ──');

  // Setup: fresh search + review so failure tests have clean, independent state
  await runTest('[Fail-Setup] Fresh search for failure tests', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/search', {
      headers: adminHeaders(),
      body: searchBody,
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    failPriceId = res.data.data.tripInfos.ONWARD[0].priceId;
    assertExists(failPriceId, 'failPriceId');
  });

  await runTest('[Fail-Setup] Fresh review for failure tests', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/review', {
      headers: adminHeaders(),
      body: { priceIds: [failPriceId] },
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    failBookingId = res.data.data.bookingId;
    assertExists(failBookingId, 'failBookingId');
  });

  // ── 400 Validation errors ──
  await runTest('[Fail] POST /search - empty routeInfos array returns 400', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/search', {
      headers: adminHeaders(),
      body: { cabinClass: 'ECONOMY', paxInfo: { ADULT: 1 }, routeInfos: [] },
    });
    assertEqual(res.statusCode, 400, 'HTTP status');
  });

  await runTest('[Fail] POST /review - missing priceIds returns 400', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/review', {
      headers: adminHeaders(),
      body: {},
    });
    assertEqual(res.statusCode, 400, 'HTTP status');
  });

  await runTest('[Fail] POST /book - missing amount for instant booking returns 400', async () => {
    // Zod superRefine: amount required when hold is falsy
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/book', {
      headers: adminHeaders(),
      body: { bookingId: failBookingId, deliveryInfo, travellerInfo },
    });
    assertEqual(res.statusCode, 400, 'HTTP status');
  });

  await runTest('[Fail] POST /book - missing travellerInfo returns 400', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/book', {
      headers: adminHeaders(),
      body: { bookingId: failBookingId, amount: 4800, deliveryInfo },
    });
    assertEqual(res.statusCode, 400, 'HTTP status');
  });

  await runTest('[Fail] POST /book - missing deliveryInfo returns 400', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/book', {
      headers: adminHeaders(),
      body: { bookingId: failBookingId, amount: 4800, travellerInfo },
    });
    assertEqual(res.statusCode, 400, 'HTTP status');
  });

  await runTest('[Fail] POST /book - bookingId not reviewed returns 400', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/book', {
      headers: adminHeaders(),
      body: { bookingId: 'TJFL-NEVER-REVIEWED', amount: 4800, deliveryInfo, travellerInfo },
    });
    assertEqual(res.statusCode, 400, 'HTTP status');
  });

  await runTest('[Fail] POST /confirm-book - missing amount returns 400', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/confirm-book', {
      headers: adminHeaders(),
      body: { bookingId: failBookingId },
    });
    assertEqual(res.statusCode, 400, 'HTTP status');
  });

  await runTest('[Fail] POST /amendment-charges - missing remarks returns 400', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/amendment-charges', {
      headers: adminHeaders(),
      body: { bookingId: failBookingId },
    });
    assertEqual(res.statusCode, 400, 'HTTP status');
  });

  await runTest('[Fail] POST /submit-amendment - missing remarks returns 400', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/submit-amendment', {
      headers: adminHeaders(),
      body: { bookingId: failBookingId },
    });
    assertEqual(res.statusCode, 400, 'HTTP status');
  });

  // ── 404 Not Found errors ──
  await runTest('[Fail] POST /fare-rule - invalid priceId returns 404', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/fare-rule', {
      headers: adminHeaders(),
      body: { priceIds: ['NONEXISTENT-PRICE-ID-999'] },
    });
    assertEqual(res.statusCode, 404, 'HTTP status');
  });

  await runTest('[Fail] POST /seat-map - invalid priceId returns 404', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/seat-map', {
      headers: adminHeaders(),
      body: { priceIds: ['NONEXISTENT-PRICE-ID-999'] },
    });
    assertEqual(res.statusCode, 404, 'HTTP status');
  });

  await runTest('[Fail] POST /fare-validate-book - unknown bookingId returns 404', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/fare-validate-book', {
      headers: adminHeaders(),
      body: { bookingId: 'TJFL-UNKNOWN-99999' },
    });
    assertEqual(res.statusCode, 404, 'HTTP status');
  });

  await runTest('[Fail] POST /booking-details - unknown bookingId returns 404', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/booking-details', {
      headers: adminHeaders(),
      body: { bookingId: 'TJFL-UNKNOWN-99999' },
    });
    assertEqual(res.statusCode, 404, 'HTTP status');
  });

  await runTest('[Fail] POST /amendment-charges - unknown bookingId returns 404', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/amendment-charges', {
      headers: adminHeaders(),
      body: { bookingId: 'TJFL-UNKNOWN-99999', remarks: 'test cancellation' },
    });
    assertEqual(res.statusCode, 404, 'HTTP status');
  });

  await runTest('[Fail] POST /submit-amendment - unknown bookingId returns 404', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/submit-amendment', {
      headers: adminHeaders(),
      body: { bookingId: 'TJFL-UNKNOWN-99999', remarks: 'test cancellation' },
    });
    assertEqual(res.statusCode, 404, 'HTTP status');
  });

  await runTest('[Fail] POST /amendment-details - unknown amendmentId returns 404', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/amendment-details', {
      headers: adminHeaders(),
      body: { amendmentId: 'AMD-UNKNOWN-99999' },
    });
    assertEqual(res.statusCode, 404, 'HTTP status');
  });

  await runTest('[Fail] POST /fare-validate - instant booking (not ON_HOLD) returns 404', async () => {
    // bookingId is an instant (SUCCESS) booking — fareValidate requires ON_HOLD
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/fare-validate', {
      headers: adminHeaders(),
      body: { bookingId },
    });
    assertEqual(res.statusCode, 404, 'HTTP status');
  });

  await runTest('[Fail] POST /confirm-book - unknown bookingId returns 404', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/confirm-book', {
      headers: adminHeaders(),
      body: { bookingId: 'TJFL-UNKNOWN-99999', amount: 5000 },
    });
    assertEqual(res.statusCode, 404, 'HTTP status');
  });

  // ── /unhold endpoint (fully untested in original suite) ──
  await runTest('[Fail-Setup] Hold a fresh booking for unhold tests', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/book', {
      headers: adminHeaders(),
      body: { bookingId: failBookingId, hold: true, deliveryInfo, travellerInfo },
    });
    assertEqual(res.statusCode, 201, 'HTTP status');
    assertEqual(res.data.data.status, 'ON_HOLD', 'status');
    failHeldBookingId = failBookingId;
  });

  await runTest('[Fail] POST /unhold - valid held booking returns 200 UNCONFIRMED', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/unhold', {
      headers: adminHeaders(),
      body: { bookingId: failHeldBookingId },
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertEqual(res.data.data.status, 'UNCONFIRMED', 'status');
  });

  await runTest('[Fail] POST /unhold - already unconfirmed booking returns 404', async () => {
    // failHeldBookingId is now UNCONFIRMED — no longer ON_HOLD
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/unhold', {
      headers: adminHeaders(),
      body: { bookingId: failHeldBookingId },
    });
    assertEqual(res.statusCode, 404, 'HTTP status');
  });

  await runTest('[Fail] POST /unhold - unknown bookingId returns 404', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/unhold', {
      headers: adminHeaders(),
      body: { bookingId: 'TJFL-UNKNOWN-99999' },
    });
    assertEqual(res.statusCode, 404, 'HTTP status');
  });

  // ── 401 Unauthorized ──
  await runTest('[Fail] GET /user-balance - no auth header returns 401', async () => {
    // Must include X-Tenant-Slug so requireTenant passes; authenticate then rejects
    const res = await httpRequest('GET', '/api/v1/tripjack/flights/user-balance', {
      headers: { 'X-Tenant-Slug': 'acme-corp' },
    });
    assertEqual(res.statusCode, 401, 'HTTP status');
  });

  await runTest('[Fail] POST /search - no auth header returns 401', async () => {
    // Must include X-Tenant-Slug so requireTenant passes; authenticate then rejects
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/search', {
      headers: { 'X-Tenant-Slug': 'acme-corp' },
      body: searchBody,
    });
    assertEqual(res.statusCode, 401, 'HTTP status');
  });

  // ── Idempotency ──
  await runTest('[Fail] POST /_provision - idempotent (second call succeeds)', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/_provision', {
      headers: adminHeaders(),
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertEqual(res.data.table, 'tripjack_flight_bookings', 'table');
  });

  const passed = testResults.filter((result) => result.passed).length;
  const failed = testResults.length - passed;
  console.log(`\nFlight test summary: ${passed}/${testResults.length} passed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Fatal test error:', error);
  process.exit(1);
});
