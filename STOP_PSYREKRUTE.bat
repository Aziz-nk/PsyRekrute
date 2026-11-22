@echo off
setlocal enabledelayedexpansion

rem Determine script directory
set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%"

rem ---------- Check Docker Desktop ----------
docker version >nul 2>&1
if errorlevel 1 (
  echo Docker is not installed or not in PATH. Please install Docker Desktop.
  popd
  exit /b 1
)

rem ---------- Check Docker daemon ----------
docker info >nul 2>&1
if errorlevel 1 (
  echo Docker daemon is not running. Start Docker Desktop first.
  popd
  exit /b 1
)

rem ---------- Stop services ----------
docker compose -f docker\docker-compose.yml down
if errorlevel 1 (
  echo Failed to stop Docker Compose services.
)

rem ---------- Stop Cloudflare tunnel if running (cloudflared.exe) ----------
tasklist /FI "IMAGENAME eq cloudflared.exe" | find /I "cloudflared.exe" >nul
if not errorlevel 1 (
  echo Stopping Cloudflare tunnel...
  taskkill /IM cloudflared.exe /F >nul 2>&1
) else (
  echo No Cloudflare tunnel process found.
)

echo -------------------------------------------------
echo Application stopped. Data volumes are preserved.
echo -------------------------------------------------

popd
endlocal