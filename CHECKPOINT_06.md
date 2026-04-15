# CHECKPOINT_06: Sprint 04 — TripJack Hotel Integration

**Date:** 2026-04-14
**Status:** PLANNING — design approved, ready for implementation
**Author:** Claude Sonnet 4.6 (brainstorming + design session)
**Methodology:** PDCA + superpowers brainstorming → writing-plans

---

## 1. Sprint 04 Deliverables

| # | File | Status | Notes |
|---|------|--------|-------|
| 1 | `CHECKPOINT_06.md` | ✅ Done | This file |
| 2 | `db/migrations/tenant/004_tripjack_bookings.sql` | Not started | bookings table + RLS |
| 3 | `packages/auth-bff/src/services/gemini.client.ts` | Not started | Gemini Flash wrapper |
| 4 | `packages/auth-bff/src/services/tripjack/hotel.interface.ts` | Not started | IHotelService + types |
| 5 | `packages/auth-bff/src/schemas/tripjack.schema.ts` | Not started | Zod schemas (7 endpoints) |
| 6 | `packages/auth-bff/src/services/tripjack/stub-hotel.service.ts` | Not started | Gemini + in-memory Maps |
| 7 | `packages/auth-bff/src/services/tripjack/real-hotel.service.ts` | Not started | Skeleton, throws |
| 8 | `packages/auth-bff/src/services/tripjack/hotel.service.factory.ts` | Not started | Reads TRIPJACK_MODE |
| 9 | `packages/auth-bff/src/routes/tripjack.routes.ts` | Not started | 7 Express routes |
| 10 | `packages/auth-bff/src/app.ts` | Not started | Mount tripjackRoutes (additive) |
| 11 | `test-tripjack-routes.js` | Not started | 20 tests |
| 12 | `README_FULL.md` | Not started | Sprint 04 endpoint table |
| 13 | `git commit` | Not started | [SPRINT-04] message |

---

## 2. API Contract

**Base prefix:** `/api/v1/tripjack/hotels`
**Auth chain:** `requireAuth → requireTenant → requireRole('admin','operator')`

| # | Method | Path | Body | Response |
|---|--------|------|------|----------|
| 1 | POST | `/search` | `checkinDate`, `checkoutDate`, `roomInfo[]`, `city`, `currency`, `nationality` | `{ searchIds: string[] }` |
| 2 | POST | `/search/results` | `searchId` | `{ hotels: HotelSummary[], size: number }` |
| 3 | POST | `/detail` | `id` | `{ hotel: HotelDetail, roomOptions: RoomOption[] }` |
| 4 | POST | `/review` | `hotelId`, `optionId` | `{ priceConfirmed: bool, totalPrice: number }` |
| 5 | POST | `/cancellation-policy` | `id`, `optionId` | `{ cancellationPolicy: Policy }` |
| 6 | POST | `/book` | `bookingId`, `roomTravellerInfo[]`, `deliveryInfo`, `paymentInfos[]` | `{ bookingId: string, status }` |
| 7 | POST | `/booking-detail` | `bookingId` | `{ booking: BookingDetail }` |

**bookingId format:** `TJS` + 12 random alphanumeric chars — generated in route layer.

---

## 3. Architecture Decisions

### Interface-based swap pattern
```
IHotelService (interface)
  ├── StubHotelService   -- TRIPJACK_MODE=stub (default)
  └── RealHotelService   -- TRIPJACK_MODE=production (skeleton)

hotel.service.factory.ts -- reads env once at startup, exports singleton
tripjack.routes.ts       -- imports only from factory, never directly from services
```

### Stub state machine
```
searchStore: Map<searchId, { hotels, query, createdAt }>
bookingStore: Map<bookingId, { status, hotel, travellers, createdAt }>

Gemini called exactly TWICE per full booking flow:
  1. POST /search/results -> generate 5 hotels -> cache in searchStore
  2. POST /book           -> generate confirmation -> cache in bookingStore + DB

All other calls derive from Maps. No extra Gemini calls.
```

### Gemini error resilience
If Gemini call fails: log warning, return hardcoded minimal fixture. Never crash the flow.

### .env switch (no code changes required for prod swap)
```
TRIPJACK_MODE=stub        -> StubHotelService (Gemini)
TRIPJACK_MODE=production  -> RealHotelService (axios → api.tripjack.com)
```

---

## 4. Database Schema

```sql
-- Per-tenant schema (same pattern as Sprint 03)
CREATE TABLE IF NOT EXISTS {schema}.tripjack_bookings (
    booking_id    VARCHAR(30) PRIMARY KEY,   -- TJS-prefixed
    search_id     VARCHAR(50),
    hotel_id      VARCHAR(100),
    option_id     VARCHAR(100),
    tenant_id     UUID NOT NULL,
    created_by    VARCHAR(15) NOT NULL,      -- mobile_number FK to clients
    status        VARCHAR(30) NOT NULL DEFAULT 'BOOKING_CONFIRMED',
    checkin_date  DATE NOT NULL,
    checkout_date DATE NOT NULL,
    total_amount  NUMERIC(12,2),
    currency      VARCHAR(3) DEFAULT 'INR',
    traveller_info  JSONB,
    delivery_info   JSONB,
    raw_response    JSONB,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 5. Prerequisites (Sprint 03 remaining work)

Before starting Sprint 04 implementation, complete Sprint 03:
- [ ] Restart server, run `node test-client-routes.js` → confirm 28/28 pass
- [ ] Append Sprint 03 endpoint table to `README_FULL.md`
- [ ] `git commit` all Sprint 03 files with `[SPRINT-03]` message

---

## 6. Definition of Done (Sprint 04)

- [ ] All 12 source files written
- [ ] `TRIPJACK_MODE=stub` in `packages/auth-bff/.env`
- [ ] `GEMINI_API_KEY` set in `packages/auth-bff/.env`
- [ ] Server restarts cleanly, logs "TripJack hotel service: stub mode"
- [ ] `node test-tripjack-routes.js` → 20/20 passing in Docker
- [ ] `node test-client-routes.js` → 28/28 passing (0 regressions)
- [ ] `README_FULL.md` Sprint 04 endpoint table appended
- [ ] Git committed with `[SPRINT-04]` message
