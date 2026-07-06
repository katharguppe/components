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
1. POST /search              -> get tripInfos with nested priceOptions
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
  filters?: FlightSearchFilters;
}

export interface FlightSearchFilters {
  arrivalTimeRanges?: Array<'00-06' | '06-12' | '12-18' | '18-24'>;
  departureTimeRanges?: Array<'00-06' | '06-12' | '12-18' | '18-24'>;
  showCheckInBaggage?: boolean;
  handBaggageOnly?: boolean;
  fareIdentifiers?: string[];   // ECO_VALUE, ECO_CLASSIC, PUBLISHED, NDC, etc.
  flightNumbers?: string[];     // 476, SG-476, 6E-1200
  airlines?: string[];          // airline code or name
  fareTypes?: Array<'REFUNDABLE' | 'NON_REFUNDABLE'>;
  refundable?: boolean;
  minPrice?: number;
  maxPrice?: number;
  departureTerminals?: string[];
  arrivalTerminals?: string[];
  departureAirports?: string[]; // airport code or normalized airport name
  arrivalAirports?: string[];
  layoverAirports?: string[];
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
  minLayoverMinutes?: number;
  maxLayoverMinutes?: number;
  stops?: Array<'DIRECT' | 'CONNECTING'>;
}

export interface FlightSegment {
  id: string;
  from: string;
  to: string;
  fromAirportName?: string;
  toAirportName?: string;
  departureTerminal?: string;
  arrivalTerminal?: string;
  departureTime: string;
  arrivalTime: string;
  airlineCode: string;
  airlineName: string;
  flightNumber: string;
  durationMinutes: number;
}

export interface FlightPriceOption {
  priceId: string;
  totalFare: number;
  currency: string;
  refundable: boolean;
  fareIdentifier?: string;
  checkInBaggage?: boolean;
  handBaggageOnly?: boolean;
}

export interface FlightCard {
  segments: FlightSegment[];
  priceOptions: FlightPriceOption[];
}

