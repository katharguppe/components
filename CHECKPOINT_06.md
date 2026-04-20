# CHECKPOINT_06: Sprint 04 â€” TripJack Hotel Integration (v3.0)

**Date:** 2026-04-20
**Status:** COMPLETE  - all 11 deliverables committed, 25/25 tests passing, 0 regressions
**Author:** Claude Sonnet 4.6 (audit + gate session)
**Methodology:** PDCA + subagent-driven-development
**API Version:** TripJack Hotel API v3.0

---

## 1. Sprint 03 Gate Status (COMPLETE)

| Item | Status | Evidence |
|------|--------|---------|
| 28/28 client module tests passing | âœ… Done | Verified 2026-04-20, commit 414c34c |
| README_FULL.md Sprint 03 table | âœ… Done | Lines 1092â€“1123 in README_FULL.md |
| git commit [SPRINT-03] | âœ… Done | Commit 414c34c |
| @google/generative-ai installed | âœ… Done | ^0.24.1 in auth-bff package.json |
| axios installed | âœ… Done | ^1.15.1 in auth-bff package.json |
| .env Sprint 04 vars | âœ… Done | TRIPJACK_MODE, GEMINI_API_KEY, GEMINI_MODEL, etc. |

---

## 2. Sprint 04 Deliverables â€” v3.0 (11 tasks)

| # | File | Status | Notes |
|---|------|--------|-------|
| 1 | `db/migrations/tenant/004_tripjack_bookings.sql` | DONE | bookings table + RLS (v3.0 schema) |
| 2 | `packages/auth-bff/src/services/gemini.client.ts` | DONE | Gemini Flash wrapper |
| 3 | `packages/auth-bff/src/services/tripjack/hotel.interface.ts` | DONE | IHotelService + v3.0 types |
| 4 | `packages/auth-bff/src/schemas/tripjack.schema.ts` | DONE | Zod schemas  - 10 endpoint bodies |
| 5 | `packages/auth-bff/src/services/tripjack/stub-hotel.service.ts` | DONE | Gemini + in-memory Maps (v3.0 shapes) |
| 6 | `packages/auth-bff/src/services/tripjack/real-hotel.service.ts` | DONE | Full axios HTTP implementation |
| 7 | `packages/auth-bff/src/services/tripjack/hotel.service.factory.ts` | DONE | Reads TRIPJACK_MODE once at startup |
| 8 | `packages/auth-bff/src/routes/tripjack.routes.ts` | DONE | 10 Express routes |
| 9 | `packages/auth-bff/src/app.ts` | DONE | Mount tripjackRoutes (additive only) |
| 10 | `test-tripjack-routes.js` | DONE | 25/25 passing |
| 11 | `README_FULL.md` | DONE | Sprint 04 endpoint table appended |

---

## 3. API Contract (v3.0) â€” 10 Endpoints

**BFF Base prefix:** `/api/v1/tripjack/hotels`
**Auth chain:** `requireAuth â†’ requireTenant â†’ requireRole('admin','operator')`
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

// Populated by POST /pricing (derived â€” no Gemini)
pricingStore: Map<`${searchId}:${tjHotelId}`, {
  options: Array<{ optionId: string; rooms: any[]; mealPlan: string; pricing: any; cancellation: any }>;
  createdAt: Date;
}>

// Populated by POST /review (derived â€” no Gemini)
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

All other calls (pricing, review, cancel, detail, cities, nationalities, balance) derive from Maps or hardcoded fixtures â€” no additional Gemini calls.

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
â”œâ”€â”€ services/
â”‚   â”œâ”€â”€ gemini.client.ts
â”‚   â””â”€â”€ tripjack/
â”‚       â”œâ”€â”€ hotel.interface.ts          # IHotelService â€” 10 method signatures
â”‚       â”œâ”€â”€ stub-hotel.service.ts       # StubHotelService â€” Gemini + Maps
â”‚       â”œâ”€â”€ real-hotel.service.ts       # RealHotelService â€” axios HTTP
â”‚       â””â”€â”€ hotel.service.factory.ts   # createHotelService() â€” env switch
â”œâ”€â”€ schemas/
â”‚   â””â”€â”€ tripjack.schema.ts             # Zod â€” 10 request bodies
â””â”€â”€ routes/
    â””â”€â”€ tripjack.routes.ts             # 10 Express routes

db/migrations/tenant/
â””â”€â”€ 004_tripjack_bookings.sql

