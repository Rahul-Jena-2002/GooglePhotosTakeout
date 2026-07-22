@echo off
if not exist logs mkdir logs
echo Building Webapp Application...
cd webapp
cmd /c npm run build > ..\logs\webapp-build.log 2>&1
cd ..
echo Webapp built. Build log saved to logs\webapp-build.log