export interface FlightSearchResult {
  searchId: string;
  tripInfos: Record<string, FlightCard[]>; // ONWARD, RETURN, COMBO, etc.
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
  email?: string;
  mobile?: string;
  dob?: string;
  pan?: string;
  pNum?: string;
  eD?: string;
  pNat?: string;
  pid?: string;
  ssrBaggageInfos?: Array<{ key: string; code: string; amount?: number; desc?: string }>;
  ssrMealInfos?: Array<{ key: string; code: string; amount?: number; desc?: string }>;
  ssrSeatInfos?: Array<{ key: string; code: string; amount?: number; desc?: string }>;
  ssrExtraServiceInfos?: Array<{ key: string; code: string; amount?: number; desc?: string }>;
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

## Summary - All 23 Endpoints

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 1 | `POST` | `/api/v1/tripjack/flights/_provision` | Create tenant flight booking table |
| 2 | `POST` | `/api/v1/tripjack/flights/search` | Search flights by route/date/passenger count and return nested price options |
| 3 | `POST` | `/api/v1/tripjack/flights/review` | Lock selected priceIds -> get bookingId |
| 4 | `POST` | `/api/v1/tripjack/flights/details` | Aggregate flight details, fare details, fare rules, baggage, and seat map data |
| 5 | `POST` | `/api/v1/tripjack/flights/fare-rule` | Get cancellation and date-change fare rules |
| 6 | `POST` | `/api/v1/tripjack/flights/seat-map` | Get seat, meal, and baggage SSR options |
| 7 | `POST` | `/api/v1/tripjack/flights/fare-validate-book` | Validate fare before instant booking |
| 8 | `POST` | `/api/v1/tripjack/flights/book` | Instant ticket or hold booking with traveller details |
| 9 | `POST` | `/api/v1/tripjack/flights/fare-validate` | Validate fare before ticketing a held booking |
| 10 | `POST` | `/api/v1/tripjack/flights/confirm-book` | Confirm and ticket a held booking |
| 11 | `POST` | `/api/v1/tripjack/flights/booking-details` | Get booking status, PNR, and ticket numbers |
| 12 | `POST` | `/api/v1/tripjack/flights/unhold` | Release a held PNR |
| 13 | `POST` | `/api/v1/tripjack/flights/amendment-charges` | Preview cancellation/full-refund/void refund and penalty |
| 14 | `POST` | `/api/v1/tripjack/flights/submit-amendment` | Submit cancellation/full-refund/void amendment |
| 15 | `POST` | `/api/v1/tripjack/flights/amendment-details` | Get amendment status |
| 16 | `GET` | `/api/v1/tripjack/flights/user-balance` | Wallet balance widget |
| 17 | `POST` | `/api/v1/tripjack/flights/reissue/searchquery-list` | Start reissue search query polling |
| 18 | `POST` | `/api/v1/tripjack/flights/reissue/search` | Poll reissue flight options by requestId |
| 19 | `POST` | `/api/v1/tripjack/flights/reissue/review` | Review selected reissue priceIds |
| 20 | `POST` | `/api/v1/tripjack/flights/reissue/book` | Confirm auto-reissue amendment |
| 21 | `POST` | `/api/v1/tripjack/flights/ancillaries/fetch-seat` | Fetch post-booking seat map |
| 22 | `POST` | `/api/v1/tripjack/flights/ancillaries/fetch-ssr` | Fetch post-booking meal/baggage SSR |
| 23 | `POST` | `/api/v1/tripjack/flights/ancillaries/add-ssr` | Add paid post-booking SSR |

> **Current mode:** `TRIPJACK_FLIGHT_MODE=stub` - responses come from the local in-memory flight stub.
> Switch to `TRIPJACK_FLIGHT_MODE=production` when real TripJack credentials are available.
> The BFF API contract (URLs and request/response shapes) stays the same in both modes.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/_provision` | Create tenant flight booking table |
| POST | `/search` | Search flights and return flight cards with nested `priceOptions` |
| POST | `/review` | Validate selected `priceIds`, return TripJack `bookingId` |
| POST | `/details` | Aggregate data for Flight Details, Fare Details, Fare Rules, and Baggage Information tabs |
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
| POST | `/reissue/searchquery-list` | Start reissue search query polling |
| POST | `/reissue/search` | Poll reissue options by `requestId` |
| POST | `/reissue/review` | Review reissue `priceIds` |
| POST | `/reissue/book` | Book auto-reissue amendment |
| POST | `/ancillaries/fetch-seat` | Fetch post-booking seat map |
| POST | `/ancillaries/fetch-ssr` | Fetch post-booking SSR options |
| POST | `/ancillaries/add-ssr` | Add post-booking SSR |

---

### Search Filters

`POST /search` accepts an optional `filters` object. Filters are applied by the BFF after TripJack returns search results, so existing search calls still work without this object.

```json
{
  "cabinClass": "ECONOMY",
  "paxInfo": { "ADULT": 1 },
  "routeInfos": [
    {
      "fromCityOrAirport": "DEL",
      "toCityOrAirport": "BOM",
      "travelDate": "2026-06-20"
    }
  ],
  "filters": {
    "arrivalTimeRanges": ["00-06", "06-12"],
    "departureTimeRanges": ["06-12"],
    "showCheckInBaggage": true,
    "handBaggageOnly": false,
    "fareIdentifiers": ["ECO_VALUE", "PUBLISHED", "NDC"],
    "flightNumbers": ["SG-476"],
    "airlines": ["SG", "SpiceJet"],
    "fareTypes": ["NON_REFUNDABLE"],
    "minPrice": 5000,
    "maxPrice": 12000,
    "departureTerminals": ["Terminal 1"],
    "arrivalTerminals": ["Terminal 2"],
    "departureAirports": ["DEL"],
    "arrivalAirports": ["BOM"],
    "layoverAirports": ["HYD"],
    "maxDurationMinutes": 240,
    "maxLayoverMinutes": 120,
    "stops": ["DIRECT"]
  }
}
```

| UI Filter | Request Field |
|-----------|---------------|
| Arrival time tiles | `filters.arrivalTimeRanges` |
| Departure time tiles | `filters.departureTimeRanges` |
| Check-in baggage | `filters.showCheckInBaggage` |
| Hand baggage only | `filters.handBaggageOnly` |
| Fare identifier | `filters.fareIdentifiers` |
| Flight number | `filters.flightNumbers` |
| Airlines | `filters.airlines` |
| Refundable / non-refundable | `filters.fareTypes` or `filters.refundable` |
| Flight price | `filters.minPrice`, `filters.maxPrice` |
| Departure terminal | `filters.departureTerminals` |
| Arrival terminal | `filters.arrivalTerminals` |
| Departure airport | `filters.departureAirports` |
| Arrival airport | `filters.arrivalAirports` |
| Layover airport | `filters.layoverAirports` |
| Duration | `filters.minDurationMinutes`, `filters.maxDurationMinutes` |
| Layover duration | `filters.minLayoverMinutes`, `filters.maxLayoverMinutes` |
| Stops | `filters.stops` |

TripJack does not provide a separate filter API in the official collection. The BFF normalizes search response fields and applies these filters on the returned options.

One physical flight can return multiple TripJack price options. The BFF keeps them grouped under a single `FlightCard`, with each fare exposed inside `priceOptions`. Frontend should render these options inside the same flight card.

---

### Complete Passenger Booking Payload

Use this flow before showing the final booking form:

```text
1. POST /search       -> show flight cards and price options
2. POST /details      -> show Flight Details, Fare Details, Fare Rules, Baggage Information
3. POST /seat-map     -> fetch selectable seats/meals/baggage when applicable
4. POST /book         -> send selected passenger, contact, GST, and SSR details
5. POST /booking-details -> poll final PNR/ticket status
```

TripJack decides which extra passenger fields are required in the `/review` or `/details` response conditions:

| Condition | Meaning | Frontend Action |
|-----------|---------|-----------------|
| `conditions.dobe` | DOB required | Ask DOB in passenger form |
| `conditions.iecr` | Emergency contact required | Send `contactInfo` |
| `conditions.igm` | GST mandatory | Send `gstInfo` |
| `conditions.isa` | Seat applicable | Call `/seat-map` and allow seat selection |
| `conditions.pcs` / document conditions | Passport/document may be required | Ask passport fields when present |

#### Full Booking Example

```json
{
  "bookingId": "TJS123456789",
  "amount": 9338.7,
  "deliveryInfo": {
    "emails": ["customer@example.com"],
    "contacts": ["+919500112233"]
  },
  "contactInfo": {
    "emails": ["emergency@example.com"],
    "contacts": ["+919500112233"],
    "ecn": "Emergency Contact Name"
  },
  "travellerInfo": [
    {
      "ti": "Mr",
      "pt": "ADULT",
      "fN": "Amit",
      "lN": "Mehra",
      "email": "amit@example.com",
      "mobile": "+919500112233",
      "dob": "1990-01-01",
      "pan": "ABCDE1234F",
      "pNum": "P1234567",
      "eD": "2030-01-01",
      "pNat": "IN",
      "pid": "2020-01-01",
      "ssrBaggageInfos": [{ "key": "SEG-1", "code": "XB15" }],
      "ssrMealInfos": [{ "key": "SEG-1", "code": "VGML" }],
      "ssrSeatInfos": [{ "key": "SEG-1", "code": "12A" }],
      "ssrExtraServiceInfos": [{ "key": "SEG-1", "code": "EXTRA1" }]
    },
    {
      "ti": "Master",
      "pt": "CHILD",
      "fN": "Anuj",
      "lN": "Mehra",
      "dob": "2018-01-01"
    }
  ],
  "gstInfo": {
    "gstNumber": "27AAUFM1756H1ZT",
    "registeredName": "Lalu Laal Pvt Ltd",
    "email": "billing@example.com",
    "mobile": "9876543210",
    "address": "Delhi"
  }
}
```

#### Field Notes

| Field | Required When | Notes |
|-------|---------------|-------|
| `bookingId` | Always | Comes from `/review` or `/details`, not generated by frontend |
| `amount` | Instant booking | Use gross total fare `TF` from review/details response |
| `hold` | Hold booking | Send `true` and omit `amount` for hold flow |
| `deliveryInfo.emails` | Always | Ticket delivery email |
| `deliveryInfo.contacts` | Always | Use country code format, e.g. `+919500112233` |
| `contactInfo` | `conditions.iecr` true | Emergency contact used by airline |
| `travellerInfo[]` | Always | One object per passenger matching `paxInfo` counts |
| `travellerInfo[].dob` | `conditions.dobe` true, child/infant, or airline requirement | Format `YYYY-MM-DD` |
| `travellerInfo[].pan` | PAN required fares / domestic compliance | PAN card number |
| `pNum`, `eD`, `pNat`, `pid` | Passport/document required | Passport number, expiry, nationality, issue date |
| `gstInfo` | `conditions.igm` true or SME/GST fare | All GST fields must be provided together |
| `ssrBaggageInfos` | Passenger selected baggage | `key` is segment id from review/seat-map, `code` is selected SSR code |
| `ssrMealInfos` | Passenger selected meal | Use SSR code returned by TripJack |
| `ssrSeatInfos` | Passenger selected seat | Use seat code returned by `/seat-map` |
| `ssrExtraServiceInfos` | Passenger selected extra service | Use extra service code returned by TripJack |

Important SSR rule: frontend must not invent SSR `key` or `code`. First call `/details` or `/seat-map`, then pass the selected TripJack `key` and `code` in `/book`.

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

const priceId = search.tripInfos.ONWARD[0].priceOptions[0].priceId;
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
