@echo off
setlocal enabledelayedexpansion

rem Determine script directory
set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%"

rem ---------- Ensure application is running ----------
rem Check backend health
for /f %%H in ('docker inspect -f "{{.State.Health.Status}}" psyrekrute_backend 2^>NUL') do set "BSTATUS=%%H"
if "!BSTATUS!" NEQ "healthy" (
  echo Backend is not healthy (status: !BSTATUS!). Start the application first.
  popd
  exit /b 1
)

rem Check frontend reachable
curl -s -o NUL -w "%{http_code}" http://localhost:3000 | findstr /i "200" >nul
if %errorlevel% NEQ 0 (
  echo Frontend is not reachable at http://localhost:3000. Start the application first.
  popd
  exit /b 1
)

rem ---------- Verify cloudflared availability ----------
cloudflared version >nul 2>&1
if errorlevel 1 (
  echo cloudflared is not installed or not in PATH. Install it from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation
  popd
  exit /b 1
)

rem ---------- Start Quick Tunnel ----------
rem Use a random subdomain provided by Cloudflare (quick tunnel) - the URL will be printed by cloudflared
rem We run cloudflared in a new window so that it stays alive after this script exits
start "Cloudflare Tunnel" cmd /c "cloudflared tunnel --url http://localhost:3000"

if errorlevel 1 (
  echo Failed to start cloudflared tunnel.
  popd
  exit /b 1
)

echo -------------------------------------------------
echo Cloudflare tunnel started. Use the URL printed above to share the application.
echo -------------------------------------------------

popd
endlocal