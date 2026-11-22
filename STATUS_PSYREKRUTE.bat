@echo off
setlocal enabledelayedexpansion

rem Determine script directory
set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%"

rem ---------- Show containers status ----------
echo Docker containers status:\r
docker compose -f docker\docker-compose.yml ps

rem ---------- Health of backend ----------
echo Checking backend health...\r
for /f %%H in ('docker inspect -f "{{.State.Health.Status}}" psyrekrute_backend 2^>NUL') do set "BSTATUS=%%H"
if defined BSTATUS (
  echo Backend health status: !BSTATUS!
) else (
  echo Backend container not found or no healthcheck defined.
)

rem ---------- Frontend reachable? ----------
echo Checking frontend HTTP response...\r
curl -s -o NUL -w "%{http_code}" http://localhost:3000 | findstr /i "200" >nul
if %errorlevel%==0 (
  echo Frontend reachable (HTTP 200).
) else (
  echo Frontend not reachable.
)

rem ---------- Cloudflare tunnel status ----------	tasklist /FI "IMAGENAME eq cloudflared.exe" | find /I "cloudflared.exe" >nul
if not errorlevel 1 (
  echo Cloudflare tunnel is running.
) else (
  echo No Cloudflare tunnel detected.
)

echo -------------------------------------------------
echo End of status report.
echo -------------------------------------------------

popd
endlocal