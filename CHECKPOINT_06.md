# CHECKPOINT_06: Sprint 04 — TripJack Hotel Integration (v3.0)

**Date:** 2026-04-20
**Status:** IMPLEMENTATION READY — all prerequisites met, ready for file-by-file build
**Author:** Claude Sonnet 4.6 (audit + gate session)
**Methodology:** PDCA + subagent-driven-development
**API Version:** TripJack Hotel API v3.0

---

## 1. Sprint 03 Gate Status (COMPLETE)

| Item | Status | Evidence |
|------|--------|---------|
| 28/28 client module tests passing | ✅ Done | Verified 2026-04-20, commit 414c34c |
| README_FULL.md Sprint 03 table | ✅ Done | Lines 1092–1123 in README_FULL.md |
| git commit [SPRINT-03] | ✅ Done | Commit 414c34c |
| @google/generative-ai installed | ✅ Done | ^0.24.1 in auth-bff package.json |
| axios installed | ✅ Done | ^1.15.1 in auth-bff package.json |
| .env Sprint 04 vars | ✅ Done | TRIPJACK_MODE, GEMINI_API_KEY, GEMINI_MODEL, etc. |

---

## 2. Sprint 04 Deliverables — v3.0 (11 tasks)

| # | File | Status | Notes |
|---|------|--------|-------|
| 1 | `db/migrations/tenant/004_tripjack_bookings.sql` | Not started | bookings table + RLS (v3.0 schema) |
| 2 | `packages/auth-bff/src/services/gemini.client.ts` | Not started | Gemini Flash wrapper |
| 3 | `packages/auth-bff/src/services/tripjack/hotel.interface.ts` | Not started | IHotelService + v3.0 types |
| 4 | `packages/auth-bff/src/schemas/tripjack.schema.ts` | Not started | Zod schemas — 10 endpoint bodies |
| 5 | `packages/auth-bff/src/services/tripjack/stub-hotel.service.ts` | Not started | Gemini + in-memory Maps (v3.0 shapes) |
| 6 | `packages/auth-bff/src/services/tripjack/real-hotel.service.ts` | Not started | Full axios HTTP implementation |
| 7 | `packages/auth-bff/src/services/tripjack/hotel.service.factory.ts` | Not started | Reads TRIPJACK_MODE once at startup |
| 8 | `packages/auth-bff/src/routes/tripjack.routes.ts` | Not started | 10 Express routes |
| 9 | `packages/auth-bff/src/app.ts` | Not started | Mount tripjackRoutes (additive only) |
| 10 | `test-tripjack-routes.js` | Not started | 25-test v3.0 suite |
| 11 | `README_FULL.md` | Not started | Append Sprint 04 endpoint table |

---

## 3. API Contract (v3.0) — 10 Endpoints

**BFF Base prefix:** `/api/v1/tripjack/hotels`
**Auth chain:** `requireAuth → requireTenant → requireRole('admin','operator')`
**Tenant scope:** JWT claim + `X-Tenant-Slug` header

**TripJack Upstream:** `https://api.tripjack.com`
**TripJack Auth header:** `apikey: <TRIPJACK_API_KEY>`

| # | Method | BFF Path | Request Body | TripJack Upstream | Response |
|---|--------|----------|-------------|------------------|----------|
| 1 | POST | `/search` | `checkIn`, `checkOut`, `rooms[]`, `hids[]`, `currency`, `nationality` | `POST /hms/v3/hotel/listing` | `{ searchId, hotels[], status }` |
| 2 | POST | `/pricing` | `searchId`, `tjHotelId`, `checkIn`, `checkOut`, `rooms[]`, `currency` | `POST /hms/v3/hotel/pricing` | `{ options[], status }` |
| 3 | POST | `/review` | `searchId`, `optionId` | `POST /hms/v3/hotel/review` | `{ reviewId, priceChanged, status }` |
| 4 | POST | `/book` | `reviewId`, `travellerInfo[]`, `contactInfo`, `paymentInfo` | `POST /hms/v3/hotel/book` | `{ bookingId, pnr, bookingRef, status }` |
| 5 | POST | `/booking-detail` | `bookingId` | `POST /oms/v3/hotel/booking-details` | `{ booking: BookingDetail, status }` |
| 6 | POST | `/cancel` | `bookingId`, `remark` | `POST /oms/v3/hotel/cancel-booking` | `{ cancellationId, refundAmount, status }` |
| 7 | GET | `/static-detail/:hid` | (path param) | `GET /hms/v3/hotel/static-detail?hid={hid}` | `{ hotelDetail, status }` |
| 8 | POST | `/cities` | `cityName` | `POST /hms/v3/hotel/static-cities` | `{ cities[], status }` |
| 9 | GET | `/nationalities` | (none) | `GET /hms/v3/hotel/nationalities` | `{ nationalities[], status }` |
| 10 | GET | `/account/balance` | (none) | `GET /hms/v3/account/balance` | `{ balance, creditLimit, currency, status }` |

