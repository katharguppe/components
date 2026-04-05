# ==============================================================================
# new-sprint.ps1
# Scaffold a new sprint for Travel SaaS Auth.
# Run from D:\vaikunta-ekadashi\Components\saas-auth
#
# Usage:
#   .\new-sprint.ps1 -Sprint 04 -Theme "booking-engine"
#   .\new-sprint.ps1 -Sprint 04 -Theme "booking-engine" -Description "Flight and hotel booking"
#
# What it creates:
#   masterpromptSPRINTXX.md   -- from masterprompt-sprint-template.md, with placeholders filled
#   CHECKPOINT_NN.md          -- stub with auto-detected next checkpoint number
#
# What it does NOT touch:
#   Source files, CLAUDE.md, app.ts, any existing route files
# ==============================================================================

param(
    [Parameter(Mandatory=$true)]
    [ValidatePattern('^\d{2}$')]
    [string]$Sprint,

    [Parameter(Mandatory=$true)]
    [string]$Theme,

    [Parameter(Mandatory=$false)]
    [string]$Description = ""
)

$PROJECT_ROOT    = "D:\vaikunta-ekadashi\Components\saas-auth"
$sprintPadded    = $Sprint.PadLeft(2,'0')
$masterPrompt    = "$PROJECT_ROOT\masterpromptSPRINT$sprintPadded.md"
$template        = "$PROJECT_ROOT\masterprompt-sprint-template.md"

Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  Travel SaaS Auth -- New Sprint Scaffold" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Sprint : $sprintPadded" -ForegroundColor White
Write-Host "  Theme  : $Theme" -ForegroundColor White
if ($Description) {
    Write-Host "  Desc   : $Description" -ForegroundColor White
}
Write-Host ""

Set-Location $PROJECT_ROOT

# Guard: don't overwrite existing sprint
if (Test-Path $masterPrompt) {
    Write-Host "  X masterpromptSPRINT$sprintPadded.md already exists." -ForegroundColor Red
    Write-Host "    Delete it first if you want to regenerate." -ForegroundColor Red
    exit 1
}

# Guard: template must exist
if (-not (Test-Path $template)) {
    Write-Host "  X masterprompt-sprint-template.md not found in project root." -ForegroundColor Red
    exit 1
}

# ---- Step 1: Detect next CHECKPOINT number -----------------------------------
Write-Host "[ 1/3 ] Detecting next CHECKPOINT number..." -ForegroundColor Yellow

$existingNums = @(Get-ChildItem -Path $PROJECT_ROOT -Filter "CHECKPOINT_*.md" |
    Where-Object { $_.Name -match 'CHECKPOINT_(\d+)\.md' } |
    ForEach-Object {
        if ($_.Name -match 'CHECKPOINT_(\d+)\.md') { [int]$Matches[1] }
    } | Sort-Object)

$nextNum        = if ($existingNums.Count -gt 0) { ($existingNums | Measure-Object -Maximum).Maximum + 1 } else { 1 }
$prevNum        = if ($existingNums.Count -gt 0) { ($existingNums | Measure-Object -Maximum).Maximum } else { $null }
$nextCheckpoint = "CHECKPOINT_" + $nextNum.ToString().PadLeft(2,'0') + ".md"
$prevCheckpoint = if ($prevNum) { "CHECKPOINT_" + $prevNum.ToString().PadLeft(2,'0') + ".md" } else { "none" }

Write-Host "  Last : $prevCheckpoint" -ForegroundColor DarkGray
Write-Host "  New  : $nextCheckpoint" -ForegroundColor Green

# ---- Step 2: Create masterpromptSPRINTXX.md from template -------------------
Write-Host ""
Write-Host "[ 2/3 ] Creating masterpromptSPRINT$sprintPadded.md..." -ForegroundColor Yellow

$raw = Get-Content $template -Raw -Encoding UTF8

$content = $raw `
    -replace 'Sprint XX: \[FILL: Theme Name\]',  "Sprint ${sprintPadded}: $Theme" `
    -replace 'Sprint   : XX',                     "Sprint   : $sprintPadded" `
    -replace '\[FILL: Theme Name\]',              $Theme `
    -replace 'test-sprintXX-routes\.js',          "test-sprint${sprintPadded}-routes.js" `
    -replace 'test-sprint\[XX\]-routes\.js',      "test-sprint${sprintPadded}-routes.js" `
    -replace '\[SPRINT-XX\]',                     "[SPRINT-$sprintPadded]" `
    -replace 'Sprint XX endpoint',                "Sprint $sprintPadded endpoint" `
    -replace 'Sprint XX',                         "Sprint $sprintPadded"

