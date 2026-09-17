# Auto-increment version and build number for TakeoutFix
param (
    [switch]$PatchOnly = $false
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$propsFile = Join-Path $root "native\src\main\resources\version.properties"

if (-not (Test-Path $propsFile)) {
    Write-Warning "version.properties not found at $propsFile, creating new one..."
    "app.version=2.0.2`nbuild.number=100`nbuild.timestamp=$(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ')" | Set-Content -Path $propsFile -Encoding UTF8
}

# 1. Parse current version & build number
$content = Get-Content -Path $propsFile -Raw
$versionMatch = [regex]::Match($content, 'app\.version=([0-9]+\.[0-9]+\.[0-9]+)')
$buildMatch = [regex]::Match($content, 'build\.number=([0-9]+)')

$currentVersion = if ($versionMatch.Success) { $versionMatch.Groups[1].Value } else { "2.0.2" }
$currentBuild = if ($buildMatch.Success) { [int]$buildMatch.Groups[1].Value } else { 100 }

$newBuild = $currentBuild + 1

# Increment patch version (e.g. 2.0.2 -> 2.0.3)
$parts = $currentVersion.Split('.')
$major = [int]$parts[0]
$minor = [int]$parts[1]
$patch = [int]$parts[2] + 1
$newVersion = "$major.$minor.$patch"
$timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "[VERSION BUMP] Old: v$currentVersion (Build $currentBuild)" -ForegroundColor Yellow
Write-Host "[VERSION BUMP] New: v$newVersion (Build $newBuild) at $timestamp" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan

# 2. Write back to version.properties
$newProps = "app.version=$newVersion`nbuild.number=$newBuild`nbuild.timestamp=$timestamp"
[System.IO.File]::WriteAllText($propsFile, $newProps, [System.Text.Encoding]::UTF8)

# 3. Synchronize native/pom.xml (only project artifact version)
$nativePom = Join-Path $root "native\pom.xml"
if (Test-Path $nativePom) {
    $pomContent = [System.IO.File]::ReadAllText($nativePom, [System.Text.Encoding]::UTF8)
    $pattern = '(?<=<artifactId>takeoutfix<\/artifactId>\s*<version>)[0-9.]+(?=<\/version>)'
    $updatedPom = [regex]::Replace($pomContent, $pattern, $newVersion)
    [System.IO.File]::WriteAllText($nativePom, $updatedPom, [System.Text.Encoding]::UTF8)
}

# 4. Synchronize root pom.xml (only root artifact version)
$rootPom = Join-Path $root "pom.xml"
if (Test-Path $rootPom) {
    $rootPomContent = [System.IO.File]::ReadAllText($rootPom, [System.Text.Encoding]::UTF8)
    $patternRoot = '(?<=<artifactId>takeoutfix-root<\/artifactId>\s*<version>)[0-9.]+(?=<\/version>)'
    $updatedRootPom = [regex]::Replace($rootPomContent, $patternRoot, $newVersion)
    [System.IO.File]::WriteAllText($rootPom, $updatedRootPom, [System.Text.Encoding]::UTF8)
}

# 5. Synchronize build-exe.ps1
$buildExe = Join-Path $root "build-exe.ps1"
if (Test-Path $buildExe) {
    $exeContent = [System.IO.File]::ReadAllText($buildExe, [System.Text.Encoding]::UTF8)
    $updatedExe = [regex]::Replace($exeContent, '--app-version "[0-9.]+"', "--app-version `"$newVersion`"")
    [System.IO.File]::WriteAllText($buildExe, $updatedExe, [System.Text.Encoding]::UTF8)
}

Write-Host "[VERSION BUMP] Synchronized version $newVersion across version.properties, pom.xml, and build scripts." -ForegroundColor Green
