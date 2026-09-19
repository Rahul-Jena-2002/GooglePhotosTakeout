/**
 * WindowsDateSyncScript.ts
 * Generates a self-contained batch/powershell script to synchronize
 * Windows File Explorer "Date Modified" and "Date Created" timestamps
 * with the deeply injected EXIF / QuickTime media taken times.
 */

export function generateSyncBatContent(): string {
  return `@echo off
setlocal enabledelayedexpansion
title TakeoutFix - Windows Timestamp Synchronizer
color 0b
echo ======================================================================
echo           TakeoutFix - Windows File Timestamp Synchronizer
echo ======================================================================
echo.
echo Syncing File Explorer 'Date Modified' and 'Date Created' to match
echo the photo and video taken times...
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path; " ^
  "if (-not $scriptDir) { $scriptDir = (Get-Location).Path }; " ^
  "$jsonPath = Join-Path $scriptDir 'file_timestamps.json'; " ^
  "if (Test-Path -LiteralPath $jsonPath) { " ^
  "  Write-Host 'Loading timestamp catalog...' -ForegroundColor Cyan; " ^
  "  $items = Get-Content -LiteralPath $jsonPath -Raw | ConvertFrom-Json; " ^
  "  $synced = 0; " ^
  "  foreach ($item in $items) { " ^
  "    $target = Join-Path $scriptDir $item.path; " ^
  "    if (Test-Path -LiteralPath $target) { " ^
  "      try { " ^
  "        $epoch = [int64]$item.epoch; " ^
  "        if ($epoch -lt 315532800) { $epoch = 315532800 }; " ^
  "        $dt = ([datetime]'1970-01-01 00:00:00').AddSeconds($epoch).ToLocalTime(); " ^
  "        $f = Get-Item -LiteralPath $target; " ^
  "        $f.CreationTime = $dt; " ^
  "        $f.LastWriteTime = $dt; " ^
  "        $synced++; " ^
  "      } catch {} " ^
  "    } " ^
  "  }; " ^
  "  Write-Host ('Successfully synchronized ' + $synced + ' files in Windows File Explorer!') -ForegroundColor Green; " ^
  "} else { " ^
  "  Write-Host 'Scanning folder tree for media...' -ForegroundColor Cyan; " ^
  "  $shell = New-Object -ComObject Shell.Application; " ^
  "  $files = Get-ChildItem -LiteralPath $scriptDir -Recurse -File; " ^
  "  $synced = 0; " ^
  "  foreach ($f in $files) { " ^
  "    $folder = $shell.Namespace($f.DirectoryName); " ^
  "    $item = $folder.ParseName($f.Name); " ^
  "    $rawDate = $folder.GetDetailsOf($item, 12); " ^
  "    if (-not $rawDate) { $rawDate = $folder.GetDetailsOf($item, 208) }; " ^
  "    if ($rawDate) { " ^
  "      $clean = $rawDate -replace '[^0-9/: -APMapm]',''; " ^
  "      if ([datetime]::TryParse($clean, [ref]$null)) { " ^
  "        $dt = [datetime]::Parse($clean); " ^
  "        $f.CreationTime = $dt; " ^
  "        $f.LastWriteTime = $dt; " ^
  "        $synced++; " ^
  "      } " ^
  "    } " ^
  "  }; " ^
  "  Write-Host ('Successfully synchronized ' + $synced + ' media files!') -ForegroundColor Green; " ^
  "}"

echo.
echo ======================================================================
echo Done! All timestamps updated. Press any key to exit.
pause >nul
`;
}

export function downloadSyncBat(catalog?: { path: string; epoch: number }[]): void {
  const content = generateSyncBatContent();
  const blob = new Blob([content], { type: 'application/x-bat' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sync_windows_dates.bat';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