# Replace checkpoint references carefully
$content = $content `
    -replace '\[FILL: CHECKPOINT_NN\.md[^\]]*new checkpoint[^\]]*\]', $nextCheckpoint `
    -replace '\[FILL: CHECKPOINT_MM\.md[^\]]*last completed[^\]]*\]', $prevCheckpoint `
    -replace 'CHECKPOINT_NN\.md',                $nextCheckpoint

if ($Description) {
    $firstLine = "# Master Prompt -- Sprint ${sprintPadded}: $Theme"
    $desc      = "> $Description"
    $content   = $content -replace '^# Master Prompt.*$', "$firstLine`n`n$desc"
}

$content | Set-Content $masterPrompt -Encoding UTF8
Write-Host "  OK $masterPrompt" -ForegroundColor Green

# ---- Step 3: Create CHECKPOINT stub ------------------------------------------
Write-Host ""
Write-Host "[ 3/3 ] Creating $nextCheckpoint stub..." -ForegroundColor Yellow

$checkpointPath = "$PROJECT_ROOT\$nextCheckpoint"
$today          = Get-Date -Format 'yyyy-MM-dd'

if (Test-Path $checkpointPath) {
    Write-Host "  . $nextCheckpoint already exists -- skipping." -ForegroundColor DarkGray
} else {
    $stub = @"
# ${nextCheckpoint}: Sprint $sprintPadded -- $Theme

**Date:** $today
**Status:** PLANNING
**Sprint:** $sprintPadded -- $Theme
**Methodology:** PDCA

---

## 1. Sprint $sprintPadded Deliverables

| # | File | Status | Notes |
|---|------|--------|-------|
| 1 | [FILL] | Not started | |
| 2 | [FILL] | Not started | |
| 3 | $nextCheckpoint | Not started | This file |
| 4 | README_FULL.md | Not started | Sprint $sprintPadded endpoint table |
| 5 | git commit | Not started | |

---

## 2. API Contract

[FILL -- copy from masterpromptSPRINT$sprintPadded.md]

---

## 3. Database Schema

[FILL -- tables, columns, types]

---

## 4. Architecture Notes

[FILL -- decisions that carry forward to future sprints]

---

## 5. What Was Done This Session

[FILL -- updated as work progresses]

---

## 6. Test Results

[FILL -- paste test output here when complete]

---

## 7. Remaining Work

[FILL -- steps not yet done]

---

## 8. Definition of Done

- [ ] All source files written
- [ ] test-sprint${sprintPadded}-routes.js -- N/N passing
- [ ] node test-e2e.js -- 69+ passing, 0 regressions
- [ ] README_FULL.md updated
- [ ] Git committed with [SPRINT-$sprintPadded] message
"@
    $stub | Set-Content $checkpointPath -Encoding UTF8
    Write-Host "  OK $checkpointPath" -ForegroundColor Green
}

# ---- Summary -----------------------------------------------------------------
Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Green
Write-Host "  Sprint $sprintPadded scaffold complete." -ForegroundColor Green
Write-Host "=====================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Files created:" -ForegroundColor Cyan
Write-Host "    masterpromptSPRINT$sprintPadded.md" -ForegroundColor White
Write-Host "    $nextCheckpoint" -ForegroundColor White
Write-Host ""
Write-Host "  Before opening Claude Code, fill in masterpromptSPRINT$sprintPadded.md:" -ForegroundColor Yellow
Write-Host ""
Write-Host "    [ ] Deliverables table  -- exact filenames + purpose" -ForegroundColor White
Write-Host "    [ ] Scope section       -- files IN scope and OUT OF SCOPE" -ForegroundColor White
Write-Host "    [ ] Key Facts           -- route prefix, column types, business rules" -ForegroundColor White
Write-Host "    [ ] API Contract        -- every endpoint, method, body, response shape" -ForegroundColor White
Write-Host "    [ ] Database Schema     -- tables, columns, exact types" -ForegroundColor White
Write-Host "    [ ] Known Gotchas       -- anything sprint-specific" -ForegroundColor White
Write-Host "    [ ] Definition of Done  -- N tests, 0 regressions, README updated" -ForegroundColor White
Write-Host ""
Write-Host "  Also fill $nextCheckpoint sections 1-3." -ForegroundColor Yellow
Write-Host ""
Write-Host "  When ready:" -ForegroundColor Cyan
Write-Host "    .\travel-auth-sessions.ps1 -Session sprint$sprintPadded" -ForegroundColor White
Write-Host ""
