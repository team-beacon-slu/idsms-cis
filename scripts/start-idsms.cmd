@echo off
rem Double-click to run IDSMS-CIS at http://localhost:3000. Close this window to stop it.
setlocal
title IDSMS-CIS
cd /d "%~dp0.."
set "URL=http://localhost:3000"

where node >nul 2>nul || (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org, then try again.
  goto :fail
)
if not exist ".env" (
  echo The .env file is missing. Copy .env.example to .env and fill in the values.
  goto :fail
)

rem Already running? Just open it.
netstat -ano | findstr /r /c:":3000 .*LISTENING" >nul && (
  echo IDSMS-CIS is already running.
  if not defined IDSMS_NO_BROWSER start "" "%URL%"
  exit /b 0
)

if not exist "node_modules\next\package.json" (
  echo Installing dependencies. First run only, this takes a few minutes...
  call npm ci || goto :fail
)

rem Rebuild only when the code changed since the last build.
set "COMMIT=unknown"
for /f %%c in ('git rev-parse HEAD 2^>nul') do set "COMMIT=%%c"
set "BUILT="
if exist ".next\idsms-built-commit" set /p BUILT=<".next\idsms-built-commit"
set "NEED_BUILD="
if not exist ".next\BUILD_ID" set "NEED_BUILD=1"
if not "%BUILT%"=="%COMMIT%" set "NEED_BUILD=1"
if "%COMMIT%"=="unknown" set "NEED_BUILD=1"
if defined NEED_BUILD (
  echo Building the website. This takes a minute or two...
  call npm run build || goto :fail
  > ".next\idsms-built-commit" echo %COMMIT%
)

rem Open the browser once the server answers (gives up after two minutes).
if not defined IDSMS_NO_BROWSER start "" /b powershell -NoProfile -WindowStyle Hidden -Command ^
  "for($i=0;$i -lt 120;$i++){try{(New-Object Net.Sockets.TcpClient).Connect('127.0.0.1',3000);Start-Process '%URL%';break}catch{Start-Sleep 1}}"

echo.
echo IDSMS-CIS is starting at %URL%
echo Close this window to stop it.
echo.
call npm run start
exit /b %errorlevel%

:fail
echo.
echo IDSMS-CIS could not start. Read the message above, or ask the team.
pause
exit /b 1
