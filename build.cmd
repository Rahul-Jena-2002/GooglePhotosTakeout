@echo off
if not exist logs mkdir logs
echo [BUILD] Auto-bumping build version...
powershell -ExecutionPolicy Bypass -File "%~dp0bump-version.ps1"
set JAVA_HOME=C:\Program Files\Java\jdk-17
set PATH=%JAVA_HOME%\bin;%PATH%
set MVN_CMD=C:\Program Files\JetBrains\IntelliJ IDEA 2026.1.3\plugins\maven\lib\maven3\bin\mvn.cmd
echo [BUILD] Purging all active session tokens and local caches (logging out)...
if exist "%USERPROFILE%\.takeoutfix\session.json" del /f /q "%USERPROFILE%\.takeoutfix\session.json"
if exist "%USERPROFILE%\.takeoutfix\users.json" del /f /q "%USERPROFILE%\.takeoutfix\users.json"
del /f /q "%USERPROFILE%\.takeoutfix\*.cache" 2>nul
del /f /q "%USERPROFILE%\.takeoutfix\*.log" 2>nul
call "%MVN_CMD%" clean package -DskipTests
