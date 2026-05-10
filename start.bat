@echo off
cd /d "%~dp0"
if not exist dist (
  echo Frontend not built. Building now...
  call npm run build
)
call npm run dev
pause
