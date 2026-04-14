# ==============================================================================
# travel-saas-sprint04-sessions.ps1
# Session launcher for Travel SaaS Sprint 04 - TripJack Hotel Integration
# Owner: Srinivas / Fidelitus Corp
# Run from D:\vaikunta-ekadashi\Components\saas-auth
#
# Usage:
#   .\travel-saas-sprint04-sessions.ps1 -Session list
#   .\travel-saas-sprint04-sessions.ps1 -Session audit     <- START HERE
#   .\travel-saas-sprint04-sessions.ps1 -Session migration
#   .\travel-saas-sprint04-sessions.ps1 -Session gemini
#   .\travel-saas-sprint04-sessions.ps1 -Session interface
#   .\travel-saas-sprint04-sessions.ps1 -Session stub
#   .\travel-saas-sprint04-sessions.ps1 -Session real
#   .\travel-saas-sprint04-sessions.ps1 -Session routes
#   .\travel-saas-sprint04-sessions.ps1 -Session tests
#   .\travel-saas-sprint04-sessions.ps1 -Session debug
# ==============================================================================

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("audit","migration","gemini","interface","stub","real","routes","tests","debug","list")]
    [string]$Session
)

$PROJECT_ROOT = "D:\vaikunta-ekadashi\Components\saas-auth"
$HAIKU        = "claude-haiku-4-5-20251001"
$SONNET       = "claude-sonnet-4-6"

