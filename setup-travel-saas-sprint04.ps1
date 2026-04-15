# ==============================================================================
# setup-travel-saas-sprint04.ps1
# Project bootstrap for Travel SaaS Sprint 04 - TripJack Hotel Integration
# Run from D:\vaikunta-ekadashi\Components\saas-auth
# Owner: Srinivas / Fidelitus Corp
# ==============================================================================

$PROJECT_NAME = "travel-saas-sprint04"
$PROJECT_ROOT = "D:\vaikunta-ekadashi\Components\saas-auth"

Write-Host ""
Write-Host "Travel SaaS - Sprint 04 TripJack Hotel Integration BOOTSTRAP" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $PROJECT_ROOT)) {
    Write-Host "X Project root not found: $PROJECT_ROOT" -ForegroundColor Red
    exit 1
}
Set-Location $PROJECT_ROOT
Write-Host "OK Project root found." -ForegroundColor Green

# ── 1. Add sprint folders ──────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ 1/6 ] Adding sprint folders..." -ForegroundColor Yellow

$newFolders = @(
    "packages\auth-bff\src\services\tripjack",
    "packages\auth-bff\src\schemas",
    "packages\auth-bff\src\routes",
    "db\migrations\tenant",
    "docs\superpowers\specs",
    ".claude\skills"
)
foreach ($f in $newFolders) {
    $path = Join-Path $PROJECT_ROOT $f
    if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Path $path | Out-Null
        Write-Host "  OK $f" -ForegroundColor Green
    } else {
        Write-Host "  . $f (exists)" -ForegroundColor DarkGray
    }
}

# ── 2. Update CLAUDE.md ────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ 2/6 ] Updating CLAUDE.md for Sprint 04..." -ForegroundColor Yellow