**Key v3.0 field names (NOT old API):**

| Concept | Old API (samples) | v3.0 (use this) |
|---------|------------------|-----------------|
| Hotel ID | `id` / `hotelId` | `tjHotelId` |
| Check-in | `checkinDate` | `checkIn` |
| Check-out | `checkoutDate` | `checkOut` |
| Search input | `city` (code) | `hids[]` (hotel ID array) |
| Contact | `deliveryInfo` | `contactInfo` |
| Review input | `hotelId` + `optionId` | `searchId` + `optionId` |
| Review output | price confirmation | `reviewId` (new field) |
| Book input | `bookingId` passed in | `reviewId` from review step |
| bookingId | generated client-side | generated **server-side** in route layer |

**bookingId format:** `TJS` + 12 random numeric digits (e.g. `TJS209400037089`)
```typescript
const bookingId = `TJS${Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join('')}`;
```

---

## 4. Stub State Machine (v3.0)

### In-memory stores (process lifetime)
```typescript
// Populated by POST /search (Gemini call #1)
searchStore: Map<searchId, {
  hotels: Array<{
    tjHotelId: string;
    name: string;
    img: string;
    rt: number;
    option: { optionId: string; price: { totalPrice: number; currency: string } };
  }>;
  query: SearchQuery;
  createdAt: Date;
}>

// Populated by POST /pricing (derived — no Gemini)
pricingStore: Map<`${searchId}:${tjHotelId}`, {
  options: Array<{ optionId: string; rooms: any[]; mealPlan: string; pricing: any; cancellation: any }>;
  createdAt: Date;
}>

// Populated by POST /review (derived — no Gemini)
reviewStore: Map<optionId, {
  reviewId: string;
  searchId: string;
  priceChanged: boolean;
  createdAt: Date;
}>

// Populated by POST /book (Gemini call #2 + DB insert)
bookingStore: Map<bookingId, {
  status: string;
  pnr: string;
  travellers: any[];
  createdAt: Date;
}>
```

### Gemini call points (exactly 2 per full flow)

| Call # | Endpoint | Gemini generates | Cached in |
|--------|----------|-----------------|-----------|
| 1 | `POST /search` | 5 realistic Indian hotels (v3.0 format) for hids + dates | `searchStore[searchId]` |
| 2 | `POST /book` | Booking confirmation with TJS prefix | `bookingStore[bookingId]` + DB |

All other calls (pricing, review, cancel, detail, cities, nationalities, balance) derive from Maps or hardcoded fixtures — no additional Gemini calls.

### Gemini fallback
If Gemini call fails: log warning, return hardcoded minimal fixture. Never crash the booking flow.

---

## 5. Database: `004_tripjack_bookings.sql`

```sql
-- Per-tenant schema (same pattern as 003_client_module.sql)
CREATE TABLE IF NOT EXISTS {schema}.tripjack_bookings (
    booking_id       VARCHAR(30) PRIMARY KEY,          -- TJS + 12 digits
    search_id        VARCHAR(50),
    hotel_id         VARCHAR(100),
    option_id        VARCHAR(100),
    tenant_id        UUID NOT NULL,
    created_by       VARCHAR(15) NOT NULL,              -- mobile_number (FK to clients)
    status           VARCHAR(30) NOT NULL DEFAULT 'BOOKING_CONFIRMED',
    checkin_date     DATE NOT NULL,
    checkout_date    DATE NOT NULL,
    total_amount     NUMERIC(12,2),
    currency         VARCHAR(3) DEFAULT 'INR',
    traveller_info   JSONB,
    contact_info     JSONB,                             -- v3.0: was delivery_info
    raw_response     JSONB,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);
-- RLS + updated_at trigger + GIN index on traveller_info
```

---

## 6. File Structure

```
packages/auth-bff/src/
├── services/
│   ├── gemini.client.ts
│   └── tripjack/
│       ├── hotel.interface.ts          # IHotelService — 10 method signatures
│       ├── stub-hotel.service.ts       # StubHotelService — Gemini + Maps
│       ├── real-hotel.service.ts       # RealHotelService — axios HTTP
│       └── hotel.service.factory.ts   # createHotelService() — env switch
├── schemas/
│   └── tripjack.schema.ts             # Zod — 10 request bodies
└── routes/
    └── tripjack.routes.ts             # 10 Express routes

db/migrations/tenant/
└── 004_tripjack_bookings.sql

packages/auth-bff/src/app.ts           # additive mount only
test-tripjack-routes.js                # 25 tests
README_FULL.md                         # append Sprint 04 table
```