$sessions = @{

    audit = @{
        model = $SONNET
        task  = "SPRINT-04-AUDIT"
        label = "Session 0 - Audit Current State (START HERE)"
        prompt = @'
Stack: Node.js, TypeScript, Prisma, PostgreSQL RLS, Express, RS256 JWT, Docker
Project: Travel SaaS multi-tenant portal - Sprint 04 TripJack Hotel Integration
Repo: https://github.com/katharguppe/components

THIS IS AN AUDIT SESSION. DO NOT CHANGE ANY CODE.

Your job:
1. Read CHECKPOINT_05.md to understand Sprint 03 final state
2. Read packages/auth-bff/src/app.ts to see current route mounts
3. Read packages/auth-bff/src/routes/client.routes.ts for middleware patterns
4. Read docs/superpowers/specs/2026-04-14-sprint04-tripjack-design.md (the full design)
5. Read Trip Jack/Trip Jack/Sample Bookings/booking_2Rooms/ sample files to understand
   the exact TripJack request/response shapes
6. Produce audit report:
   - Sprint 03 completion status (what still needs doing: README + git commit)
   - Existing patterns to follow for Sprint 04
   - Risks or blockers before starting Sprint 04
   - Confirm understanding of the 7 hotel endpoints and stub state machine

Sprint 04 adds: TripJack Hotel API v3.0 integration (10 endpoints)
Base prefix: /api/v1/tripjack/hotels (BFF) ← /hms/v3/hotel/, /oms/v3/hotel/ (TripJack upstream)
Auth chain: requireAuth -> requireTenant -> requireRole('admin','operator')
Stub: Gemini Flash LLM + in-memory Maps (v3.0 response shapes), switchable via TRIPJACK_MODE env var
Real: axios HTTP calls to TripJack v3.0 API with API key auth

v3.0 API key differences from 2022 samples:
- Booking flow: search → pricing → review → book (NOT search/results/detail)
- Field names: tjHotelId (not id), checkIn (not checkinDate), reviewId (new)
- 10 endpoints: search, pricing, review, book, booking-detail, cancel, cities, nationalities, static-detail, account-balance
- Design + Plan already complete and committed. Proceed to implementation tasks.
'@
    }

    migration = @{
        model = $HAIKU
        task  = "SPRINT-04-001"
        label = "Session 1 - DB Migration SQL"
        prompt = @'
Stack: PostgreSQL, Row-Level Security (RLS), SQL
Task: db/migrations/tenant/004_tripjack_bookings.sql ONLY
Module scope: SQL migration file only. No TypeScript changes.

Key facts:
- Read db/migrations/tenant/003_client_module.sql FIRST - follow exact same pattern
- Table: tripjack_bookings in {schema} (tenant schema) - v3.0 schema
- Columns (v3.0 field names):
    booking_id    VARCHAR(30) PRIMARY KEY  -- TJ-HTL-xxxxx format (v3.0)
    search_id     VARCHAR(50)              -- SID-xxxxxxxxxx
    tj_hotel_id   VARCHAR(50)              -- TripJack hotel ID (not generic 'id')
    option_id     VARCHAR(50)              -- OPT-xxxxx
    review_id     VARCHAR(50)              -- REV-xxxxx (from review step)
    pnr           VARCHAR(20)              -- Booking reference (v3.0)
    tenant_id     UUID NOT NULL
    created_by    VARCHAR(15) NOT NULL     -- mobile_number FK to clients
    status        VARCHAR(30) NOT NULL DEFAULT 'CONFIRMED'  -- CONFIRMED, CANCELLED
    checkin_date  DATE NOT NULL
    checkout_date DATE NOT NULL
    total_amount  NUMERIC(12,2)
    currency      VARCHAR(3) DEFAULT 'INR'
    traveller_info  JSONB                 -- travellerInfo array (v3.0)
    contact_info    JSONB                 -- email, phone, code (v3.0 - was delivery_info)
    raw_response    JSONB                 -- full API response
    created_at    TIMESTAMPTZ DEFAULT NOW()
    updated_at    TIMESTAMPTZ DEFAULT NOW()
- RLS policy: tenant users see only their own bookings (same app.current_tenant_id pattern)
- updated_at trigger (same function as Sprint 03)
- GIN index on traveller_info for JSONB queries
- CREATE TABLE IF NOT EXISTS (idempotent)
- All IF NOT EXISTS guards on indexes + policies

PDCA: present SQL plan before writing any code.
'@
    }

    gemini = @{
        model = $HAIKU
        task  = "SPRINT-04-002"
        label = "Session 2 - Gemini Client Wrapper"
        prompt = @'
Stack: TypeScript, @google/generative-ai SDK
Task: packages/auth-bff/src/services/gemini.client.ts ONLY
Module scope: Gemini client wrapper only. No route or schema changes.

Key facts:
- Install @google/generative-ai if not already in package.json
- Use context7 to get current @google/generative-ai API (model init, generateContent)
- GeminiClient class with single public method:
    generateJson(prompt: string, systemInstruction: string): Promise<unknown>
- Reads GEMINI_API_KEY and GEMINI_MODEL from process.env
- GEMINI_MODEL defaults to "gemini-2.0-flash" if not set
- If GEMINI_API_KEY is missing, throws descriptive error: "GEMINI_API_KEY not set in .env"
- responseMimeType: "application/json" to ensure clean JSON output
- Wraps SDK errors in a GeminiError class with original message
- Export as singleton: export const geminiClient = new GeminiClient()

Context7: use for @google/generative-ai SDK current API.
PDCA: present design before writing.
'@
    }

    interface = @{
        model = $SONNET
        task  = "SPRINT-04-003"
        label = "Session 3 - Interface + Zod Schemas"
        prompt = @'
Stack: TypeScript, Zod
Task: TWO files in this session:
  1. packages/auth-bff/src/services/tripjack/hotel.interface.ts
  2. packages/auth-bff/src/schemas/tripjack.schema.ts
Module scope: interface types + Zod schemas only. No route or service changes.

hotel.interface.ts - IHotelService interface with 10 method signatures (v3.0):
  search(query: SearchQuery): Promise<{ searchId, hotels[] }>
  pricing(searchId, tjHotelId, checkIn, checkOut, rooms[]): Promise<{ options[] }>
  review(searchId, optionId): Promise<{ reviewId, priceChanged }>
  book(booking: BookingRequest): Promise<{ bookingId, pnr, bookingRef }>
  bookingDetail(bookingId): Promise<BookingDetail>
  cancel(bookingId, remark): Promise<{ cancellationId, refundAmount }>
  staticDetail(hid): Promise<{ hotelDetail }>
  cities(cityName): Promise<{ cities[] }>
  nationalities(): Promise<{ nationalities[] }>
  accountBalance(): Promise<{ balance, creditLimit, currency }>

Also export all v3.0 types:
  SearchQuery, HotelOption, PricingOption, BookingRequest, BookingDetail
  (All field names: tjHotelId not id, checkIn not checkinDate, contactInfo not deliveryInfo, etc.)

tripjack.schema.ts - Zod validation schemas for all 10 v3.0 route request bodies:
  SearchQuerySchema      - checkIn (YYYY-MM-DD), checkOut, rooms[], hids[], currency, nationality
  PricingQuerySchema     - searchId, tjHotelId, checkIn, checkOut, rooms[], currency
  ReviewQuerySchema      - searchId, optionId
  BookingRequestSchema   - reviewId (v3.0: uses reviewId not hotelId), travellerInfo[], contactInfo, paymentInfo
  BookingDetailSchema    - bookingId
  CancelQuerySchema      - bookingId, remark
  CitiesQuerySchema      - cityName
  (nationalities and accountBalance take no body params)

Key validation rules (v3.0):
  - checkIn / checkOut: ISO date string YYYY-MM-DD
  - rooms: adults 1+, children 0+, childAge[] optional
  - travellerInfo: title, fName, lName, type (ADULT|CHILD|INFANT)
  - contactInfo.email: valid email, contactInfo.phone: 10+ digits
  - hids: array of 1+ hotel IDs

Read packages/auth-bff/src/schemas/client.schema.ts first for patterns.
Context7: use for Zod z.object(), z.array(), z.string() current API.
PDCA: present interface + schema design before writing.
'@
    }

    stub = @{
        model = $SONNET
        task  = "SPRINT-04-004"
        label = "Session 4 - Stub Hotel Service"
        prompt = @'
Stack: TypeScript, @google/generative-ai, in-memory Map
Task: packages/auth-bff/src/services/tripjack/stub-hotel.service.ts ONLY
Module scope: stub service only. No route changes.

Key facts:
- Read hotel.interface.ts FIRST - implement IHotelService exactly
- Read gemini.client.ts FIRST - use the exported singleton geminiClient
- Four private Maps (v3.0 state machine):
    searchStore: Map<string, { hotels: HotelOption[], query: SearchQuery, createdAt }>
    pricingStore: Map<string, { options: PricingOption[], createdAt }>
    reviewStore: Map<string, { reviewId, searchId, priceChanged, createdAt }>
    bookingStore: Map<string, { status, pnr, travellers, createdAt }>

- search(query): generates searchId (SID-xxxxx format v3.0), calls Gemini to generate
  5 realistic Indian hotels in v3.0 format (tjHotelId, name, rt, option.optionId, price.totalPrice).
  On Gemini error: return hardcoded fallback hotel. Cache in searchStore.
  Returns { searchId, hotels[] } - hotels inline (not separate call).

- pricing(searchId, tjHotelId, checkIn, checkOut, rooms[]): looks up searchStore hotel,
  generates pricing options with cancellation policy. On Gemini error: hardcoded fallback.
  Cache in pricingStore. Returns { options[] }.

- review(searchId, optionId): looks up searchStore, generates reviewId (REV-xxxxx),
  stores review state. Returns { reviewId, priceChanged: false }.

- book(booking: BookingRequest): uses reviewId (not hotelId + optionId).
  Calls Gemini to generate booking confirmation with TJ-HTL prefix.
  Generates PNR. On Gemini error: return minimal booking. Cache in bookingStore.
  Returns { bookingId, pnr, bookingRef }.

- bookingDetail(bookingId): looks up bookingStore first, then DB.
  Returns full BookingDetail with status, itinerary, voucherUrl.

- cancel(bookingId, remark): marks in bookingStore as CANCELLED, returns cancellationId + refundAmount.

- staticDetail(hid): returns hardcoded hotel detail (amenities, address, images).

- cities(cityName): returns filtered list of cities (hardcoded fixture).

- nationalities(): returns list of countries with IDs.

- accountBalance(): returns dummy balance, creditLimit, currency.

Error handling: all 404s throw { status: 404, message: '...' } shape.

Read test-client-routes.js for how services are tested end-to-end.
Context7: use for @google/generative-ai SDK generateContent API.
PDCA: read hotel.interface.ts and gemini.client.ts first. Present design before writing.
'@
    }

    real = @{
        model = $HAIKU
        task  = "SPRINT-04-005"
        label = "Session 5 - Real Service Skeleton + Factory"
        prompt = @'
Stack: TypeScript, axios
Task: TWO files in this session:
  1. packages/auth-bff/src/services/tripjack/real-hotel.service.ts
  2. packages/auth-bff/src/services/tripjack/hotel.service.factory.ts
Module scope: skeleton + factory only. No route changes.

real-hotel.service.ts (v3.0 - Full implementation):
- Implements IHotelService (read hotel.interface.ts FIRST)
- Constructor: creates axios instance with TRIPJACK_BASE_URL, sets apikey header to TRIPJACK_API_KEY
- Each method makes HTTP call to TripJack v3.0 endpoint:
  * search() → POST /hms/v3/hotel/listing
  * pricing() → POST /hms/v3/hotel/pricing
  * review() → POST /hms/v3/hotel/review
  * book() → POST /hms/v3/hotel/book
  * bookingDetail() → POST /oms/v3/hotel/booking-details
  * cancel() → POST /oms/v3/hotel/cancel-booking
  * staticDetail() → GET /hms/v3/hotel/static-detail?hid={hid}
  * cities() → POST /hms/v3/hotel/static-cities
  * nationalities() → GET /hms/v3/hotel/nationalities
  * accountBalance() → GET /hms/v3/account/balance
- Error handling: throw descriptive errors with status codes (4xx client, 5xx server)
- Export class RealHotelService

hotel.service.factory.ts:
- Reads TRIPJACK_MODE from process.env at module load time
- createHotelService(): IHotelService
  if TRIPJACK_MODE === 'production' → return new RealHotelService()
  else (default) → return new StubHotelService()
  (Fallback: if production mode but TRIPJACK_API_KEY not set, log warning + use stub)
- Export createHotelService() + getHotelService()
- Export singleton created at startup
- Log: "[TripJack] Hotel service: production mode (v3.0)" or "[TripJack] Hotel service: stub mode (Gemini, v3.0)"

Context7: use for TypeScript class patterns.
PDCA: present design before writing.
'@
    }

    routes = @{
        model = $SONNET
        task  = "SPRINT-04-006"
        label = "Session 6 - Routes + app.ts mount"
        prompt = @'
Stack: TypeScript, Express, Prisma, PostgreSQL RLS
Task: TWO files in this session:
  1. packages/auth-bff/src/routes/tripjack.routes.ts
  2. packages/auth-bff/src/app.ts (additive mount only)
Module scope: routes + app.ts ONLY. No service or schema changes.

tripjack.routes.ts - 10 Express routes (v3.0):
  POST /search               -> hotelService.search(query)
  POST /pricing              -> hotelService.pricing(searchId, tjHotelId, checkIn, checkOut, rooms)
  POST /review               -> hotelService.review(searchId, optionId)
  POST /book                 -> hotelService.book(reviewId, travellerInfo, contactInfo, paymentInfo)
  POST /booking-detail       -> hotelService.bookingDetail(bookingId)
  POST /cancel               -> hotelService.cancel(bookingId, remark)
  GET /static-detail/:hid    -> hotelService.staticDetail(hid)
  POST /cities               -> hotelService.cities(cityName)
  GET /nationalities         -> hotelService.nationalities()
  GET /account/balance       -> hotelService.accountBalance()

Key facts (v3.0):
- Import hotelService from hotel.service.factory (the singleton)
- Import all Zod schemas from tripjack.schema.ts - validate every request body (v3.0 fields)
- Middleware chain: requireAuth -> requireTenant -> requireRole('admin','operator')
- v3.0 booking flow: search → pricing → review → book (reviewId-based, not hotelId)
- DB INSERT into tripjack_bookings after successful /book with v3.0 fields (tj_hotel_id, contact_info, pnr)
- SET search_path = req.tenantSchema before DB operations
- 404 errors from service layer -> pass through as 404 response
- 409 for duplicate bookingId or already-cancelled bookings
- Zod validation errors -> 400 with { error: 'Validation failed', details: [...] }
- All responses wrapped: { ...data, status: { success: bool, httpStatus: number } }

app.ts mount (read current app.ts first - additive only):
  import tripjackRoutes from './routes/tripjack.routes';
  app.use('/api/v1/tripjack/hotels', tripjackRoutes);
  // Mount AFTER existing routes (client, group, admin, operator)

Read packages/auth-bff/src/routes/client.routes.ts FIRST for middleware patterns.
Context7: use for Express Router and Prisma raw SQL APIs.
PDCA: read client.routes.ts and current app.ts first. Present plan before writing.
'@
    }

    tests = @{
        model = $SONNET
        task  = "SPRINT-04-007"
        label = "Session 7 - Test Suite"
        prompt = @'
Stack: Node.js, HTTP (vanilla http.request), JSON
Task: test-tripjack-routes.js ONLY
Module scope: test script only. No source changes.

Key facts (v3.0, 25 tests):
- Read test-client-routes.js FIRST - follow EXACT same pattern
- Read test-admin-routes.js for additional reference
- 25 tests (2 setup + 23 named, v3.0 flow):

  setup01_login()        - store authToken
  setup02_getTenantId()  - store tenantId

  test01_search()               - POST /search (checkIn, checkOut, hids) -> searchId + hotels
  test02_searchMissingCheckIn() - POST /search missing checkIn -> 400
  test03_searchMissingHids()    - POST /search missing hids -> 400
  test04_pricing()              - POST /pricing (searchId, tjHotelId) -> options[]
  test05_pricingInvalidSearchId() - POST /pricing bad searchId -> 404
  test06_pricingInvalidHotelId()  - POST /pricing unknown tjHotelId -> 404
  test07_review()               - POST /review (searchId, optionId) -> reviewId + priceChanged
  test08_reviewInvalidSearchId()  - POST /review bad searchId -> 404
  test09_reviewInvalidOptionId()  - POST /review bad optionId -> 404
  test10_book()                 - POST /book (reviewId, travellerInfo, contactInfo) -> bookingId + pnr
  test11_bookDuplicate()        - POST /book same reviewId -> 409
  test12_bookMissingTravellers()- POST /book missing travellerInfo -> 400
  test13_bookInvalidEmail()     - POST /book invalid email -> 400
  test14_bookingDetail()        - POST /booking-detail (bookingId) -> booking + itinerary
  test15_bookingDetailUnknown() - POST /booking-detail unknown bookingId -> 404
  test16_cancel()               - POST /cancel (bookingId, remark) -> cancellationId + refundAmount
  test17_cancelAlreadyCancelled()- POST /cancel already-cancelled booking -> 400
  test18_staticDetail()         - GET /static-detail/:hid -> hotelDetail + amenities
  test19_staticDetailInvalid()  - GET /static-detail with unknown hid -> 404
  test20_cities()               - POST /cities (cityName) -> cities[] with cityCode
  test21_nationalities()        - GET /nationalities -> nationalities[] with countryId
  test22_accountBalance()       - GET /account/balance -> balance + creditLimit + currency
  test23_fullFlow()             - v3.0 flow: search -> pricing -> review -> book -> booking-detail (chain)
  test24_crossTenant()          - verify tenant isolation works
  test25_regressionClientTests()- run test-client-routes.js, assert 0 failures

- Store shared state: searchId, tjHotelId, optionId, reviewId, bookingId across tests
- Print PASS/FAIL per test with response status + key field
- Exit code 1 on any failure

PDCA: read test-client-routes.js FULLY before writing a single line.
'@
    }

    debug = @{
        model = $SONNET
        task  = "SPRINT-04-???"
        label = "Debug Session"
        prompt = @'
Stack: Node.js, TypeScript, Prisma, PostgreSQL, Express, Docker, @google/generative-ai
Task: Debugging - one error, one file, one session.

RULES:
  - Do NOT paste multiple files at once.
  - Paste: (1) full error/traceback, (2) ONLY the function that threw it.
  - State which file: migration / gemini.client / hotel.interface / tripjack.schema /
                      stub-hotel.service / real-hotel.service / hotel.service.factory /
                      tripjack.routes / app.ts / tests

Known gotchas for v3.0 stack:
  - Prisma raw SQL: always SET search_path = tenantSchema before queries
  - RLS: if query returns empty, check search_path is set (POST not GET)
  - @google/generative-ai: responseMimeType must be "application/json" for clean JSON output
  - Gemini response: always JSON.parse(response.text()) -- response.text() returns a string
  - searchId format: "SID-xxxxxxxxxx" (not old "hsid" format from 2022 samples)
  - tjHotelId: uses "100000000{n}" format (not generic 'id' field)
  - reviewId: NEW in v3.0, generated in review() and passed to book() -- critical for booking flow
  - optionId: "OPT-xxxxx" format in response, used in review() and pricing lookups
  - TRIPJACK_MODE: read at module load time in factory -- restart server after .env change
  - v3.0 field names: checkIn (not checkinDate), tjHotelId (not id), contactInfo (not deliveryInfo)
  - UUID columns: use $1::uuid cast if tenant_id is uuid type in raw SQL
  - JWT tenant_schema claim: req.tenantSchema set by requireTenant middleware
  - Gemini API key: check GEMINI_API_KEY in packages/auth-bff/.env (not root .env)
  - TripJack API key: check TRIPJACK_API_KEY in packages/auth-bff/.env for production mode

Paste error and function below:
'@
    }
}

