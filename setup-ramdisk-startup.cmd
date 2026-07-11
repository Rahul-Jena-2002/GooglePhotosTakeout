@echo off
:: ============================================================
:: setup-ramdisk-startup.cmd
:: Add this to Windows Task Scheduler to auto-recreate RAM disk
:: on every reboot (since RAM clears on shutdown)
::
:: Task Scheduler settings:
::   Trigger : At startup
::   Action  : Run this script
::   Run as  : Administrator
::   Delay   : 30 seconds after startup
:: ============================================================

echo Recreating RAM disk after reboot...

:: Create 4GB RAM disk at R:
imdisk -a -s 10240M -m R: -p "/fs:ntfs /q /y"

:: Recreate folders (they cleared on reboot)
mkdir "R:\npm-cache" 2>nul
mkdir "R:\antigravity" 2>nul
mkdir "R:\antigravity\brain" 2>nul

echo RAM disk R:\ ready.
echo npm cache pointing to R:\npm-cache
echo Antigravity junction active at C:\Users\rahul\.gemini\antigravity
