@echo off
title TakeoutFix Desktop Operations Center
cd /d "%~dp0takeoutfix"
echo ===================================================
echo     TakeoutFix Desktop Operations Center
echo ===================================================
echo Starting TakeoutFix GUI...
java -jar target\takeoutfix.jar
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo TakeoutFix exited with error code %ERRORLEVEL%.
    pause
)