# ── List ───────────────────────────────────────────────────────────────────────
if ($Session -eq "list") {
    Write-Host ""
    Write-Host "  Travel SaaS Sprint 04 - Available sessions" -ForegroundColor Cyan
    Write-Host ""
    $order = @("audit","migration","gemini","interface","stub","real","routes","tests","debug")
    foreach ($key in $order) {
        $s = $sessions[$key]
        $tag = if ($s.model -like "*haiku*") { "Haiku  [cheap]" } else { "Sonnet [smart]" }
        Write-Host ("  {0,-12} {1,-48} [{2}]" -f $key, $s.label, $tag)
    }
    Write-Host ""
    Write-Host "  START HERE: .\travel-saas-sprint04-sessions.ps1 -Session audit" -ForegroundColor Yellow
    Write-Host ""
    exit 0
}

# ── Launch ─────────────────────────────────────────────────────────────────────
$s = $sessions[$Session]

Write-Host ""
Write-Host "  +----------------------------------------------------------+" -ForegroundColor Cyan
Write-Host ("  |  {0,-56}|" -f $s.label) -ForegroundColor Cyan
Write-Host ("  |  Model : {0,-48}|" -f $s.model) -ForegroundColor Cyan
Write-Host ("  |  Task  : {0,-48}|" -f $s.task) -ForegroundColor Cyan
Write-Host "  +----------------------------------------------------------+" -ForegroundColor Cyan
Write-Host ""
Write-Host $s.prompt -ForegroundColor White
Write-Host ""

$s.prompt | Set-Clipboard
Write-Host "  OK Context template copied to clipboard." -ForegroundColor Green
Write-Host "  Tip: paste clipboard into Claude Code at session start" -ForegroundColor DarkGray
Write-Host ""

Set-Location $PROJECT_ROOT
$env:ANTHROPIC_MODEL = $s.model
claude --model $s.model
