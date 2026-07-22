@echo off
if not exist logs mkdir logs
echo Packaging Spring Boot Application...
call "C:\Program Files\JetBrains\IntelliJ IDEA 2026.1.3\plugins\maven\lib\maven3\bin\mvn.cmd" clean package -DskipTests > logs\springboot-build.log 2>&1
echo Spring Boot packaged. Build log saved to logs\springboot-build.log
