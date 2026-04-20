# TOOLS.md - Travel SaaS Sprint 04

## Claude Code Plugins
  superpowers      : start any new deliverable
  context7         : @google/generative-ai, Prisma, Zod, Express, axios APIs
  code-simplifier  : after routes pass tests

## MCP Servers
  filesystem           : read existing files without pasting
  memory               : persist decisions, schema choices
  sequential-thinking  : stub state machine design, interface planning

## Session Launcher
  .\travel-saas-sprint04-sessions.ps1 -Session list
  .\travel-saas-sprint04-sessions.ps1 -Session audit  <- START HERE

## Key Commands
  docker-compose up -d                  Start all services
  docker-compose logs auth-bff -f       Watch BFF logs
  node test-tripjack-routes.js          Run TripJack test suite
  node test-client-routes.js            Run client tests (regression check)
  node test-admin-routes.js             Run admin tests (regression check)

## Environment
  TRIPJACK_MODE=stub          # stub | production
  GEMINI_API_KEY=...          # required for stub mode
  GEMINI_MODEL=gemini-2.0-flash

## Key Libraries (use context7 for all)
  @google/generative-ai : Gemini Flash SDK
  @prisma/client        : DB access + raw SQL for tenant schema
  zod                   : request/response validation
  express               : routing
  axios                 : HTTP client for RealHotelService (prod)
  jsonwebtoken          : JWT decode for tenant_schema claim

## Design Spec
  docs/superpowers/specs/2026-04-14-sprint04-tripjack-design.md
