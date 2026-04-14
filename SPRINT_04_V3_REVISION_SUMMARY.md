# Sprint 04 V3.0 Revision Summary

**Date:** 2026-04-14
**Status:** Design + Plan Complete — Ready for Implementation
**Changes:** Updated entire Sprint 04 scope for TripJack API v3.0 (vs. 2022 samples)

---

## What Changed

### Discovery
Found `tripjackapi.txt` containing TripJack Hotel API **v3.0 specification**. This is significantly different from the 2022 sample files and the original approved design.

### Updates Made

#### 1. Updated Design Document
**File:** `docs/superpowers/specs/2026-04-14-sprint04-tripjack-design.md`

**Changes:**
- API Contract: 7 endpoints → **10 endpoints** (v3.0)
- Booking flow: search/results/detail → **search/pricing/review/book**
- Field names: standardized to v3.0 (tjHotelId, checkIn, contactInfo, etc.)
- Response shapes: updated to match v3.0 format
- State machine: added pricing & review stores
- Gemini prompts: updated for v3.0 hotel format
- Service layer: RealHotelService now does actual HTTP calls via axios
- Test suite: 20 tests → **25 tests** (covers all 10 endpoints + v3.0 flow)

**Commits:**
- `4bbfff2` [SPRINT-04] docs: revise design spec for TripJack API v3.0

#### 2. Created New Implementation Plan
**File:** `docs/superpowers/plans/2026-04-14-sprint04-tripjack-v3-implementation.md`

**Structure:**
- 11 tasks (vs. 12 in original, consolidated some)
- 10 endpoints (vs. 7)
- v3.0 field names & request/response shapes
- Complete code for all services, routes, schemas, tests
- Detailed step-by-step instructions with commits

**Commits:**
- `99d9f40` [SPRINT-04] plan: implementation plan for TripJack v3.0 API

---

## Key Differences: v3.0 vs. 2022

### Endpoints: 7 → 10

| # | Old | New | v3.0 Endpoint |
|---|-----|-----|---|
| 1 | `/search` | `/search` | `POST /hms/v3/hotel/listing` |
| 2 | `/search/results` | removed | (merged into search response) |
| 3 | `/detail` | `/pricing` | `POST /hms/v3/hotel/pricing` |
| 4 | `/review` | `/review` | `POST /hms/v3/hotel/review` |
| 5 | `/cancellation-policy` | removed | (part of pricing response) |
| 6 | `/book` | `/book` | `POST /hms/v3/hotel/book` |
| 7 | `/booking-detail` | `/booking-detail` | `POST /oms/v3/hotel/booking-details` |
| — | — | `/cancel` | `POST /oms/v3/hotel/cancel-booking` |
| — | — | `/static-detail/:hid` | `GET /hms/v3/hotel/static-detail` |
| — | — | `/cities` | `POST /hms/v3/hotel/static-cities` |
| — | — | `/nationalities` | `GET /hms/v3/hotel/nationalities` |
| — | — | `/account/balance` | `GET /hms/v3/account/balance` |

### Booking Flow Changed

**Old (2022):**
```
search → search/results → detail → review → book → booking-detail
```

**New (v3.0):**
```
search (+ cities lookup first)
  ↓
pricing (separate call)
  ↓
review (locks price, returns reviewId)
  ↓
book (uses reviewId, not hotelId)
  ↓
booking-detail / cancel / static-detail
```

### Field Names (Examples)

| Old | New |
|-----|-----|
| `checkInDate` | `checkIn` |
| `checkOutDate` | `checkOut` |
| `roomInfo[]` | `rooms[]` |
| `id` (hotel) | `tjHotelId` |
| `optionId` | `optionId` (same) |
| `fN` / `lN` | `fName` / `lName` |
| `pt` (type) | `type` |
| `deliveryInfo` | `contactInfo` |
| `bookingId` from route | `reviewId` from review step |
| No PNR | `pnr` in booking response |
| No refund data | `refundAmount` in cancel response |

---

## Files Modified/Created

**Modified:**
1. `docs/superpowers/specs/2026-04-14-sprint04-tripjack-design.md` — Updated for v3.0

**Created:**
1. `docs/superpowers/plans/2026-04-14-sprint04-tripjack-v3-implementation.md` — New plan (11 tasks, v3.0)
2. `SPRINT_04_V3_REVISION_SUMMARY.md` — This file

**Will be Created (during implementation):**
1. `db/migrations/tenant/004_tripjack_bookings.sql`
2. `packages/auth-bff/src/services/gemini.client.ts`
3. `packages/auth-bff/src/services/tripjack/hotel.interface.ts`
4. `packages/auth-bff/src/schemas/tripjack.schema.ts`
5. `packages/auth-bff/src/services/tripjack/stub-hotel.service.ts`
6. `packages/auth-bff/src/services/tripjack/real-hotel.service.ts`
7. `packages/auth-bff/src/services/tripjack/hotel.service.factory.ts`
8. `packages/auth-bff/src/routes/tripjack.routes.ts`
9. `test-tripjack-routes.js` (25 tests)

**Modified (during implementation):**
1. `packages/auth-bff/src/app.ts` — Mount tripjackRoutes
2. `README_FULL.md` — Append v3.0 endpoint table

---

## Next Steps

### Option 1: Subagent-Driven (Recommended)
- Dispatch subagents to handle 2-3 tasks per batch
- Review between batches
- Fast parallel execution

### Option 2: Inline Execution
- Execute tasks sequentially in this session
- Full visibility and control
- Slower but allows for interactive adjustments

---

## Critical Decisions (Made)

1. ✅ **Use v3.0 API** — Not 2022 samples or custom hybrid
2. ✅ **Interface-based swap** — StubHotelService vs. RealHotelService via factory
3. ✅ **Gemini only for stub** — Real service uses axios + TripJack v3.0 endpoints
4. ✅ **All 10 endpoints** — Including cancel, cities, nationalities, account-balance, static-detail
5. ✅ **25 tests** — Comprehensive v3.0 flow testing
6. ✅ **No breaking changes to auth layer** — JWT + middleware untouched (Sprint 01–03 pattern)

---

## Commits Created

```
4bbfff2 [SPRINT-04] docs: revise design spec for TripJack API v3.0 (10 endpoints, new flow)
99d9f40 [SPRINT-04] plan: implementation plan for TripJack v3.0 API (10 endpoints, 11 tasks)
```

---

## Ready to Execute

Both design and plan are **complete and committed**. 

**Choose execution approach and proceed to implementation.**

