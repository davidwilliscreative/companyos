@echo off
rem Double-click to start the Opsight demo on Windows.
cd /d "%~dp0"
where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org, then double-click this file again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo First run: installing ^(this takes a minute or two^)...
  call npm install
  if errorlevel 1 (
    echo Install failed.
    pause
    exit /b 1
  )
)
echo Starting Opsight. Your browser will open at http://localhost:3000
echo Leave this window open while you use the demo. Close it to stop.
start "" cmd /c "timeout /t 6 >nul && start http://localhost:3000"
call npm run dev
pause
