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
let unholdBookingId = null;
let amendmentId = null;
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

  await runTest('POST /details - valid', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/details', {
      headers: adminHeaders(),
      body: { priceIds: [priceId] },
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertExists(res.data.data.bookingId, 'bookingId');
    assertEqual(Array.isArray(res.data.data.flightDetails), true, 'flightDetails array');
    assertEqual(Array.isArray(res.data.data.fareDetails), true, 'fareDetails array');
    assertEqual(Array.isArray(res.data.data.baggageInformation), true, 'baggageInformation array');
    assertExists(res.data.data.fareRules, 'fareRules');
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
    assertEqual(res.data.data.status.success, true, 'service status');
    assertEqual(res.data.data.booking.status, 'SUCCESS', 'booking status');
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

  await runTest('POST /unhold - valid held booking', async () => {
    const review = await httpRequest('POST', '/api/v1/tripjack/flights/review', {
      headers: adminHeaders(),
      body: { priceIds: [secondPriceId] },
    });
    unholdBookingId = review.data.data.bookingId;
    const hold = await httpRequest('POST', '/api/v1/tripjack/flights/book', {
      headers: adminHeaders(),
      body: { bookingId: unholdBookingId, hold: true, deliveryInfo, travellerInfo },
    });
    assertEqual(hold.statusCode, 201, 'hold HTTP status');

    const res = await httpRequest('POST', '/api/v1/tripjack/flights/unhold', {
      headers: adminHeaders(),
      body: { bookingId: unholdBookingId },
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertEqual(res.data.data.status, 'UNCONFIRMED', 'status');
  });

  await runTest('POST /unhold - already unconfirmed', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/unhold', {
      headers: adminHeaders(),
      body: { bookingId: unholdBookingId },
    });
    assertEqual(res.statusCode, 404, 'HTTP status');
  });

  await runTest('POST /unhold - unknown bookingId', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/unhold', {
      headers: adminHeaders(),
      body: { bookingId: 'UNKNOWN-FLIGHT-BOOKING' },
    });
    assertEqual(res.statusCode, 404, 'HTTP status');
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

  await runTest('POST /fare-rule - official id flowType shape', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/fare-rule', {
      headers: adminHeaders(),
      body: { id: priceId, flowType: 'SEARCH', version: 'v2' },
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertEqual(Array.isArray(res.data.data.rules), true, 'rules array');
  });

  await runTest('POST /seat-map - reissue booking shape', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/seat-map', {
      headers: adminHeaders(),
      body: { bookingId, oldBookingId: 'OLD-TJS-BOOKING' },
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertEqual(Array.isArray(res.data.data.seats), true, 'seats array');
  });

  await runTest('POST /reissue/searchquery-list - valid', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/reissue/searchquery-list', {
      headers: adminHeaders(),
      body: {
        paxInfo: { ADULT: 1 },
        routeInfos: [{ fromCityOrAirport: 'DEL', toCityOrAirport: 'BLR', travelDate: '2026-06-20' }],
        oldBookingId: bookingId,
        pnr: 'PNR123',
        paxIds: ['1'],
      },
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertExists(res.data.data.data.requestId, 'requestId');
  });

  await runTest('POST /reissue/search - valid', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/reissue/search', {
      headers: adminHeaders(),
      body: { requestId: 'REQ123' },
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertExists(res.data.data.data.tripInfos, 'tripInfos');
  });

  await runTest('POST /reissue/review - valid', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/reissue/review', {
      headers: adminHeaders(),
      body: { priceIds: [`REISSUE-REQ123-0`], oldBookingId: bookingId, priceValidation: true },
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertExists(res.data.data.data.bookingId, 'bookingId');
  });

  await runTest('POST /reissue/book - valid', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/reissue/book', {
      headers: adminHeaders(),
      body: {
        bookingId: 'TJS-REISSUE-BOOKING',
        oldBookingId: bookingId,
        paymentInfos: [{ bookingId: 'TJS-REISSUE-BOOKING', amount: 750 }],
        travellerInfo,
        deliveryInfo,
      },
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertEqual(res.data.data.data.status, 'SUCCESS', 'status');
  });

  await runTest('POST /ancillaries/fetch-seat - valid', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/ancillaries/fetch-seat', {
      headers: adminHeaders(),
      body: { bookingId },
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertEqual(Array.isArray(res.data.data.data.seats), true, 'seats array');
  });

  await runTest('POST /ancillaries/fetch-ssr - valid', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/ancillaries/fetch-ssr', {
      headers: adminHeaders(),
      body: { bookingId },
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertEqual(Array.isArray(res.data.data.data.meals), true, 'meals array');
  });

  await runTest('POST /ancillaries/add-ssr - valid', async () => {
    const res = await httpRequest('POST', '/api/v1/tripjack/flights/ancillaries/add-ssr', {
      headers: adminHeaders(),
      body: {
        bookingId,
        paymentInfos: [{ amount: 1450 }],
        sI: [{ id: 'SEG1', bI: { tI: [{ id: 1, sbi: { code: 'EB05' }, smi: { code: 'VGSW' }, ssi: { code: '1A' } }] } }],
      },
    });
    assertEqual(res.statusCode, 200, 'HTTP status');
    assertEqual(res.data.data.data.status, 'SUCCESS', 'status');
  });

  await runTest('Cross-tenant token mismatch rejected', async () => {
    const res = await httpRequest('GET', '/api/v1/tripjack/flights/user-balance', {
      headers: betaHeaders({ 'X-Tenant-Slug': 'acme-corp' }),
    });
    assertEqual(res.statusCode, 403, 'HTTP status');
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