$claudeLines = @(
    "# CLAUDE.md - Travel SaaS Sprint 04 - TripJack Hotel Integration",
    "# Extends ~/.claude/CLAUDE.md. Global rules always apply.",
    "# THIS IS AN EXTENSION - do not touch Sprint 01/02/03 code.",
    "",
    "## 0. Prime Directive",
    "Sprints 01, 02, 03 (auth, tenant onboarding, admin/operator routes, client module) are DONE.",
    "This sprint adds TripJack Hotel integration only. Do NOT touch existing auth or client code.",
    "",
    "BEFORE touching any file:",
    "  1. Read CHECKPOINT_06.md to understand current state",
    "  2. State what you plan to do",
    "  3. Present plan - wait for human approval",
    "  4. Then make changes",
    "",
    "## 1. Current Sprint: 04 - TripJack Hotel Integration (v3.0 API)",
    "",
    "Deliverables in order (11 tasks):",
    "  1. db/migrations/tenant/004_tripjack_bookings.sql - v3.0 bookings table + RLS",
    "  2. packages/auth-bff/src/services/gemini.client.ts - Gemini Flash wrapper",
    "  3. packages/auth-bff/src/services/tripjack/hotel.interface.ts + tripjack.schema.ts - v3.0 types",
    "  4. packages/auth-bff/src/services/tripjack/stub-hotel.service.ts - Gemini stub (v3.0 shapes)",
    "  5. packages/auth-bff/src/services/tripjack/real-hotel.service.ts - v3.0 HTTP calls (axios)",
    "  6. packages/auth-bff/src/services/tripjack/hotel.service.factory.ts - factory + env switch",
    "  7. packages/auth-bff/src/routes/tripjack.routes.ts - 10 v3.0 routes",
    "  8. packages/auth-bff/src/app.ts - mount tripjackRoutes (additive only)",
    "  9. test-tripjack-routes.js - 25-test v3.0 suite",
    " 10. README_FULL.md - append Sprint 04 v3.0 endpoint table",
    " 11. Final verification - Docker, migration, tests",
    "",
    "## 2. Stack",
    "  Runtime        : Node.js + TypeScript",
    "  ORM            : Prisma (raw SQL for tenant schema switching)",
    "  Database       : PostgreSQL with Row-Level Security (RLS)",
    "  Auth           : RS256 JWT, HttpOnly cookies",
    "  Validation     : Zod schemas for ALL request bodies",
    "  LLM (stub)     : @google/generative-ai (gemini-2.0-flash)",
    "  HTTP (prod)    : axios -> api.tripjack.com",
    "  Container      : Docker + docker-compose",
    "  Repo           : https://github.com/katharguppe/components",
    "",
    "## 3. Critical Rules",
    "  - Reuse existing middleware: requireAuth, requireTenant, requireRole",
    "  - SET search_path = tenant_schema for ALL tenant DB operations",
    "  - RLS policies on tripjack_bookings table",
    "  - IHotelService interface is the ONLY swap boundary between stub and prod",
    "  - Routes import ONLY via hotel.service.factory - never StubHotelService directly",
    "  - TRIPJACK_MODE is read ONCE at startup, not per request",
    "  - Gemini errors must NOT crash the booking flow - fallback to minimal fixture",
    "  - bookingId generated in route layer (TJS + 12 random digits), not in service",
    "  - Audit log entry for POST /book mutation",
    "  - All timestamps in UTC",
    "  - Output CHECKPOINT_06.md FIRST - ask before proceeding past the plan",
    "  - After each file: run existing test harness, confirm no regressions",
    "",
    "## 4. .env Additions Required",
    "  TRIPJACK_MODE=stub              # stub | production",
    "  TRIPJACK_API_KEY=               # empty until real credentials arrive",
    "  TRIPJACK_BASE_URL=https://api.tripjack.com",
    "  GEMINI_API_KEY=your-key-here",
    "  GEMINI_MODEL=gemini-2.0-flash",
    "",
    "## 5. API Base (v3.0)",
    "  BFF prefix: /api/v1/tripjack/hotels",
    "  TripJack upstream: /hms/v3/hotel/, /oms/v3/hotel/ at api.tripjack.com",
    "  Tenant scope: resolved from JWT claim + X-Tenant-Slug header",
    "  Auth chain: requireAuth -> requireTenant -> requireRole('admin','operator')",
    "  Upstream auth: apikey header to TripJack API v3.0",
    "",
    "## 6. Module Boundaries",
    "  Session -> audit        : read CHECKPOINT_05.md + existing routes, NO changes",
    "  Session -> migration    : db/migrations/tenant/004_tripjack_bookings.sql ONLY",
    "  Session -> gemini       : services/gemini.client.ts ONLY",
    "  Session -> interface    : services/tripjack/hotel.interface.ts + schemas/tripjack.schema.ts",
    "  Session -> stub         : services/tripjack/stub-hotel.service.ts ONLY",
    "  Session -> real         : services/tripjack/real-hotel.service.ts + hotel.service.factory.ts",
    "  Session -> routes       : routes/tripjack.routes.ts + app.ts mount ONLY",
    "  Session -> tests        : test-tripjack-routes.js ONLY",
    "  Session -> debug        : one error + one file per session",
    "",
    "## 7. Existing Files to Preserve",
    "  CHECKPOINT_01.md through 05.md - do NOT modify",
    "  packages/auth-bff/src/routes/client.routes.ts - untouched",
    "  packages/auth-bff/src/routes/group.routes.ts - untouched",
    "  packages/auth-bff/src/routes/admin.routes.ts - untouched",
    "  packages/auth-bff/src/routes/operator.routes.ts - untouched",
    "  test-admin-routes.js, test-operator-routes.js, test-client-routes.js - untouched",
    "",
    "## 8. Stub State Machine (v3.0)",
    "  searchStore: Map<searchId, { hotels: HotelOption[], query, createdAt }>",
    "  pricingStore: Map<`${searchId}:${tjHotelId}`, { options: PricingOption[], createdAt }>",
    "  reviewStore: Map<optionId, { reviewId, searchId, priceChanged, createdAt }>",
    "  bookingStore: Map<bookingId, { status, pnr, travellers, createdAt }>",
    "  Gemini called exactly TWICE per full flow:",
    "    1. POST /search -> generates 5 hotels (v3.0 format) -> cached in searchStore",
    "    2. POST /book -> generates confirmation -> cached in bookingStore + DB",
    "  All other endpoints (pricing, review, cancel, detail, cities, etc.) derive from Maps or hardcoded.",
    "",
    "## 9. Git Format",
    "  [SPRINT-04] add|fix|refactor|docs|test: what changed",
    "  [SPRINT-04] checkpoint: step name - verified"
)
$claudeLines | Set-Content "$PROJECT_ROOT\CLAUDE.md" -Encoding UTF8
Write-Host "  OK CLAUDE.md updated for Sprint 04." -ForegroundColor Green

# ── 3. TOOLS.md ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ 3/6 ] Writing TOOLS.md..." -ForegroundColor Yellow

$toolsLines = @(
    "# TOOLS.md - Travel SaaS Sprint 04",
    "",
    "## Claude Code Plugins",
    "  superpowers      : start any new deliverable",
    "  context7         : @google/generative-ai, Prisma, Zod, Express, axios APIs",
    "  code-simplifier  : after routes pass tests",
    "",
    "## MCP Servers",
    "  filesystem           : read existing files without pasting",
    "  memory               : persist decisions, schema choices",
    "  sequential-thinking  : stub state machine design, interface planning",
    "",
    "## Session Launcher",
    "  .\travel-saas-sprint04-sessions.ps1 -Session list",
    "  .\travel-saas-sprint04-sessions.ps1 -Session audit  <- START HERE",
    "",
    "## Key Commands",
    "  docker-compose up -d                  Start all services",
    "  docker-compose logs auth-bff -f       Watch BFF logs",
    "  node test-tripjack-routes.js          Run TripJack test suite",
    "  node test-client-routes.js            Run client tests (regression check)",
    "  node test-admin-routes.js             Run admin tests (regression check)",
    "",
    "## Environment",
    "  TRIPJACK_MODE=stub          # stub | production",
    "  GEMINI_API_KEY=...          # required for stub mode",
    "  GEMINI_MODEL=gemini-2.0-flash",
    "",
    "## Key Libraries (use context7 for all)",
    "  @google/generative-ai : Gemini Flash SDK",
    "  @prisma/client        : DB access + raw SQL for tenant schema",
    "  zod                   : request/response validation",
    "  express               : routing",
    "  axios                 : HTTP client for RealHotelService (prod)",
    "  jsonwebtoken          : JWT decode for tenant_schema claim",
    "",
    "## Design Spec",
    "  docs/superpowers/specs/2026-04-14-sprint04-tripjack-design.md"
)
$toolsLines | Set-Content "$PROJECT_ROOT\TOOLS.md" -Encoding UTF8
Write-Host "  OK TOOLS.md written." -ForegroundColor Green

