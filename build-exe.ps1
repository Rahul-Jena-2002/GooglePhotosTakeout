$ErrorActionPreference = "Stop"

# Auto-purge active sessions and cache
$sessionPath = "$env:USERPROFILE\.takeoutfix\session.json"
$usersPath = "$env:USERPROFILE\.takeoutfix\users.json"
if (Test-Path $sessionPath) { Remove-Item $sessionPath -Force }
if (Test-Path $usersPath) { Remove-Item $usersPath -Force }

# Ensure jpackage-input exists and has the JAR
New-Item -ItemType Directory -Force -Path "jpackage-input" | Out-Null
Copy-Item "native/target/takeoutfix.jar" "jpackage-input/takeoutfix.jar" -Force

# Add WiX to PATH for jpackage
$wixDir = "$PSScriptRoot\wix-tools"
$env:Path = "$wixDir;" + $env:Path

Write-Host "Running jpackage --type exe for takeoutfix..."
jpackage `
  --type exe `
  --input "jpackage-input" `
  --main-jar "takeoutfix.jar" `
  --main-class "com.takeoutfix.TakeoutApplication" `
  --name "TakeoutFix" `
  --icon "native/icons/icon.ico" `
  --app-version "2.0.9" `
  --dest "dist-exe" `
  --win-dir-chooser `
  --win-menu `
  --win-shortcut `
  --verbose

Write-Host "Done! Generated files in dist-exe:"
Get-ChildItem "dist-exe" | Select-Object Name, Length

