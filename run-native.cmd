@echo off
title TakeoutFix Native Desktop Ops Center
cd /d "%~dp0"
echo ========================================================
echo   Starting TakeoutFix Native Desktop Application...
echo ========================================================
if exist "%USERPROFILE%\.takeoutfix\session.json" del /f /q "%USERPROFILE%\.takeoutfix\session.json"
if exist "%USERPROFILE%\.takeoutfix\users.json" del /f /q "%USERPROFILE%\.takeoutfix\users.json"
echo [1/2] Packaging latest code...
call mvn.cmd package -DskipTests -pl native
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Build failed!
    pause
    exit /b %ERRORLEVEL%
)
echo [2/2] Launching Native GUI Ops Center...
java -jar "native\target\takeoutfix.jar"
pause
