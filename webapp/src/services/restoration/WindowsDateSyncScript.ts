/**
 * WindowsDateSyncScript.ts (Cross-Platform Date Sync Engine)
 * Generates self-contained scripts to synchronize OS File Explorer / Finder
 * "Date Modified" and "Date Created" timestamps with the deeply injected
 * EXIF / QuickTime media taken times across Windows (.bat), macOS (.sh), and Linux (.sh).
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

export function generateSyncShContent(): string {
  return `#!/bin/bash
# ======================================================================
# TakeoutFix - macOS & Linux File Timestamp Synchronizer
# ======================================================================
DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
JSON_PATH="$DIR/file_timestamps.json"

echo "======================================================================"
echo "          TakeoutFix - macOS & Linux Timestamp Synchronizer"
echo "======================================================================"
echo ""
echo "Syncing Finder / File Manager timestamps to match photo taken times..."
echo ""

if [ -f "$JSON_PATH" ]; then
  if command -v python3 >/dev/null 2>&1; then
    python3 -c "
import json, os
with open('$JSON_PATH') as f:
    items = json.load(f)
synced = 0
for item in items:
    p = os.path.join('$DIR', item['path'])
    if os.path.exists(p):
        try:
            t = int(item['epoch'])
            os.utime(p, (t, t))
            synced += 1
        except Exception:
            pass
print(f'Successfully synchronized {synced} files in Finder / File Manager!')
"
  elif command -v node >/dev/null 2>&1; then
    node -e "
const fs = require('fs');
const path = require('path');
const items = JSON.parse(fs.readFileSync('$JSON_PATH', 'utf8'));
let synced = 0;
items.forEach(item => {
  const p = path.join('$DIR', item.path);
  if (fs.existsSync(p)) {
    try {
      const t = Number(item.epoch);
      fs.utimesSync(p, t, t);
      synced++;
    } catch (_) {}
  }
});
console.log('Successfully synchronized ' + synced + ' files in Finder / File Manager!');
"
  else
    synced=0
    while IFS= read -r line; do
      target_path=$(echo "$line" | sed -n 's/.*"path": *"\\([^"]*\\)".*/\\1/p')
      epoch=$(echo "$line" | sed -n 's/.*"epoch": *\\([0-9]*\\).*/\\1/p')
      if [ -n "$target_path" ] && [ -n "$epoch" ]; then
        target="$DIR/$target_path"
        if [ -e "$target" ]; then
          date_str=$(date -r "$epoch" +"%Y%m%d%H%M.%S" 2>/dev/null || date -d "@$epoch" +"%Y%m%d%H%M.%S" 2>/dev/null)
          if [ -n "$date_str" ]; then
            touch -t "$date_str" "$target" 2>/dev/null && synced=$((synced+1))
          fi
        fi
      fi
    done < "$JSON_PATH"
    echo "Successfully synchronized $synced files!"
  fi
else
  echo "Notice: file_timestamps.json not found in $DIR."
fi

echo ""
echo "======================================================================"
echo "Done! Timestamps synchronized."
`;
}

export function isWindowsPlatform(): boolean {
  if (typeof window === "undefined" || !window.navigator) return true;
  const p = window.navigator.platform || "";
  const ua = window.navigator.userAgent || "";
  return p.startsWith("Win") || ua.includes("Windows");
}

export function downloadSyncScript(): void {
  const isWin = isWindowsPlatform();
  const content = isWin ? generateSyncBatContent() : generateSyncShContent();
  const mimeType = isWin ? "application/x-bat" : "application/x-sh";
  const filename = isWin ? "sync_windows_dates.bat" : "sync_macos_linux.sh";

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Backwards-compatible alias for existing callers
export const downloadSyncBat = downloadSyncScript;

