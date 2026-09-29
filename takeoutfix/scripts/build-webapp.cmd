@echo off
if not exist logs mkdir logs
echo Building Webapp Application...
cd /d "%~dp0..\..\webapp"
cmd /c npm run build > "%~dp0logs\webapp-build.log" 2>&1
cd /d "%~dp0"
echo Webapp built. Build log saved to logs\webapp-build.log
