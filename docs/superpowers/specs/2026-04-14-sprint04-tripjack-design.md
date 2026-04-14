# Sprint 04: TripJack Hotel Integration — Design Spec (v3.0)

**Date:** 2026-04-14 (REVISED for TripJack API v3.0)
**Status:** REVISED & APPROVED — ready for implementation plan
**Author:** Claude Sonnet 4.6 (brainstorming session), revised for v3.0 API
**Methodology:** PDCA + superpowers brainstorming → writing-plans
**API Version:** TripJack Hotel API v3.0 (from tripjackapi.txt)

---

## 1. Goal

Expose TripJack Hotel API to the BFF client layer as a fully-functional stub today.
When real TripJack credentials arrive, a single `.env` flag switch (`TRIPJACK_MODE=production`)
activates the real HTTP client — no route or schema changes required.

Stubs use **Gemini Flash LLM** (`@google/generative-ai` SDK) to generate realistic hotel
search results and booking confirmations. State is maintained in an **in-memory Map** (process
lifetime) and durably in a **PostgreSQL bookings table** (per-tenant schema).

---

## 2. Scope

### In scope (Sprint 04)
- TripJack **Hotel API** only (7 endpoints)
- `StubHotelService` — stateful in-memory + Gemini Flash
- `RealHotelService` — skeleton only, throws until credentials arrive
- `IHotelService` interface — the swap boundary
- `hotel.service.factory.ts` — reads `TRIPJACK_MODE` env var
- `gemini.client.ts` — thin wrapper around `@google/generative-ai`
- `tripjack.schema.ts` — Zod schemas for all 7 request bodies
- `tripjack.routes.ts` — Express routes mounted in `auth-bff`
- `004_tripjack_bookings.sql` — DB migration (per-tenant schema, RLS)
- `test-tripjack-routes.js` — 20-test end-to-end suite
- `CHECKPOINT_06.md`, `setup-travel-saas-sprint04.ps1`, `travel-saas-sprint04-sessions.ps1`

### Out of scope (future sprints)
- TripJack **Flights API** (Sprint 05+)
- Post-booking ancillaries, void, reissue (Sprint 05+)
- Real TripJack HTTP integration (when credentials arrive — just flip `.env`)
- Separate `tripjack-bff` microservice

---

## 3. API Contract (TripJack v3.0)

**BFF Base prefix:** `/api/v1/tripjack/hotels`
**Auth chain:** `requireAuth → requireTenant → requireRole('admin','operator')`
**Tenant scope:** resolved from JWT claim + `X-Tenant-Slug` header (same as Sprint 03)

**TripJack Upstream Base:** https://api.tripjack.com (or configured in .env)
**TripJack Auth:** API key in `apikey` header (from env: `TRIPJACK_API_KEY`)

### BFF Endpoints (Client-Facing)

| # | Method | Path | Body | TripJack Upstream | Response |
|---|--------|------|------|------------------|----------|
| 1 | POST | `/search` | `checkIn`, `checkOut`, `rooms[]`, `hids[]`, `currency`, `nationality` | `POST /hms/v3/hotel/listing` | `{ searchId, hotels[], status }` |
| 2 | POST | `/pricing` | `searchId`, `tjHotelId`, `checkIn`, `checkOut`, `rooms[]`, `currency` | `POST /hms/v3/hotel/pricing` | `{ options[], status }` |
| 3 | POST | `/review` | `searchId`, `optionId` | `POST /hms/v3/hotel/review` | `{ reviewId, priceChanged, status }` |
| 4 | POST | `/book` | `reviewId`, `travellerInfo[]`, `contactInfo`, `paymentInfo` | `POST /hms/v3/hotel/book` | `{ bookingId, pnr, bookingRef, status }` |
| 5 | POST | `/booking-detail` | `bookingId` | `POST /oms/v3/hotel/booking-details` | `{ booking: BookingDetail, status }` |
| 6 | POST | `/cancel` | `bookingId`, `remark` | `POST /oms/v3/hotel/cancel-booking` | `{ cancellationId, refundAmount, status }` |
| 7 | GET | `/static-detail/:hid` | (query param) | `GET /hms/v3/hotel/static-detail?hid={hid}` | `{ hotelDetail, status }` |
| 8 | POST | `/cities` | `cityName` | `POST /hms/v3/hotel/static-cities` | `{ cities[], status }` |
| 9 | GET | `/nationalities` | (none) | `GET /hms/v3/hotel/nationalities` | `{ nationalities[], status }` |
| 10 | GET | `/account/balance` | (none) | `GET /hms/v3/account/balance` | `{ balance, creditLimit, currency, status }` |

**Key Changes from 2022 API:**
- Hotel listing uses `hids[]` (pre-fetched hotel IDs), not city name search
- Pricing is a separate call (not inline with listing)
- Review returns `reviewId` (used in booking), not price confirmation
- Booking uses `reviewId`, not `hotelId` + `optionId`
- New endpoints: cancel, static-detail, cities, nationalities, account balance
- Field names: `checkIn` not `checkinDate`, `tjHotelId` not `id`, `contactInfo` not `deliveryInfo`

