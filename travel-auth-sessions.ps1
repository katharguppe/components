# ==============================================================================
# travel-auth-sessions.ps1
# Claude Code session launcher for Travel SaaS Auth -- sprint-based.
# Owner: Srinivas / Fidelitus Corp
# Run from D:\vaikunta-ekadashi\Components\saas-auth
#
# Usage:
#   .\travel-auth-sessions.ps1 -Session list
#   .\travel-auth-sessions.ps1 -Session sprint01
#   .\travel-auth-sessions.ps1 -Session sprint03
#   .\travel-auth-sessions.ps1 -Session e2e
#   .\travel-auth-sessions.ps1 -Session debug
#
# Adding a new sprint:
#   .\new-sprint.ps1 -Sprint 04 -Theme "booking-engine"
#   (fill in masterpromptSPRINT04.md, then run -Session sprint04)
# ==============================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$Session
)

$PROJECT_ROOT = "D:\vaikunta-ekadashi\Components\saas-auth"
$SONNET       = "claude-sonnet-4-6"
$HAIKU        = "claude-haiku-4-5-20251001"

Set-Location $PROJECT_ROOT

# ---- LIST --------------------------------------------------------------------
if ($Session -eq "list") {
    Write-Host ""
    Write-Host "=====================================================================" -ForegroundColor Cyan
    Write-Host "  Travel SaaS Auth -- Available Sessions" -ForegroundColor Cyan
    Write-Host "=====================================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  SPRINT SESSIONS (from masterpromptSPRINTXX.md files):" -ForegroundColor Yellow
    Write-Host ""

    $sprintFiles = Get-ChildItem -Path $PROJECT_ROOT -Filter "masterpromptSPRINT*.md" |
        Where-Object { $_.Name -match 'masterpromptSPRINT(\d+)\.md' } |
        Sort-Object Name

    if ($sprintFiles.Count -eq 0) {
        Write-Host "    (none found -- run new-sprint.ps1 to create one)" -ForegroundColor DarkGray
    } else {
        foreach ($f in $sprintFiles) {
            $f.Name -match 'masterpromptSPRINT(\d+)\.md' | Out-Null
            $num       = $Matches[1]
            $firstLine = (Get-Content $f.FullName -First 1) -replace '^# Master Prompt -- ','' -replace '^# Master Prompt - ',''
            Write-Host ("  {0,-16} {1}" -f "sprint$num", $firstLine) -ForegroundColor White
        }
    }

    Write-Host ""
    Write-Host "  FIXED SESSIONS:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host ("  {0,-16} {1}" -f "e2e",   "Run full test suite (no Claude launch) [Sonnet]") -ForegroundColor White
    Write-Host ("  {0,-16} {1}" -f "debug", "Debug session -- one error, one file [Sonnet]") -ForegroundColor White
    Write-Host ""
    Write-Host "  To add a new sprint:" -ForegroundColor DarkGray
    Write-Host "    .\new-sprint.ps1 -Sprint 04 -Theme `"booking-engine`"" -ForegroundColor DarkGray
    Write-Host ""
    exit 0
}

# ---- E2E TEST RUNNER (no Claude launch) --------------------------------------
if ($Session -eq "e2e") {
    Write-Host ""
    Write-Host "  Running full end-to-end test suite..." -ForegroundColor Cyan
    Write-Host ""

    docker compose up -d 2>&1 | Out-Null

    try {
        $health = Invoke-RestMethod -Uri "http://localhost:3001/health" -ErrorAction Stop
        if ($health.status -ne "ok") {
            Write-Host "  X Server not healthy: $($health.status)" -ForegroundColor Red
            Write-Host "    Start with: npm run dev --workspace=packages/auth-bff" -ForegroundColor Yellow
            exit 1
        }
        Write-Host "  OK Server healthy -- db: $($health.db)" -ForegroundColor Green
    } catch {
        Write-Host "  X Server not reachable at :3001" -ForegroundColor Red
        Write-Host "    Start with: npm run dev --workspace=packages/auth-bff" -ForegroundColor Yellow
        exit 1
    }

    Write-Host ""
    node "$PROJECT_ROOT\test-e2e.js"
    exit $LASTEXITCODE
}

# ---- DEBUG SESSION -----------------------------------------------------------
if ($Session -eq "debug") {
    $debugPrompt = @"
Stack: Node.js 20, TypeScript, Express, Prisma ORM, PostgreSQL 15, RS256 JWT, Zod, Docker
Project: Travel SaaS Auth (saas-auth) -- multi-tenant BFF
Root: D:\vaikunta-ekadashi\Components\saas-auth
Task: Debug session -- one error, one file, one session.

RULES:
  - Do NOT paste multiple files at once.
  - Paste: (1) full error/traceback, (2) ONLY the function that threw it.
  - State which file and which route/function.

Known gotchas:
  - tenant_slug must be in request body for /auth/login (not just header)
  - Prisma raw queries: UUID columns need dollar-sign-1::uuid cast (Prisma sends all params as text)
  - Route prefixes: /auth, /admin, /operator (no /api/v1) -- /api/v1/clients (has prefix)
  - Route mount order: static segments before wildcard /:param in app.ts
  - Preferences PUT body: { preferences: { ... } } nested, not flat
  - Docker must be up: docker compose up -d
  - Server: npm run dev --workspace=packages/auth-bff
  - BUG-001: requireSameTenant not wired -- do not add without approval

Paste error and function below:
"@

    Write-Host ""
    Write-Host "  Debug Session -- Travel SaaS Auth" -ForegroundColor Yellow
    Write-Host "  Model: $SONNET" -ForegroundColor Yellow
    Write-Host ""
    Write-Host $debugPrompt -ForegroundColor White
    Write-Host ""
    $debugPrompt | Set-Clipboard
    Write-Host "  OK Copied to clipboard. Paste into Claude, then describe the error." -ForegroundColor Green
    Write-Host ""
    $env:ANTHROPIC_MODEL = $SONNET
    claude --model $SONNET
    exit 0
}

# ---- SPRINT SESSION ----------------------------------------------------------
if ($Session -match '^sprint(\d{2})$') {
    $sprintNum  = $Matches[1]
    $promptFile = "$PROJECT_ROOT\masterpromptSPRINT$sprintNum.md"

    if (-not (Test-Path $promptFile)) {
        Write-Host ""
        Write-Host "  X masterpromptSPRINT$sprintNum.md not found." -ForegroundColor Red
        Write-Host ""
        Write-Host "  To create Sprint $sprintNum scaffold:" -ForegroundColor Yellow
        Write-Host "    .\new-sprint.ps1 -Sprint $sprintNum -Theme `"your-theme`"" -ForegroundColor White
        Write-Host ""
        exit 1
    }

    $promptContent = Get-Content $promptFile -Raw -Encoding UTF8
    $label         = (Get-Content $promptFile -First 1) -replace '^# ',''

    Write-Host ""
    Write-Host "  =====================================================================" -ForegroundColor Cyan
    Write-Host "  $label" -ForegroundColor Cyan
    Write-Host "  Model  : $SONNET" -ForegroundColor Cyan
    Write-Host "  File   : masterpromptSPRINT$sprintNum.md" -ForegroundColor Cyan
    Write-Host "  =====================================================================" -ForegroundColor Cyan
    Write-Host ""

    $preview = (Get-Content $promptFile -First 30) -join "`n"
    Write-Host $preview -ForegroundColor White
    Write-Host "  ..." -ForegroundColor DarkGray
    Write-Host ""

    $promptContent | Set-Clipboard
    Write-Host "  OK Full prompt copied to clipboard." -ForegroundColor Green
    Write-Host "  Tip: paste into Claude Code to start the session with full context." -ForegroundColor DarkGray
    Write-Host ""
    $env:ANTHROPIC_MODEL = $SONNET
    claude --model $SONNET
    exit 0
}

# ---- UNKNOWN -----------------------------------------------------------------
Write-Host ""
Write-Host "  X Unknown session: '$Session'" -ForegroundColor Red
Write-Host "    Run: .\travel-auth-sessions.ps1 -Session list" -ForegroundColor Yellow
Write-Host ""
exit 1
