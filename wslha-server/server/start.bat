@echo off
cd /d "%~dp0"
echo === Team Quest Server ===
echo.

if exist node_modules (
  echo Cleaning previous install...
  rmdir /s /q node_modules
)
if exist package-lock.json del /q package-lock.json

echo Installing dependencies (first run only, may take a minute)...
call npm install
if errorlevel 1 (
  echo.
  echo npm install failed. Make sure Node.js is installed from nodejs.org, then try again.
  pause
  exit /b 1
)
echo.
echo Starting server on http://localhost:3001
echo Keep this window open while you play. Close it or press Ctrl+C to stop.
echo.
call npm start
pause
