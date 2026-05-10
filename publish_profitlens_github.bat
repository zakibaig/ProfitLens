@echo off
title ProfitLens GitHub Publisher
color 0B

cd /d "%~dp0"

echo ============================================
echo      ProfitLens GitHub Publisher
echo ============================================
echo.

echo [1/6] Checking Git...
call git --version
if errorlevel 1 (
  echo ERROR: Git is not installed or not in PATH.
  pause
  exit /b
)

echo.
echo [2/6] Initializing repo if needed...
if not exist .git (
  call git init
)
call git branch -M main

echo.
echo [3/6] Setting GitHub remote...
call git remote remove origin 2>nul
call git remote add origin https://github.com/zakibaig/ProfitLens.git

echo.
echo [4/6] Showing status...
call git status

echo.
echo [5/6] Commit changes...
call git add .
call git commit -m "ProfitLens update"

echo.
echo [6/6] Push to GitHub...
call git push -u origin main

echo.
echo Done. Repo: https://github.com/zakibaig/ProfitLens
pause