---

## 4. File Structure

```
packages/auth-bff/src/
├── services/
│   ├── gemini.client.ts               # GeminiClient — wraps @google/generative-ai (stub only)
│   └── tripjack/
│       ├── hotel.interface.ts          # IHotelService — 10 method signatures + v3.0 types
│       ├── stub-hotel.service.ts       # StubHotelService — Gemini Flash + in-memory Maps (v3.0)
│       ├── real-hotel.service.ts       # RealHotelService — real TripJack v3.0 API calls (axios)
│       └── hotel.service.factory.ts   # createHotelService() — reads TRIPJACK_MODE
├── schemas/
│   └── tripjack.schema.ts             # Zod schemas for all 10 request bodies (v3.0 fields)
└── routes/
    └── tripjack.routes.ts             # 10 Express routes (search, pricing, review, book, etc.)

db/migrations/tenant/
└── 004_tripjack_bookings.sql          # bookings table per tenant schema + RLS

packages/auth-bff/src/app.ts           # mount tripjackRoutes (additive only)
test-tripjack-routes.js                # 25-test suite (v3.0 flow)
CHECKPOINT_06.md                       # Sprint 04 state tracker (updated)
```

---

## 5. Stub State Machine (v3.0)

### In-memory stores (process lifetime)
```typescript
searchStore: Map<searchId, {
  hotels: Array<{
    tjHotelId: string,
    name: string,
    img: string,
    rt: number,
    option: { optionId: string, price: { totalPrice: number, currency: string } }
  }>,
  query: SearchQuery,
  createdAt: Date
}>

pricingStore: Map<`${searchId}:${tjHotelId}`, {
  options: Array<{ optionId, rooms, mealPlan, pricing, cancellation }>,
  createdAt: Date
}>

reviewStore: Map<optionId, {
  reviewId: string,
  searchId: string,
  priceChanged: boolean,
  createdAt: Date
}>

bookingStore: Map<bookingId, {
  status: string,
  pnr: string,
  travellers: any[],
  createdAt: Date
}>
```

### Gemini call points (exactly 2 per full booking flow)

| Call | Endpoint | Gemini generates | Cached in |
|------|----------|-----------------|-----------|
| 1 | `POST /search` | 5 realistic Indian hotels (v3.0 format) for hids + dates | `searchStore[searchId]` |
| 2 | `POST /book` | Booking confirmation with TJ-HTL prefix | `bookingStore[bookingId]` + DB |

All other calls derive responses from the cached Maps — no additional Gemini calls.

### Gemini prompt structure (v3.0)
```
System: You are a TripJack Hotel API v3.0 simulator. Return only valid JSON. No markdown.
        Match the exact schema provided. Use realistic Indian hotel names and prices in INR.

User:   Simulate hotel search for hids=[...], checkIn="{checkIn}", checkOut="{checkOut}",
        {n} room(s), {adults} adult(s). Return exactly 5 hotels as JSON array:
        [{
          "tjHotelId": "100000000{n}",
          "name": "Hotel Name",
          "img": "https://...",
          "rt": 1-5,
          "option": {
            "optionId": "OPT-H{n}-R1",
            "price": { "totalPrice": 2500.0, "currency": "INR" }
          }
        }]
```

---

## 6. Database: `004_tripjack_bookings.sql`

```sql
CREATE TABLE IF NOT EXISTS {schema}.tripjack_bookings (
    booking_id       VARCHAR(30) PRIMARY KEY,          -- TJS-prefixed
    search_id        VARCHAR(50),
    hotel_id         VARCHAR(100),
    option_id        VARCHAR(100),
    tenant_id        UUID NOT NULL,
    created_by       VARCHAR(15) NOT NULL,              -- mobile_number FK to clients
    status           VARCHAR(30) NOT NULL DEFAULT 'BOOKING_CONFIRMED',
    checkin_date     DATE NOT NULL,
    checkout_date    DATE NOT NULL,
    total_amount     NUMERIC(12,2),
    currency         VARCHAR(3) DEFAULT 'INR',
    traveller_info   JSONB,
    delivery_info    JSONB,
    raw_response     JSONB,                             -- full stub/real API response
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: tenant users see only their own bookings
-- updated_at trigger (same pattern as Sprint 03)
-- GIN index on traveller_info for JSONB queries
```

---

## 7. .env Additions (v3.0)

```dotenv
# TripJack Integration (v3.0)
TRIPJACK_MODE=stub              # stub | production
TRIPJACK_API_KEY=               # Real TripJack API key (production mode only)
TRIPJACK_BASE_URL=https://api.tripjack.com

# Gemini Flash (stub mode only)
GEMINI_API_KEY=your-key-here
GEMINI_MODEL=gemini-2.0-flash

# Stub mode: Gemini generates realistic v3.0 API responses
# Production mode: Real HTTP calls to TripJack v3.0 endpoints
```

---

## 8. Test Suite: `test-tripjack-routes.js` (25 tests, v3.0)

