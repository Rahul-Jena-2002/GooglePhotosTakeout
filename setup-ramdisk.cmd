@echo off
:: ============================================================
:: setup-ramdisk.cmd
:: Run as ADMINISTRATOR after installing ImDisk
:: Download ImDisk: https://sourceforge.net/projects/imdisk-toolkit/
::
:: What this does:
::   1. Creates a 10GB RAM disk at R:\
::   2. Redirects npm cache -> R:\npm-cache  (speeds up installs)
::   3. Redirects Antigravity logs -> R:\antigravity
::   4. Creates folders on R:\ to hold the data
:: ============================================================

echo.
echo  ====================================================
echo   TakeoutFix RAM Disk Setup
echo   Requires: ImDisk installed + Run as Administrator
echo  ====================================================
echo.

:: --- Step 1: Create 4GB RAM disk at R: ---
echo [1/4] Creating 10GB RAM disk at R:\...
imdisk -a -s 10240M -m R: -p "/fs:ntfs /q /y"
if errorlevel 1 (
    echo ERROR: ImDisk failed. Make sure it is installed and you are running as Administrator.
    echo Download from: https://sourceforge.net/projects/imdisk-toolkit/
    pause
    exit /b 1
)
echo       Done. R:\ is now a 10GB RAM disk.
echo.

:: --- Step 2: Create folders on RAM disk ---
echo [2/4] Creating folders on R:\...
mkdir "R:\npm-cache" 2>nul
mkdir "R:\antigravity" 2>nul
mkdir "R:\antigravity\brain" 2>nul
echo       Done.
echo.

:: --- Step 3: Redirect npm cache ---
echo [3/4] Redirecting npm cache to R:\npm-cache...
:: Backup old cache location name
set NPM_CACHE_PATH=C:\Users\rahul\AppData\Local\npm-cache

:: Point npm to use RAM disk cache
npm config set cache "R:\npm-cache"
echo       npm cache is now at R:\npm-cache
echo       (Old cache at %NPM_CACHE_PATH% still exists, can be deleted)
echo.

:: --- Step 4: Redirect Antigravity brain/logs ---
echo [4/4] Redirecting Antigravity logs to R:\antigravity...
set AG_PATH=C:\Users\rahul\.gemini\antigravity

:: Only redirect if folder exists and is not already a junction
if exist "%AG_PATH%" (
    :: Check if it is already a junction
    dir "%AG_PATH%" | findstr "<JUNCTION>" >nul 2>&1
    if errorlevel 1 (
        :: Move existing data to RAM disk
        echo       Moving existing Antigravity data to RAM disk...
        xcopy "%AG_PATH%\*" "R:\antigravity\" /E /I /Q >nul 2>&1
        :: Remove original folder
        rmdir /s /q "%AG_PATH%"
        :: Create junction
        mklink /J "%AG_PATH%" "R:\antigravity"
        echo       Junction created: %AG_PATH% -^> R:\antigravity
    ) else (
        echo       Already a junction, skipping.
    )
) else (
    mklink /J "%AG_PATH%" "R:\antigravity"
    echo       Junction created: %AG_PATH% -^> R:\antigravity
)
echo.

echo  ====================================================
echo   Setup Complete!
echo.
echo   RAM Disk R:\ is active (10GB)
echo   npm cache  : R:\npm-cache
echo   Antigravity: R:\antigravity (junction from C:\)
echo.
echo   NOTE: RAM disk is CLEARED on reboot.
echo   To auto-recreate on startup, run setup-ramdisk-startup.cmd
echo  ====================================================
echo.
pause
