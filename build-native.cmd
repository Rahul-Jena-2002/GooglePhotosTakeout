@echo off
if not exist logs mkdir logs
echo Packaging Native Desktop Application...
set MVN_CMD=mvn
if exist "C:\Program Files\JetBrains\IntelliJ IDEA 2026.1.3\plugins\maven\lib\maven3\bin\mvn.cmd" set MVN_CMD=C:\Program Files\JetBrains\IntelliJ IDEA 2026.1.3\plugins\maven\lib\maven3\bin\mvn.cmd
call "%MVN_CMD%" clean package -DskipTests -pl native > logs\native-build.log 2>&1
echo Native Desktop application packaged. Build log saved to logs\native-build.log
