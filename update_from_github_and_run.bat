@echo off
title ProfitLens Update and Run
color 0A

cd /d "%~dp0"

echo ============================================
echo      ProfitLens Update and Run
echo ============================================
echo.

echo [1/4] Pulling latest code from GitHub...
call git pull origin main

echo.
echo [2/4] Checking dependencies...
if not exist node_modules (
  echo node_modules missing. Installing dependencies...
  call npm install --legacy-peer-deps --no-audit --no-fund
)

echo.
echo [3/4] Building frontend if needed...
if not exist dist (
  call npm run build
)

echo.
echo [4/4] Starting ProfitLens...
start cmd /k "cd /d ""%~dp0"" && npm run dev"
timeout /t 5 >nul
start http://localhost:5173
pause
