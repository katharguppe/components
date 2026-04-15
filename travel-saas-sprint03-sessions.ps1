# ==============================================================================
# travel-saas-sprint03-sessions.ps1
# Session launcher for Travel SaaS Sprint 03 - Client Module
# Owner: Srinivas / Fidelitus Corp
# ==============================================================================

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("audit","migration","provisioner","schema","clientroutes","grouproutes","tests","debug","list")]
    [string]$Session
)

$PROJECT_ROOT = "D:\vaikunta-ekadashi\Components\saas-auth"
$HAIKU        = "claude-haiku-4-5-20251001"
$SONNET       = "claude-sonnet-4-6"

$sessions = @{

    audit = @{
        model = $SONNET
        task  = "SPRINT-03-AUDIT"
        label = "Session 0 - Audit Current State (START HERE)"
        prompt = @'
Stack: Node.js, TypeScript, Prisma, PostgreSQL RLS, Express, RS256 JWT, Docker
Project: Travel SaaS multi-tenant portal - Sprint 03 Client Module extension
Repo: https://github.com/katharguppe/components

THIS IS AN AUDIT SESSION. DO NOT CHANGE ANY CODE.

Your job:
1. Read CHECKPOINT_03.md to understand Sprint 01/02 current state
2. Read PHASE_2_COMPLETE.md and PHASE_3_COMPLETE.md
3. Read packages/auth-bff/src/routes/ to understand existing route patterns
4. Read test-admin-routes.js to understand test patterns
5. Read docker-compose.yml to understand service structure
6. Produce a brief audit report:
   - What is in place from Sprint 01/02
   - What patterns to follow for Sprint 03
   - Any risks or blockers you see before starting

Sprint 03 adds: clients, client_preferences, groups, group_members tables
Base prefix: /api/v1/clients
Auth chain: requireAuth -> requireTenant -> requireRole

Output CHECKPOINT_04.md FIRST with plan + ER diagram + API contract table.
Ask before proceeding past the plan.
PDCA: present findings before any code change is approved.
'@
    }

    migration = @{
        model = $HAIKU
        task  = "SPRINT-03-001"
        label = "Session 1 - DB Migration SQL"
        prompt = @'
Stack: PostgreSQL, Row-Level Security (RLS), SQL
Task: db/migrations/tenant/003_client_module.sql ONLY
Module scope: SQL migration file only. No TypeScript changes.

Key facts:
- Must open with: SET search_path = tenant_schema, public;
- 4 tables to create: clients, client_preferences, groups, group_members
- clients PK = mobile_number VARCHAR(15) E.164 format
- client_preferences: 1:1 with clients, CASCADE DELETE
- groups: UUID PK, group_code UNIQUE per tenant, leader_mobile FK to clients
- group_members: M:M junction, UNIQUE(group_id, mobile_number)
- RLS policies: tenant users may only CRU their own tenant clients
- Follow same RLS pattern as existing Sprint 01/02 migrations
- ENUMs: salutation, gender, travel_type, group_type, member role, member status
- JSONB columns: address, id_proofs, emergency_contact, hotel_preferences,
  air_preferences, rail_preferences, road_preferences, cruise_preferences,
  visa_passport, metadata
- GIN index on air_preferences for JSONB queries
- All timestamps TIMESTAMPTZ

Read existing migrations first to match pattern exactly.
PDCA: present SQL plan before writing any code.
'@
    }

    provisioner = @{
        model = $HAIKU
        task  = "SPRINT-03-002"
        label = "Session 2 - Tenant Provisioner"
        prompt = @'
Stack: TypeScript, Prisma raw SQL
Task: packages/auth-bff/src/db/tenant-provisioner.ts ONLY
Module scope: add enableClientModuleForTenant() function only.

Key facts:
- Read existing tenant-provisioner.ts first - follow exact same pattern
- Add: enableClientModuleForTenant(tenantId: string): Promise<void>
- Function runs 003_client_module.sql against the tenant schema
- Uses SET search_path = tenantId, public before running migration
- Called during tenant onboarding after existing provisioner calls
- Must be idempotent - safe to run multiple times (IF NOT EXISTS)
- Export the function alongside existing exports

PDCA: read existing file first, present plan before writing.
'@
    }

    schema = @{
        model = $SONNET
        task  = "SPRINT-03-003"
        label = "Session 3 - Zod Schemas"
        prompt = @'
Stack: TypeScript, Zod
Task: packages/auth-bff/src/schemas/client.schema.ts ONLY
Module scope: Zod validation schemas only. No route changes.

Key facts:
- Read existing schema files first to match patterns
- Schemas needed:
    CreateClientSchema - all client fields, mobile E.164 required
    UpdateClientSchema - partial of CreateClientSchema
    UpdatePreferencesSchema - all JSONB preference blocks
    CreateGroupSchema - name, group_type, purpose, leader_mobile, max_members
    UpdateGroupSchema - partial of CreateGroupSchema
    AddMemberSchema - mobile_number, role
    UpdateMemberSchema - role, status, notes
- E.164 mobile validation: regex /^\+[1-9]\d{7,14}$/
- JSONB fields validated with nested Zod objects
- Export all schemas + inferred TypeScript types
- Do NOT over-validate JSONB - keep it flexible

Context7: use for Zod z.object(), z.string(), z.enum() current API.
PDCA: present schema design before writing.
'@
    }

    clientroutes = @{
        model = $SONNET
        task  = "SPRINT-03-004"
        label = "Session 4 - Client Routes"
        prompt = @'
Stack: TypeScript, Express, Prisma, PostgreSQL RLS
Task: packages/auth-bff/src/routes/client.routes.ts ONLY
Module scope: client CRUD routes only. No group routes.

Endpoints to implement:
  POST   /api/v1/clients                    createClient + upsert preferences in same tx
  GET    /api/v1/clients                    listClients (paginated, filter: tags, city, travel_type, is_active)
  GET    /api/v1/clients/:mobile            getClient with preferences
  PATCH  /api/v1/clients/:mobile            updateClient
  PATCH  /api/v1/clients/:mobile/preferences updatePreferences
  DELETE /api/v1/clients/:mobile            softDelete (is_active = false)

Key facts:
- Reuse existing middleware: requireAuth, requireTenant, requireRole
- SET search_path = req.tenantSchema before every DB operation
- Zod validate all request bodies using client.schema.ts
- Audit log entry for every mutation (reuse existing audit service)
- Paginated list: default page=1, limit=20, max limit=100
- E.164 validation on mobile_number param

Read test-admin-routes.js and existing routes for patterns.
Context7: use for Prisma raw SQL and Express router APIs.
PDCA: read existing route files first. Present plan before writing.
'@
    }

    grouproutes = @{
        model = $SONNET
        task  = "SPRINT-03-005"
        label = "Session 5 - Group Routes"
        prompt = @'
Stack: TypeScript, Express, Prisma, nanoid
Task: packages/auth-bff/src/routes/group.routes.ts ONLY
Module scope: group and group_members routes only.

Endpoints to implement:
  POST   /api/v1/clients/groups              createGroup
  GET    /api/v1/clients/groups              listGroups with member count
  GET    /api/v1/clients/groups/:id          getGroup with members + preference summary
  PATCH  /api/v1/clients/groups/:id          updateGroup
  POST   /api/v1/clients/groups/:id/members  addMember
  PATCH  /api/v1/clients/groups/:id/members/:mobile  updateMemberRole/status
  DELETE /api/v1/clients/groups/:id/members/:mobile  removeMember

Key facts:
- group_code: auto-generate as kebab-slug from name + 4-char nanoid suffix
  Example: "char-dham-yatra-a3f9"
- Reuse existing middleware: requireAuth, requireTenant, requireRole
- SET search_path = req.tenantSchema before every DB operation
- Audit log for every mutation
- getGroup returns members with their client preferences summary

Context7: use for nanoid and Prisma raw SQL APIs.
PDCA: read client.routes.ts first for patterns. Present plan before writing.
'@
    }

    tests = @{
        model = $SONNET
        task  = "SPRINT-03-006"
        label = "Session 6 - Test Suite"
        prompt = @'
Stack: Node.js, HTTP (node-fetch or axios), JSON
Task: test-client-routes.js ONLY
Module scope: test script only. No source changes.

Key facts:
- Read test-admin-routes.js FIRST - follow exact same pattern
- Read test-operator-routes.js for additional patterns
- Tests to cover:
    POST /clients - create client happy path
    POST /clients - duplicate mobile rejection
    GET  /clients - list with pagination
    GET  /clients/:mobile - get with preferences
    PATCH /clients/:mobile - update fields
    PATCH /clients/:mobile/preferences - update preferences
    DELETE /clients/:mobile - soft delete
    POST /clients/groups - create group
    GET  /clients/groups - list groups
    POST /clients/groups/:id/members - add member
    PATCH /clients/groups/:id/members/:mobile - update member status
    DELETE /clients/groups/:id/members/:mobile - remove member
- Use existing test credentials from login.json or test-login.json
- Print PASS/FAIL per test with response summary
- Run existing admin + operator tests at end to confirm no regressions

PDCA: read test-admin-routes.js fully before writing a single line.
'@
    }

    debug = @{
        model = $SONNET
        task  = "SPRINT-03-???"
        label = "Debug Session"
        prompt = @'
Stack: Node.js, TypeScript, Prisma, PostgreSQL, Express, Docker
Task: Debugging - one error, one file, one session.

RULES:
  - Do NOT paste multiple files at once.
  - Paste: (1) full error/traceback, (2) ONLY the function that threw it.
  - State which file: migration / provisioner / schema / client.routes / group.routes / tests

Known gotchas for this stack:
  - Prisma raw SQL: always SET search_path = tenantSchema before queries
  - RLS: if query returns empty unexpectedly, check search_path is set
  - nanoid: import { nanoid } from "nanoid" - ESM only, check package.json type
  - group_code uniqueness: slug collision possible without nanoid suffix
  - E.164: regex must allow + prefix, reject plain 10-digit Indian numbers
  - JSONB queries: use @> operator with GIN index for performance
  - JWT tenant_schema claim: req.tenantSchema set by requireTenant middleware

Paste error and function below:
'@
    }
}

# ── List ───────────────────────────────────────────────────────────────────────
if ($Session -eq "list") {
    Write-Host ""
    Write-Host "  Travel SaaS Sprint 03 - Available sessions" -ForegroundColor Cyan
    Write-Host ""
    $order = @("audit","migration","provisioner","schema","clientroutes","grouproutes","tests","debug")
    foreach ($key in $order) {
        $s = $sessions[$key]
        $tag = if ($s.model -like "*haiku*") { "Haiku  [cheap]" } else { "Sonnet [smart]" }
        Write-Host ("  {0,-16} {1,-42} [{2}]" -f $key, $s.label, $tag)
    }
    Write-Host ""
    Write-Host "  START HERE: .\travel-saas-sprint03-sessions.ps1 -Session audit" -ForegroundColor Yellow
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
Write-Host "  Tip: paste clipboard, then type: superpowers brainstorm" -ForegroundColor DarkGray
Write-Host ""

Set-Location $PROJECT_ROOT
$env:ANTHROPIC_MODEL = $s.model
& claude --model $s.model