---

## 7. Architecture Rules (carry forward from design spec)

- `IHotelService` is the **only** swap boundary — routes import from factory only
- `TRIPJACK_MODE` read **once at startup** — server restart required to switch modes
- Gemini errors → log warning + hardcoded fixture → never crash
- `bookingId` generated in **route layer**, not service layer
- All timestamps UTC (`TIMESTAMPTZ DEFAULT NOW()`)
- Audit log entry for `POST /book` mutation via `prisma.authEvent.create()`
- RLS: same `app.current_tenant_id` session var pattern as Sprint 01–03
- No `search_path` per request — fully-qualified `"tenant_{slug}".tablename`
- Route mount: `app.use('/api/v1/tripjack/hotels', tripjackRoutes)` — no conflict
- Zod `safeParse()` for all request bodies — never `parse()`

---

## 8. .env (confirmed present)

```dotenv
TRIPJACK_MODE=stub
TRIPJACK_API_KEY=
TRIPJACK_BASE_URL=https://api.tripjack.com
GEMINI_API_KEY=<set>
GEMINI_MODEL=gemini-2.0-flash
```

---

## 9. Test Suite: `test-tripjack-routes.js` (25 tests)

Follows `test-client-routes.js` pattern — vanilla Node.js `http.request`, sequential async, `logTest()` helper.

| # | Test |
|---|------|
| setup01 | Login as admin → store token |
| setup02 | Provision client module (idempotent) |
| 01 | POST /search — valid (hids, checkIn, checkOut) → searchId + hotels |
| 02 | POST /search — missing checkIn → 400 |
| 03 | POST /search — missing hids → 400 |
| 04 | POST /pricing — valid (searchId, tjHotelId) → options[] |
| 05 | POST /pricing — invalid searchId → 404 |
| 06 | POST /pricing — invalid tjHotelId → 404 |
| 07 | POST /review — valid (searchId, optionId) → reviewId + priceChanged |
| 08 | POST /review — invalid searchId → 404 |
| 09 | POST /review — invalid optionId → 404 |
| 10 | POST /book — valid (reviewId, travellerInfo, contactInfo) → bookingId + pnr |
| 11 | POST /book — duplicate bookingId → 409 |
| 12 | POST /book — missing travellerInfo → 400 |
| 13 | POST /book — invalid email in contactInfo → 400 |
| 14 | POST /booking-detail — valid bookingId → full booking |
| 15 | POST /booking-detail — unknown bookingId → 404 |
| 16 | POST /cancel — valid bookingId → cancellationId + refundAmount |
| 17 | POST /cancel — already cancelled → 400 |
| 18 | GET /static-detail/:hid — valid hid → hotelDetail + amenities |
| 19 | GET /static-detail/:hid — invalid hid → 404 |
| 20 | POST /cities — valid cityName → cities[] |
| 21 | GET /nationalities → nationalities[] |
| 22 | GET /account/balance → balance + creditLimit |
| 23 | Full flow: search → pricing → review → book → booking-detail |
| 24 | Cross-tenant: beta-org token rejected on acme-corp endpoint → 403 |
| 25 | Regression: node test-client-routes.js → 28/28 (0 regressions) |

---

## 10. Definition of Done (Sprint 04)

- [ ] `004_tripjack_bookings.sql` — migration runs idempotently in Docker
- [ ] `gemini.client.ts` — SDK wrapper, error-safe
- [ ] `hotel.interface.ts` + `tripjack.schema.ts` — all 10 v3.0 types and schemas
- [ ] `stub-hotel.service.ts` — stateful Maps + Gemini, fallback on error
- [ ] `real-hotel.service.ts` — full v3.0 axios implementation
- [ ] `hotel.service.factory.ts` — reads env, creates correct impl
- [ ] `tripjack.routes.ts` — 10 routes, full middleware stack
- [ ] `app.ts` — tripjackRoutes mounted (additive only)
- [ ] `test-tripjack-routes.js` — 25/25 passing in Docker
- [ ] `README_FULL.md` — Sprint 04 endpoint table appended
- [ ] git committed with `[SPRINT-04]` message
- [ ] `node test-client-routes.js` still 28/28 (no regressions)
