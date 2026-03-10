@echo off
REM ============================================================================
REM  SaaS Auth - CHECKPOINT_02 Verification Script
REM  Runs all API tests to verify implemented functionality
REM ============================================================================

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║  SaaS Auth - CHECKPOINT_02 Verification                   ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

cd /d "%~dp0"

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js is not installed or not in PATH
    echo    Please install Node.js 20+ from https://nodejs.org/
    exit /b 1
)

echo Node.js version:
node --version
echo.

REM Check if Docker is running
docker info >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Docker is not running
    echo    Please start Docker Desktop first
    exit /b 1
)

echo Docker is running
echo.

REM Check if containers are running
echo Checking Docker containers...
docker compose ps | findstr "saas-auth-postgres" >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ⚠️  PostgreSQL container is not running
    echo.
    echo Starting infrastructure containers...
    npm run docker:up
    
    echo.
    echo Waiting for PostgreSQL to be ready (30 seconds)...
    timeout /t 30 /nobreak >nul
) else (
    echo ✓ PostgreSQL container is running
)

docker compose ps | findstr "saas-auth-mailhog" >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ⚠️  Mailhog container is not running
    echo Starting Mailhog...
    docker compose up -d mailhog
) else (
    echo ✓ Mailhog container is running
)

echo.
echo ════════════════════════════════════════════════════════════
echo Running Verification Tests
echo ════════════════════════════════════════════════════════════
echo.

REM Run the verification script
node verify-checkpoint-02.js

set TEST_RESULT=%ERRORLEVEL%

echo.

if %TEST_RESULT% EQU 0 (
    echo ════════════════════════════════════════════════════════════
    echo ✅ VERIFICATION PASSED
    echo ════════════════════════════════════════════════════════════
    echo.
    echo CHECKPOINT_02 is fully functional!
    echo.
    echo Next steps:
    echo   1. Implement Admin routes (^/admin/users^)
    echo   2. Implement Operator routes (^/operator/tenants^)
    echo   3. Implement License enforcement service
    echo.
) else (
    echo ════════════════════════════════════════════════════════════
    echo ⚠️  VERIFICATION FAILED
    echo ════════════════════════════════════════════════════════════
    echo.
    echo Some tests failed. Please review the errors above.
    echo.
    echo Troubleshooting:
    echo   1. Check if database is seeded: npm run db:seed
    echo   2. Check if RSA keys exist: dir keys
    echo   3. Check .env configuration
    echo   4. Restart the Auth BFF server
    echo.
)

echo Test results saved to: test-results.json
echo.

exit /b %TEST_RESULT%
