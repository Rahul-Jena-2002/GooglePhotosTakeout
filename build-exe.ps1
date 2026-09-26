$ErrorActionPreference = "Stop"

# Auto-purge active sessions and cache
$sessionPath = "$env:USERPROFILE\.takeoutfix\session.json"
$usersPath = "$env:USERPROFILE\.takeoutfix\users.json"
if (Test-Path $sessionPath) { Remove-Item $sessionPath -Force }
if (Test-Path $usersPath) { Remove-Item $usersPath -Force }

# Ensure jpackage-input exists and has the JAR
New-Item -ItemType Directory -Force -Path "jpackage-input" | Out-Null
Copy-Item "native/target/takeoutfix.jar" "jpackage-input/takeoutfix.jar" -Force

$appVersion = "2.1.7"

# 1. Build Native Application Image (Standalone Runtime + App)
Write-Host "Building native application image..."
if (Test-Path "dist-app") { Remove-Item -Recurse -Force "dist-app" }
jpackage `
  --type app-image `
  --input "jpackage-input" `
  --main-jar "takeoutfix.jar" `
  --main-class "com.takeoutfix.TakeoutApplication" `
  --name "TakeoutFix" `
  --icon "native/icons/icon.ico" `
  --vendor "TakeoutFix" `
  --app-version "$appVersion" `
  --dest "dist-app" `
  --verbose

# 2. Package into Direct Standalone Single-File EXE (Zero-Install, Runs Immediately)
Write-Host "Creating Direct Standalone TakeoutFix.exe (No Installation Wizard)..."
$payloadZip = "dist-app\payload.zip"
if (Test-Path $payloadZip) { Remove-Item $payloadZip -Force }
Compress-Archive -Path "dist-app\TakeoutFix\*" -DestinationPath $payloadZip -Force

New-Item -ItemType Directory -Force -Path "dist-exe" | Out-Null
$cscPath = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
& $cscPath `
  /target:winexe `
  /win32icon:native\icons\icon.ico `
  /reference:System.IO.Compression.dll,System.IO.Compression.FileSystem.dll,System.Windows.Forms.dll `
  /resource:$payloadZip,payload.zip `
  /out:dist-exe\TakeoutFix.exe `
  native\launcher\SingleFileLauncher.cs

Remove-Item $payloadZip -Force

# 3. Optional: Build Setup Installer via WiX
$wixDir = "$PSScriptRoot\wix-tools"
if (Test-Path "$wixDir\candle.exe") {
  $env:Path = "$wixDir;" + $env:Path
  Write-Host "Generating optional TakeoutFix-Setup.exe installer..."
  jpackage `
    --type exe `
    --app-image "dist-app\TakeoutFix" `
    --name "TakeoutFix-Setup" `
    --icon "native/icons/icon.ico" `
    --app-version "$appVersion" `
    --vendor "TakeoutFix" `
    --copyright "Copyright 2026 TakeoutFix" `
    --description "Google Takeout Photo Metadata Restorer" `
    --dest "dist-exe" `
    --win-per-user-install `
    --win-dir-chooser `
    --win-menu `
    --win-shortcut `
    --verbose
}

Write-Host "Done! Generated files in dist-exe:"
Get-ChildItem "dist-exe" | Select-Object Name, Length