# ── 4. Skills ─────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ 4/6 ] Writing skills..." -ForegroundColor Yellow

$taskCreateLines = @(
    "# Skill: task-create",
    "# Command: task-create",
    "# Creates a new TASK-XXX.md in /tasks/ with PDCA template.",
    "",
    "## Steps",
    "1. Ask: task title and which sprint deliverable (1-12)?",
    "2. List tasks/ to find next number.",
    "3. Create tasks/TASK-XXX-slug.md with PDCA template.",
    "4. Create git branch: feature/SPRINT-04-slug",
    "5. Report file path + branch name."
)
$taskCreateLines | Set-Content "$PROJECT_ROOT\.claude\skills\task-create.md" -Encoding UTF8
Write-Host "  OK task-create skill written." -ForegroundColor Green

# ── 5. .mcp.json ──────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ 5/6 ] Writing .mcp.json..." -ForegroundColor Yellow

$npmGlobalRoot = (npm root -g 2>$null).Trim()
$mcpLines = @(
    "{",
    "  ""mcpServers"": {",
    "    ""filesystem"": { ""command"": ""node"", ""args"": [""$npmGlobalRoot\\@modelcontextprotocol\\server-filesystem\\dist\\index.js"", ""$PROJECT_ROOT""] },",
    "    ""memory"": { ""command"": ""node"", ""args"": [""$npmGlobalRoot\\@modelcontextprotocol\\server-memory\\dist\\index.js""] },",
    "    ""sequential-thinking"": { ""command"": ""node"", ""args"": [""$npmGlobalRoot\\@modelcontextprotocol\\server-sequential-thinking\\dist\\index.js""] }",
    "  }",
    "}"
)
$mcpLines | Set-Content "$PROJECT_ROOT\.mcp.json" -Encoding UTF8
Write-Host "  OK .mcp.json written." -ForegroundColor Green

# ── 6. .env additions reminder ────────────────────────────────────────────────
Write-Host ""
Write-Host "[ 6/6 ] Checking .env for Sprint 04 additions..." -ForegroundColor Yellow

$envPath = "$PROJECT_ROOT\packages\auth-bff\.env"
if (Test-Path $envPath) {
    $envContent = Get-Content $envPath -Raw
    $needsUpdate = $false

    if ($envContent -notmatch "TRIPJACK_MODE") {
        $additions = @(
            "",
            "# -- Sprint 04: TripJack Hotel Integration ----------------------------------------",
            "TRIPJACK_MODE=stub",
            "TRIPJACK_API_KEY=",
            "TRIPJACK_BASE_URL=https://api.tripjack.com",
            "GEMINI_API_KEY=",
            "GEMINI_MODEL=gemini-2.0-flash"
        )
        Add-Content -Path $envPath -Value ($additions -join "`n") -Encoding UTF8
        Write-Host "  OK Sprint 04 env vars appended to $envPath" -ForegroundColor Green
        $needsUpdate = $true
    } else {
        Write-Host "  . TRIPJACK_MODE already present in .env -- skipping." -ForegroundColor DarkGray
    }
} else {
    Write-Host "  ! .env not found at $envPath" -ForegroundColor Yellow
    Write-Host "  ! Add these manually to your auth-bff .env file:" -ForegroundColor Yellow
    Write-Host "      TRIPJACK_MODE=stub" -ForegroundColor White
    Write-Host "      TRIPJACK_API_KEY=" -ForegroundColor White
    Write-Host "      TRIPJACK_BASE_URL=https://api.tripjack.com" -ForegroundColor White
    Write-Host "      GEMINI_API_KEY=<your-gemini-key>" -ForegroundColor White
    Write-Host "      GEMINI_MODEL=gemini-2.0-flash" -ForegroundColor White
}

Write-Host ""
Write-Host "=================================================" -ForegroundColor Green
Write-Host "  OK Sprint 04 bootstrap complete." -ForegroundColor Green
Write-Host ""
Write-Host "  IMPORTANT: Add your GEMINI_API_KEY to packages/auth-bff/.env" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Yellow
Write-Host "  1. Add GEMINI_API_KEY to packages/auth-bff/.env" -ForegroundColor Cyan
Write-Host "  2. .\travel-saas-sprint04-sessions.ps1 -Session audit" -ForegroundColor Cyan
Write-Host "  3. Inside Claude Code: read CHECKPOINT_05.md first" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Green
