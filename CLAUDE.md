# CLAUDE.md - Travel SaaS Sprint 04 - TripJack Hotel Integration
# Extends ~/.claude/CLAUDE.md. Global rules always apply.
# THIS IS AN EXTENSION - do not touch Sprint 01/02/03 code.

## 0. Prime Directive
Sprints 01, 02, 03 (auth, tenant onboarding, admin/operator routes, client module) are DONE.
This sprint adds TripJack Hotel integration only. Do NOT touch existing auth or client code.

BEFORE touching any file:
  1. Read CHECKPOINT_06.md to understand current state
  2. State what you plan to do
  3. Present plan - wait for human approval
  4. Then make changes

## 1. Current Sprint: 04 - TripJack Hotel Integration (v3.0 API)

Deliverables in order (11 tasks):
  1. db/migrations/tenant/004_tripjack_bookings.sql - v3.0 bookings table + RLS
  2. packages/auth-bff/src/services/gemini.client.ts - Gemini Flash wrapper
  3. packages/auth-bff/src/services/tripjack/hotel.interface.ts + tripjack.schema.ts - v3.0 types
  4. packages/auth-bff/src/services/tripjack/stub-hotel.service.ts - Gemini stub (v3.0 shapes)
  5. packages/auth-bff/src/services/tripjack/real-hotel.service.ts - v3.0 HTTP calls (axios)
  6. packages/auth-bff/src/services/tripjack/hotel.service.factory.ts - factory + env switch
  7. packages/auth-bff/src/routes/tripjack.routes.ts - 10 v3.0 routes
  8. packages/auth-bff/src/app.ts - mount tripjackRoutes (additive only)
  9. test-tripjack-routes.js - 25-test v3.0 suite
 10. README_FULL.md - append Sprint 04 v3.0 endpoint table
 11. Final verification - Docker, migration, tests

## 2. Stack
  Runtime        : Node.js + TypeScript
  ORM            : Prisma (raw SQL for tenant schema switching)
  Database       : PostgreSQL with Row-Level Security (RLS)
  Auth           : RS256 JWT, HttpOnly cookies
  Validation     : Zod schemas for ALL request bodies
  LLM (stub)     : @google/generative-ai (gemini-2.0-flash)
  HTTP (prod)    : axios -> api.tripjack.com
  Container      : Docker + docker-compose
  Repo           : https://github.com/katharguppe/components

## 3. Critical Rules
  - Reuse existing middleware: requireAuth, requireTenant, requireRole
  - SET search_path = tenant_schema for ALL tenant DB operations
  - RLS policies on tripjack_bookings table
  - IHotelService interface is the ONLY swap boundary between stub and prod
  - Routes import ONLY via hotel.service.factory - never StubHotelService directly
  - TRIPJACK_MODE is read ONCE at startup, not per request
  - Gemini errors must NOT crash the booking flow - fallback to minimal fixture
  - bookingId generated in route layer (TJS + 12 random digits), not in service
  - Audit log entry for POST /book mutation
  - All timestamps in UTC
  - Output CHECKPOINT_06.md FIRST - ask before proceeding past the plan
  - After each file: run existing test harness, confirm no regressions

## 4. .env Additions Required
  TRIPJACK_MODE=stub              # stub | production
  TRIPJACK_API_KEY=               # empty until real credentials arrive
  TRIPJACK_BASE_URL=https://api.tripjack.com
  GEMINI_API_KEY=your-key-here
  GEMINI_MODEL=gemini-2.0-flash

## 5. API Base (v3.0)
  BFF prefix: /api/v1/tripjack/hotels
  TripJack upstream: /hms/v3/hotel/, /oms/v3/hotel/ at api.tripjack.com
  Tenant scope: resolved from JWT claim + X-Tenant-Slug header
  Auth chain: requireAuth -> requireTenant -> requireRole('admin','operator')
  Upstream auth: apikey header to TripJack API v3.0

## 6. Module Boundaries
  Session -> audit        : read CHECKPOINT_05.md + existing routes, NO changes
  Session -> migration    : db/migrations/tenant/004_tripjack_bookings.sql ONLY
  Session -> gemini       : services/gemini.client.ts ONLY
  Session -> interface    : services/tripjack/hotel.interface.ts + schemas/tripjack.schema.ts
  Session -> stub         : services/tripjack/stub-hotel.service.ts ONLY
  Session -> real         : services/tripjack/real-hotel.service.ts + hotel.service.factory.ts
  Session -> routes       : routes/tripjack.routes.ts + app.ts mount ONLY
  Session -> tests        : test-tripjack-routes.js ONLY
  Session -> debug        : one error + one file per session

## 7. Existing Files to Preserve
  CHECKPOINT_01.md through 05.md - do NOT modify
  packages/auth-bff/src/routes/client.routes.ts - untouched
  packages/auth-bff/src/routes/group.routes.ts - untouched
  packages/auth-bff/src/routes/admin.routes.ts - untouched
  packages/auth-bff/src/routes/operator.routes.ts - untouched
  test-admin-routes.js, test-operator-routes.js, test-client-routes.js - untouched

## 8. Stub State Machine (v3.0)
  searchStore: Map<searchId, { hotels: HotelOption[], query, createdAt }>
  pricingStore: Map<${searchId}:, { options: PricingOption[], createdAt }>
  reviewStore: Map<optionId, { reviewId, searchId, priceChanged, createdAt }>
  bookingStore: Map<bookingId, { status, pnr, travellers, createdAt }>
  Gemini called exactly TWICE per full flow:
    1. POST /search -> generates 5 hotels (v3.0 format) -> cached in searchStore
    2. POST /book -> generates confirmation -> cached in bookingStore + DB
  All other endpoints (pricing, review, cancel, detail, cities, etc.) derive from Maps or hardcoded.

## 9. Git Format
  [SPRINT-04] add|fix|refactor|docs|test: what changed
  [SPRINT-04] checkpoint: step name - verified