packages/auth-bff/src/app.ts           # additive mount only
test-tripjack-routes.js                # 25 tests
README_FULL.md                         # append Sprint 04 table
```

---

## 7. Architecture Rules (carry forward from design spec)

- `IHotelService` is the **only** swap boundary â€” routes import from factory only
- `TRIPJACK_MODE` read **once at startup** â€” server restart required to switch modes
- Gemini errors â†’ log warning + hardcoded fixture â†’ never crash
- `bookingId` generated in **route layer**, not service layer
- All timestamps UTC (`TIMESTAMPTZ DEFAULT NOW()`)
- Audit log entry for `POST /book` mutation via `prisma.authEvent.create()`
- RLS: same `app.current_tenant_id` session var pattern as Sprint 01â€“03
- No `search_path` per request â€” fully-qualified `"tenant_{slug}".tablename`
- Route mount: `app.use('/api/v1/tripjack/hotels', tripjackRoutes)` â€” no conflict
- Zod `safeParse()` for all request bodies â€” never `parse()`

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

Follows `test-client-routes.js` pattern â€” vanilla Node.js `http.request`, sequential async, `logTest()` helper.

| # | Test |
|---|------|
| setup01 | Login as admin â†’ store token |
| setup02 | Provision client module (idempotent) |
| 01 | POST /search â€” valid (hids, checkIn, checkOut) â†’ searchId + hotels |
| 02 | POST /search â€” missing checkIn â†’ 400 |
| 03 | POST /search â€” missing hids â†’ 400 |
| 04 | POST /pricing â€” valid (searchId, tjHotelId) â†’ options[] |
| 05 | POST /pricing â€” invalid searchId â†’ 404 |
| 06 | POST /pricing â€” invalid tjHotelId â†’ 404 |
| 07 | POST /review â€” valid (searchId, optionId) â†’ reviewId + priceChanged |
| 08 | POST /review â€” invalid searchId â†’ 404 |
| 09 | POST /review â€” invalid optionId â†’ 404 |
| 10 | POST /book â€” valid (reviewId, travellerInfo, contactInfo) â†’ bookingId + pnr |
| 11 | POST /book â€” duplicate bookingId â†’ 409 |
| 12 | POST /book â€” missing travellerInfo â†’ 400 |
| 13 | POST /book â€” invalid email in contactInfo â†’ 400 |
| 14 | POST /booking-detail â€” valid bookingId â†’ full booking |
| 15 | POST /booking-detail â€” unknown bookingId â†’ 404 |
| 16 | POST /cancel â€” valid bookingId â†’ cancellationId + refundAmount |
| 17 | POST /cancel â€” already cancelled â†’ 400 |
| 18 | GET /static-detail/:hid â€” valid hid â†’ hotelDetail + amenities |
| 19 | GET /static-detail/:hid â€” invalid hid â†’ 404 |
| 20 | POST /cities â€” valid cityName â†’ cities[] |
| 21 | GET /nationalities â†’ nationalities[] |
| 22 | GET /account/balance â†’ balance + creditLimit |
| 23 | Full flow: search â†’ pricing â†’ review â†’ book â†’ booking-detail |
| 24 | Cross-tenant: beta-org token rejected on acme-corp endpoint â†’ 403 |
| 25 | Regression: node test-client-routes.js â†’ 28/28 (0 regressions) |

---

## 10. Definition of Done (Sprint 04)

- [x] `004_tripjack_bookings.sql` â€” migration runs idempotently in Docker
- [x] `gemini.client.ts` â€” SDK wrapper, error-safe
- [x] `hotel.interface.ts` + `tripjack.schema.ts` â€” all 10 v3.0 types and schemas
- [x] `stub-hotel.service.ts` â€” stateful Maps + Gemini, fallback on error
- [x] `real-hotel.service.ts` â€” full v3.0 axios implementation
- [x] `hotel.service.factory.ts` â€” reads env, creates correct impl
- [x] `tripjack.routes.ts` â€” 10 routes, full middleware stack
- [x] `app.ts` â€” tripjackRoutes mounted (additive only)
- [x] `test-tripjack-routes.js` â€” 25/25 passing in Docker
- [x] `README_FULL.md` â€” Sprint 04 endpoint table appended
- [x] git committed with `[SPRINT-04]` message
- [x] `node test-client-routes.js` still 28/28 (no regressions)


---

## 11. Gate Results (sprint04-gate.ps1)

**Run date:** 2026-04-20 09:32 UTC
**Duration:** ~0 minutes

| Suite | Result | Count |
|-------|--------|-------|
| test-admin-routes.js (Sprint 01/02) | PASS | all passing |
| test-operator-routes.js (Sprint 01/02) | PASS | all passing |
| test-client-routes.js (Sprint 03) | PASS | 28/28 |
| test-tripjack-routes.js (Sprint 04) | PASS | 25/25 |

**Sprint 04 status: COMPLETE**
All 11 deliverables committed (bd230f0). All suites green. No regressions.