Follows `test-client-routes.js` pattern exactly — vanilla Node.js `http.request`, sequential async functions, `logTest()` helper, exits code 1 on failure. Tests v3.0 API flow.

| # | Test |
|---|------|
| setup01 | Login as admin — store token |
| setup02 | Provision client module (if needed) |
| 01 | POST /search — valid payload (hids, checkIn, checkOut) → returns searchId + hotels |
| 02 | POST /search — missing checkIn → 400 |
| 03 | POST /search — missing hids → 400 |
| 04 | POST /pricing — valid (searchId, tjHotelId, checkIn, checkOut) → returns options[] |
| 05 | POST /pricing — invalid searchId → 404 |
| 06 | POST /pricing — invalid tjHotelId → 404 |
| 07 | POST /review — valid (searchId, optionId) → returns reviewId + priceChanged |
| 08 | POST /review — invalid searchId → 404 |
| 09 | POST /review — invalid optionId → 404 |
| 10 | POST /book — valid (reviewId, travellerInfo, contactInfo) → returns bookingId + pnr |
| 11 | POST /book — duplicate bookingId → 409 |
| 12 | POST /book — missing travellerInfo → 400 |
| 13 | POST /book — invalid email in contactInfo → 400 |
| 14 | POST /booking-detail — valid bookingId → returns full booking + itinerary |
| 15 | POST /booking-detail — unknown bookingId → 404 |
| 16 | POST /cancel — valid bookingId → returns cancellationId + refundAmount |
| 17 | POST /cancel — already cancelled → 400 |
| 18 | GET /static-detail/:hid — valid hid → returns hotelDetail + amenities |
| 19 | GET /static-detail/:hid — invalid hid → 404 |
| 20 | POST /cities — valid cityName → returns cities[] with cityCode |
| 21 | GET /nationalities — no params → returns nationalities[] |
| 22 | GET /account/balance — valid → returns balance + creditLimit |
| 23 | Full flow: search → pricing → review → book → booking-detail |
| 24 | Cross-tenant: beta-org token rejected on acme-corp endpoint → 403 |
| 25 | Regression: node test-client-routes.js passes (0 regressions) |

---

## 9. Architecture Notes (v3.0)

- **Interface boundary is the production swap point.** `IHotelService` is the only contract. Routes never import `StubHotelService` or `RealHotelService` directly — always via factory.
- **`TRIPJACK_MODE` is read once at startup** in `hotel.service.factory.ts` — not per-request. Server restart required to switch modes.
  - `stub`: Uses Gemini Flash to generate realistic v3.0-shaped responses. In-memory Maps for state.
  - `production`: Real HTTP calls to TripJack v3.0 endpoints via axios, authenticated with `apikey` header.
- **Gemini errors (stub mode only):** If Gemini call fails, stub falls back to a hardcoded minimal fixture response and logs a warning. Production mode propagates HTTP errors normally.
- **`real-hotel.service.ts` implementation:** Makes actual HTTP calls to TripJack v3.0 API endpoints. Uses `axios` with configured base URL and API key. Implements proper error handling (4xx client errors, 5xx server errors).
- **Field mapping:** BFF routes normalize v3.0 field names for consistency. Internal use of v3.0 field names (tjHotelId, checkIn, etc.) throughout service layer.
- **RLS on `tripjack_bookings`**: same `app.current_tenant_id` session var pattern as Sprint 01–03.
- **Route mount order**: `app.use('/api/v1/tripjack/hotels', tripjackRoutes)` — no wildcard conflict with existing routes.
- **Search flow change:** Client provides `hids[]` (pre-fetched hotel IDs) instead of city name. City lookup happens separately via `/cities` endpoint.

---

## 10. Definition of Done (Sprint 04, v3.0)

- [ ] `CHECKPOINT_06.md` updated for v3.0 API structure
- [ ] `004_tripjack_bookings.sql` — migration runs idempotently in Docker
- [ ] `gemini.client.ts` — SDK wrapper, `GEMINI_API_KEY` from env (stub mode)
- [ ] `hotel.interface.ts` + `tripjack.schema.ts` — all 10 v3.0 schemas, all types exported
- [ ] `stub-hotel.service.ts` — stateful Maps + Gemini (v3.0 response shapes), Gemini fallback on error
- [ ] `real-hotel.service.ts` — full v3.0 implementation with axios + API key auth
- [ ] `hotel.service.factory.ts` — factory reads env, creates correct implementation
- [ ] `tripjack.routes.ts` — 10 routes (search, pricing, review, book, booking-detail, cancel, static-detail, cities, nationalities, account-balance), all middleware wired
- [ ] `app.ts` — tripjackRoutes mounted (additive only)
- [ ] `test-tripjack-routes.js` — 25/25 passing in Docker (includes v3.0 flow tests)
- [ ] `README_FULL.md` — Sprint 04 endpoint table appended (v3.0 endpoints)
- [ ] Git committed with `[SPRINT-04]` message
- [ ] Sprint 03 remaining work (README + git commit) done first
- [ ] TRIPJACK_MODE works correctly (stub/production swap)
