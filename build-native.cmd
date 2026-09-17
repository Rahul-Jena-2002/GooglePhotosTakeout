@echo off
setlocal enabledelayedexpansion
if not exist logs mkdir logs
echo [BUILD] Auto-bumping build version...
powershell -ExecutionPolicy Bypass -File "%~dp0bump-version.ps1"
echo [BUILD] Purging all active session tokens and local caches (logging out)...
if exist "%USERPROFILE%\.takeoutfix\session.json" del /f /q "%USERPROFILE%\.takeoutfix\session.json"
if exist "%USERPROFILE%\.takeoutfix\users.json" del /f /q "%USERPROFILE%\.takeoutfix\users.json"
del /f /q "%USERPROFILE%\.takeoutfix\*.cache" 2>nul
del /f /q "%USERPROFILE%\.takeoutfix\*.log" 2>nul
echo [BUILD] Packaging Native Desktop Application...
call mvn clean package -DskipTests -pl native
if errorlevel 1 (
    echo [BUILD ERROR] Maven build failed with errorlevel %ERRORLEVEL%.
    exit /b %ERRORLEVEL%
)
echo [BUILD SUCCESS] Native Desktop application packaged successfully.
