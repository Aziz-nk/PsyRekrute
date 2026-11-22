@echo off
setlocal enabledelayedexpansion

rem Determine the directory of this script
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

rem ---------- Prevent double start ----------
for /f "tokens=*" %%I in ('docker compose -f docker\docker-compose.yml ps -q') do set "RUNNING=1"
if defined RUNNING (
  echo Services are already running. Use STOP_PSYREKRUTE.bat to stop them first.
  popd
  exit /b 0
)

rem ---------- Start services ----------
docker compose -f docker\docker-compose.yml up -d
if errorlevel 1 (
  echo Failed to start Docker Compose services.
  popd
  exit /b 1
)

rem ---------- Wait for healthchecks ----------
echo Waiting for services to become healthy...

:check_backend
for /f %%H in ('docker inspect -f "{{.State.Health.Status}}" psyrekrute_backend 2^>NUL') do set "BSTATUS=%%H"
if "!BSTATUS!"=="healthy" (
  echo Backend healthy.
) else (
  timeout /t 5 >nul
  goto :check_backend
)

rem Frontend has no Docker healthcheck; we poll the HTTP endpoint
:check_frontend
curl -s -o NUL -w "%{http_code}" http://localhost:3000 | findstr /i "200" >nul
if %errorlevel%==0 (
  echo Frontend reachable.
) else (
  timeout /t 5 >nul
  goto :check_frontend
)

echo -------------------------------------------------
echo Application started.
echo Frontend URL: http://localhost:3000
echo Backend health URL: http://localhost:4000/api/v1/health
echo -------------------------------------------------

popd
endlocal