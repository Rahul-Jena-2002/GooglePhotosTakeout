$ErrorActionPreference = "Stop"

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
  --main-class "com.rahul.TakeoutApplication" `
  --name "TakeoutFix" `
  --icon "native/icons/icon.ico" `
  --app-version "1.0.0" `
  --dest "dist-exe" `
  --win-dir-chooser `
  --win-menu `
  --win-shortcut `
  --verbose

Write-Host "Done! Generated files in dist-exe:"
Get-ChildItem "dist-exe" | Select-Object Name, Length
