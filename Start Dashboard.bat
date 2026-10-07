@echo off
rem Windows: double-click to start the agent dashboard. Keep this window open.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get it from https://nodejs.org then try again. & pause & exit /b 1)
node server.js --open
pause
