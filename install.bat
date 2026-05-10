@echo off
setlocal EnableDelayedExpansion

echo ================================================================
echo   ProfitLensV Patch Install - separate Fixed and All Projects caches
echo ================================================================

set "T=C:\Users\503168908\Desktop\Applications\V6"
set "S=%~dp0"
set ERRORS=0

echo Target: %T%
echo Source: %S%
echo.

if not exist "%T%" (
  echo ERROR: Target folder not found: %T%
  pause
  exit /b 1
)

if exist "%T%\data\Fixed_Projects.xlsx" echo Preserving: %T%\data\Fixed_Projects.xlsx
if exist "%T%\data\Fixed Projects.xlsx" echo Preserving: %T%\data\Fixed Projects.xlsx
if exist "%T%\data\All_Projects.xlsx" echo Preserving: %T%\data\All_Projects.xlsx
if exist "%T%\data\All Projects.xlsx" echo Preserving: %T%\data\All Projects.xlsx
if exist "%T%\data\Budget_Cost.xlsx" echo Preserving legacy fixed workbook: %T%\data\Budget_Cost.xlsx
if exist "%T%\data\Fixed_Projects_cache" echo Existing Fixed cache will be preserved and used for fast startup.
if exist "%T%\data\Fixed_Projects_cache.csv" echo Existing Fixed cache CSV will be preserved and used for fast startup.
if exist "%T%\data\All_Projects_cache.csv" echo Existing All Projects cache will be preserved and used for fast startup.
if exist "%T%\data\*.cache" echo Existing cache files will be preserved.
echo.

echo [1/7] Stopping running Node server...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 1 /nobreak >nul

echo [2/7] Backing up current code files only...
set "B=%T%\backup_before_pdz_patch_%DATE:~-4%%DATE:~4,2%%DATE:~7,2%_%TIME:~0,2%%TIME:~3,2%%TIME:~6,2%"
set "B=%B: =0%"
mkdir "%B%" >nul 2>&1
if exist "%T%\server" xcopy /E /I /Q /Y "%T%\server" "%B%\server" >nul 2>&1
if exist "%T%\client\src" xcopy /E /I /Q /Y "%T%\client\src" "%B%\client\src" >nul 2>&1
if exist "%T%\dist" xcopy /E /I /Q /Y "%T%\dist" "%B%\dist" >nul 2>&1
echo       Backup folder: %B%

echo [3/7] Installing server files...
if not exist "%T%\server" mkdir "%T%\server"
copy /Y "%S%server\index.js" "%T%\server\index.js" >nul || set ERRORS=1
copy /Y "%S%server\parseWorker.js" "%T%\server\parseWorker.js" >nul || set ERRORS=1
copy /Y "%S%server\agent.js" "%T%\server\agent.js" >nul || set ERRORS=1

echo [4/7] Installing client source files...
if not exist "%T%\client\src\components" mkdir "%T%\client\src\components"
if not exist "%T%\client\src\utils" mkdir "%T%\client\src\utils"
copy /Y "%S%client\src\App.jsx" "%T%\client\src\App.jsx" >nul || set ERRORS=1
copy /Y "%S%client\src\main.jsx" "%T%\client\src\main.jsx" >nul 2>&1
copy /Y "%S%client\src\index.css" "%T%\client\src\index.css" >nul || set ERRORS=1
copy /Y "%S%client\src\utils\api.js" "%T%\client\src\utils\api.js" >nul || set ERRORS=1
for %%F in ("%S%client\src\components\*.jsx") do copy /Y "%%F" "%T%\client\src\components\" >nul || set ERRORS=1

echo [5/7] Installing built browser files...
if not exist "%T%\dist" mkdir "%T%\dist"
if exist "%T%\dist\assets" rd /S /Q "%T%\dist\assets"
mkdir "%T%\dist\assets" >nul 2>&1
copy /Y "%S%dist\index.html" "%T%\dist\index.html" >nul || set ERRORS=1
xcopy /Y /E /Q "%S%dist\assets\*" "%T%\dist\assets\" >nul || set ERRORS=1

echo [6/7] Optional package files, without touching data...
copy /Y "%S%package.json" "%T%\package.json" >nul 2>&1
copy /Y "%S%package-lock.json" "%T%\package-lock.json" >nul 2>&1
copy /Y "%S%index.html" "%T%\index.html" >nul 2>&1
copy /Y "%S%postcss.config.js" "%T%\postcss.config.js" >nul 2>&1

echo [7/7] Preserving cache files for fast startup...
echo       Existing Fixed_Projects_cache / All_Projects cache files are NOT deleted during code install.
echo       Use the app upload/manual refresh option only when you intentionally want to rebuild cache from Excel.

echo [8/8] Verifying preserved data and installed files...
if not exist "%T%\server\index.js" set ERRORS=1
if not exist "%T%\server\parseWorker.js" set ERRORS=1
if not exist "%T%\server\agent.js" set ERRORS=1
if not exist "%T%\client\src\components\DrillTables.jsx" set ERRORS=1
if not exist "%T%\dist\index.html" set ERRORS=1
dir "%T%\dist\assets\*.js" >nul 2>&1 || set ERRORS=1

echo.
if "%ERRORS%"=="0" (
  echo ================================================================
  echo   SUCCESS - Code installed to V6.
  echo   Fixed Projects and All Projects workbooks were preserved. Existing caches were preserved. Startup will skip Excel parsing when cache exists.
  echo   Start with:  npm start
  echo   Then hard refresh browser with Ctrl+F5.
  echo ================================================================
  cd /d "%T%"
  start "" http://localhost:8000
  node server\index.js
) else (
  echo ================================================================
  echo   INSTALL HAD ERRORS. Your backup is here:
  echo   %B%
  echo ================================================================
  pause
  exit /b 1
)
