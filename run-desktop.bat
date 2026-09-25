@echo off
cd /d "%~dp0native"
start "TakeoutFix" "C:\Program Files\Java\jdk-26.0.2.1\bin\java.exe" -jar target\takeoutfix.jar
exit
