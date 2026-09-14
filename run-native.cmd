@echo off
title TakeoutFix Native Desktop Ops Center
cd /d "%~dp0"
echo ========================================================
echo   Starting TakeoutFix Native Desktop Application...
echo ========================================================
if not exist "native\target\takeoutfix.jar" (
    echo [1/2] Building native application package...
    call mvn.cmd clean package -DskipTests -pl native
)
echo [2/2] Launching Native GUI Ops Center...
java -jar "native\target\takeoutfix.jar"
pause
