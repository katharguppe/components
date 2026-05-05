# Sprint 05 - TripJack Flight Integration
## UI Developer Guide + Next.js Examples

> **Target audience:** Frontend / UI developers integrating the flight search, booking, hold, ticketing, and cancellation flows.
> **BFF base URL:** `http://localhost:3001` in local development.
> **All endpoints require:** a valid JWT `Authorization` header + `X-Tenant-Slug` header.

---

## Table of Contents

1. [Auth Prerequisites](#1-auth-prerequisites)
2. [Flight Flow Overview](#2-flight-flow-overview)
3. [TypeScript Types](#3-typescript-types)
4. [API Client Helper](#4-api-client-helper)
5. [Endpoint Reference](#5-endpoint-reference)
6. [End-to-End Examples](#6-end-to-end-examples)
7. [Important TripJack Rules](#7-important-tripjack-rules)
8. [Environment Setup](#8-environment-setup)
9. [Backend Files](#9-backend-files)
10. [Test Suite](#10-test-suite)

---

## 1. Auth Prerequisites

Every TripJack flight route requires:

```http
Authorization: Bearer <access_token>
X-Tenant-Slug:  acme-corp
Content-Type:   application/json
```

Login first:

```typescript
export async function login(email: string, password: string, tenantSlug: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BFF_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, tenant_slug: tenantSlug }),
  });

  if (!res.ok) throw new Error('Login failed');
  const data = await res.json();
  return data.access_token as string;
}
```

Local development uses `TRIPJACK_FLIGHT_MODE=stub`, so the flow works without live TripJack credentials.

---

## 2. Flight Flow Overview

### Instant Ticketing

```text
1. POST /search              -> get tripInfos and priceIds
2. POST /review              -> validate priceIds and get bookingId
3. POST /fare-validate-book  -> optional pre-book fare check
4. POST /book                -> send bookingId, amount, travellerInfo, deliveryInfo
5. POST /booking-details     -> get status, PNR, ticket numbers
```

### Hold Now, Ticket Later

```text
1. POST /search
2. POST /review              -> check conditions.isBA
3. POST /book                -> send hold: true, omit amount/payment
4. POST /fare-validate       -> re-check fare before ticketing
5. POST /confirm-book        -> pay and issue ticket
6. POST /booking-details     -> confirm SUCCESS
```

### Cancellation

```text
1. POST /amendment-charges   -> show refund/penalty
2. POST /submit-amendment    -> get amendmentId
3. POST /amendment-details   -> poll until SUCCESS / REJECTED / PENDING
```

---

## 3. TypeScript Types

```typescript
export type CabinClass = 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';
export type PaxType = 'ADULT' | 'CHILD' | 'INFANT';
export type BookingStatus =
  | 'SUCCESS'
  | 'ON_HOLD'
  | 'PENDING'
  | 'CANCELLED'
  | 'FAILED'
  | 'ABORTED'
  | 'UNCONFIRMED';

export interface PaxInfo {
  ADULT: number;
  CHILD?: number;
  INFANT?: number;
}

export interface RouteInfo {
  fromCityOrAirport: string; // IATA code, e.g. "DEL"
  toCityOrAirport: string;   // IATA code, e.g. "BOM"
  travelDate: string;        // YYYY-MM-DD
}

export interface FlightSearchPayload {
  cabinClass: CabinClass;
  paxInfo: PaxInfo;
  routeInfos: RouteInfo[];
  preferredAirlines?: string[]; // IATA airline codes, max 10
  searchModifiers?: {
    isDirectFlight?: boolean;
    isConnectingFlight?: boolean;
    pft?: 'REGULAR' | 'STUDENT' | 'SENIOR_CITIZEN';
  };
}

export interface FlightSegment {
  id: string;
  from: string;
  to: string;
  departureTime: string;
  arrivalTime: string;
  airlineCode: string;
  airlineName: string;
  flightNumber: string;
  durationMinutes: number;
}

export interface FlightOption {
  priceId: string;
  totalFare: number;
  currency: string;
  refundable: boolean;
  segments: FlightSegment[];
}

export interface FlightSearchResult {
  searchId: string;
  tripInfos: Record<string, FlightOption[]>; // ONWARD, RETURN, COMBO, etc.
}

export interface ReviewResult {
  bookingId: string;
  tripInfos: Array<{
    id: string;
    priceId: string;
    conditions: {
      st: number;     // session time in seconds
      isBA: boolean;  // hold booking available
      isa: boolean;   // seat selection available
      iecr: boolean;  // emergency contact required
      igm: boolean;   // GST mandatory
      dobe: boolean;  // DOB required
    };
    totalPriceInfo: {
      fd: { fC: { TF: number } };
    };
    segments: FlightSegment[];
  }>;
  alerts: Array<{ type: string; message: string }>;
}

export interface TravellerInfo {
  ti: 'Mr' | 'Mrs' | 'Ms' | 'Master';
  pt: PaxType;
  fN: string;
  lN: string;
  dob?: string;
  pNum?: string;
  eD?: string;
  pNat?: string;
  pid?: string;
}

export interface DeliveryInfo {
  emails: string[];
  contacts: string[];
}

export interface FlightBookPayload {
  bookingId: string;
  amount?: number;      // required for instant booking
  hold?: boolean;       // true for hold flow
  deliveryInfo: DeliveryInfo;
  travellerInfo: TravellerInfo[];
  contactInfo?: {
    emails: string[];
    contacts: string[];
    ecn: string;
  };
  gstInfo?: {
    gstNumber: string;
    registeredName: string;
    email: string;
    mobile: string;
    address: string;
  };
}
```

---

## 4. API Client Helper

```typescript
const BFF = process.env.NEXT_PUBLIC_BFF_URL ?? 'http://localhost:3001';
const BASE = `${BFF}/api/v1/tripjack/flights`;

interface ApiOptions {
  token: string;
  tenantSlug: string;
}

async function tjPost<T>(path: string, body: unknown, opts: ApiOptions): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.token}`,
      'X-Tenant-Slug': opts.tenantSlug,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.message ?? `TripJack flight request failed: ${path}`);
  }

  return json.data as T;
}

async function tjGet<T>(path: string, opts: ApiOptions): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${opts.token}`,
      'X-Tenant-Slug': opts.tenantSlug,
    },
  });

  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.message ?? `TripJack flight request failed: ${path}`);
  }

  return json.data as T;
}

export const tripjackFlights = {
  provision: (opts: ApiOptions) => tjPost('/_provision', {}, opts),
  search: <T>(body: FlightSearchPayload, opts: ApiOptions) => tjPost<T>('/search', body, opts),
  review: <T>(priceIds: string[], opts: ApiOptions) => tjPost<T>('/review', { priceIds }, opts),
  fareRule: <T>(priceIds: string[], opts: ApiOptions) => tjPost<T>('/fare-rule', { priceIds }, opts),
  seatMap: <T>(priceIds: string[], opts: ApiOptions) => tjPost<T>('/seat-map', { priceIds }, opts),
  fareValidateBook: <T>(bookingId: string, opts: ApiOptions) =>
    tjPost<T>('/fare-validate-book', { bookingId }, opts),
  book: <T>(body: FlightBookPayload, opts: ApiOptions) => tjPost<T>('/book', body, opts),
  fareValidate: <T>(bookingId: string, opts: ApiOptions) =>
    tjPost<T>('/fare-validate', { bookingId }, opts),
  confirmBook: <T>(bookingId: string, amount: number, opts: ApiOptions) =>
    tjPost<T>('/confirm-book', { bookingId, amount }, opts),
  bookingDetails: <T>(bookingId: string, opts: ApiOptions) =>
    tjPost<T>('/booking-details', { bookingId }, opts),
  unhold: <T>(bookingId: string, opts: ApiOptions) => tjPost<T>('/unhold', { bookingId }, opts),
  amendmentCharges: <T>(bookingId: string, remarks: string, opts: ApiOptions) =>
    tjPost<T>('/amendment-charges', { bookingId, remarks }, opts),
  submitAmendment: <T>(bookingId: string, remarks: string, opts: ApiOptions) =>
    tjPost<T>('/submit-amendment', { bookingId, remarks }, opts),
  amendmentDetails: <T>(amendmentId: string, opts: ApiOptions) =>
    tjPost<T>('/amendment-details', { amendmentId }, opts),
  userBalance: <T>(opts: ApiOptions) => tjGet<T>('/user-balance', opts),
};
```

---

## 5. Endpoint Reference

Base path: `/api/v1/tripjack/flights`

## Summary - All 15 Endpoints

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 1 | `POST` | `/api/v1/tripjack/flights/_provision` | Create tenant flight booking table |
| 2 | `POST` | `/api/v1/tripjack/flights/search` | Search flights by route/date/passenger count |
| 3 | `POST` | `/api/v1/tripjack/flights/review` | Lock selected priceIds -> get bookingId |
| 4 | `POST` | `/api/v1/tripjack/flights/fare-rule` | Get cancellation and date-change fare rules |
| 5 | `POST` | `/api/v1/tripjack/flights/seat-map` | Get seat, meal, and baggage SSR options |
| 6 | `POST` | `/api/v1/tripjack/flights/fare-validate-book` | Validate fare before instant booking |
| 7 | `POST` | `/api/v1/tripjack/flights/book` | Instant ticket or hold booking with traveller details |
| 8 | `POST` | `/api/v1/tripjack/flights/fare-validate` | Validate fare before ticketing a held booking |
| 9 | `POST` | `/api/v1/tripjack/flights/confirm-book` | Confirm and ticket a held booking |
| 10 | `POST` | `/api/v1/tripjack/flights/booking-details` | Get booking status, PNR, and ticket numbers |
| 11 | `POST` | `/api/v1/tripjack/flights/unhold` | Release a held PNR |
| 12 | `POST` | `/api/v1/tripjack/flights/amendment-charges` | Preview cancellation refund and penalty |
| 13 | `POST` | `/api/v1/tripjack/flights/submit-amendment` | Submit cancellation amendment |
| 14 | `POST` | `/api/v1/tripjack/flights/amendment-details` | Get amendment/cancellation status |
| 15 | `GET` | `/api/v1/tripjack/flights/user-balance` | Wallet balance widget |

> **Current mode:** `TRIPJACK_FLIGHT_MODE=stub` - responses come from the local in-memory flight stub.
> Switch to `TRIPJACK_FLIGHT_MODE=production` when real TripJack credentials are available.
> The BFF API contract (URLs and request/response shapes) stays the same in both modes.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/_provision` | Create tenant flight booking table |
| POST | `/search` | Search flights and return `priceId` values |
| POST | `/review` | Validate selected `priceIds`, return TripJack `bookingId` |
| POST | `/fare-rule` | Fetch fare rules |
| POST | `/seat-map` | Fetch seat, meal, baggage SSR options |
| POST | `/fare-validate-book` | Validate fare before instant book |
| POST | `/book` | Instant booking or hold booking |
| POST | `/fare-validate` | Validate fare for held booking |
| POST | `/confirm-book` | Ticket a held booking |
| POST | `/booking-details` | Fetch booking status, PNR, ticket numbers |
| POST | `/unhold` | Release held PNR |
| POST | `/amendment-charges` | Preview cancellation refund and penalty |
| POST | `/submit-amendment` | Submit cancellation amendment |
| POST | `/amendment-details` | Poll amendment status |
| GET | `/user-balance` | Fetch wallet/user balance |

---

## 6. End-to-End Examples

### Instant Booking

```typescript
const opts = { token, tenantSlug: 'acme-corp' };

const search = await tripjackFlights.search<FlightSearchResult>({
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
}, opts);

const priceId = search.tripInfos.ONWARD[0].priceId;
const review = await tripjackFlights.review<ReviewResult>([priceId], opts);
const amount = review.tripInfos[0].totalPriceInfo.fd.fC.TF;

await tripjackFlights.fareValidateBook(review.bookingId, opts);

const booking = await tripjackFlights.book({
  bookingId: review.bookingId,
  amount,
  deliveryInfo: {
    emails: ['customer@example.com'],
    contacts: ['+919500112233'],
  },
  travellerInfo: [
    {
      ti: 'Mr',
      pt: 'ADULT',
      fN: 'John',
      lN: 'Doe',
      dob: '1990-01-15',
    },
  ],
}, opts);

const details = await tripjackFlights.bookingDetails(review.bookingId, opts);
console.log(booking, details);
```

### Hold Booking, Ticket Later

```typescript
const review = await tripjackFlights.review<ReviewResult>([priceId], opts);

if (!review.tripInfos[0].conditions.isBA) {
  throw new Error('Hold booking is not available for this fare');
}

await tripjackFlights.book({
  bookingId: review.bookingId,
  hold: true,
  deliveryInfo: {
    emails: ['customer@example.com'],
    contacts: ['+919500112233'],
  },
  travellerInfo: [
    { ti: 'Mr', pt: 'ADULT', fN: 'John', lN: 'Doe', dob: '1990-01-15' },
  ],
}, opts);

const fare = await tripjackFlights.fareValidate<{ amount: number }>(review.bookingId, opts);
await tripjackFlights.confirmBook(review.bookingId, fare.amount, opts);
```

### Cancellation

```typescript
const charges = await tripjackFlights.amendmentCharges(
  bookingId,
  'Customer requested cancellation',
  opts
);

console.log('Refund preview', charges);

const submit = await tripjackFlights.submitAmendment<{ amendmentId: string }>(
  bookingId,
  'Customer requested cancellation',
  opts
);

const amendment = await tripjackFlights.amendmentDetails(submit.amendmentId, opts);
console.log('Cancellation status', amendment);
```

---

## 7. Important TripJack Rules

- Send `apikey` header to TripJack upstream. Do not send Bearer tokens upstream.
- UAT base URL: `https://apitest.tripjack.com`
- Production base URL: `https://tripjack.com`
- Upstream endpoint URLs must not end with `/`.
- `priceIds` come from search response.
- `bookingId` comes from review response, not from the UI.
- Instant booking sends payment amount.
- Hold booking omits payment amount and uses `hold: true` in the BFF request.
- After booking, poll `/booking-details` until status is stable.
- Watch review `alerts` for `FAREALERT` and show fare change messaging.
- Cancellation requires amendment flow: charges, submit, details.

---

## 8. Environment Setup

```dotenv
TRIPJACK_FLIGHT_MODE=stub
TRIPJACK_FLIGHT_BASE_URL=https://apitest.tripjack.com
TRIPJACK_API_KEY=
```

Use `TRIPJACK_FLIGHT_MODE=production` only when real credentials are available.

---

## 9. Backend Files

```text
packages/auth-bff/src/
├── services/tripjack/
│   ├── flight.interface.ts
│   ├── stub-flight.service.ts
│   ├── real-flight.service.ts
│   └── flight.service.factory.ts
├── schemas/
│   └── tripjack-flight.schema.ts
└── routes/
    └── tripjack-flight.routes.ts

db/migrations/tenant/
└── 005_tripjack_flight_bookings.sql

test-tripjack-flight-routes.js
```

---

## 10. Test Suite

Run backend first, then:

```bash
node test-tripjack-flight-routes.js
```

The suite covers:

- login setup
- flight module provisioning
- search
- review
- fare rule
- seat map
- fare validation
- instant booking
- hold booking
- confirm booking
- booking details
- amendment charges
- submit amendment
- amendment details
- user balance
- cross-tenant rejection
