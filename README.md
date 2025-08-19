## GoogleTakeout Metadata Restorer

[![Release](https://img.shields.io/github/v/release/YOUR-USERNAME/GoogleTakeoutMetadataRestorer?label=release)](./releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Issues](https://img.shields.io/github/issues/YOUR-USERNAME/GoogleTakeoutMetadataRestorer)](./issues)

Restore original photo and video timestamps (EXIF/metadata) from Google Takeout exports with a small, portable GUI tool.

## Table of contents

- Features
- Quickstart
- Usage
- Troubleshooting
- Contributing
- License

## 🚀 Features

- Portable: no installer required — unzip and run
- Bundled runtime: works without a separate Java installation
- GUI: pick one or more folders exported from Google Takeout
- Restores EXIF metadata and file timestamps using the JSON metadata provided by Google Takeout (JSON + JPG/MP4 pairs)

## 📥 Quickstart

1. Open this repository's Releases page: `./releases` (or https://github.com/YOUR-USERNAME/GoogleTakeoutMetadataRestorer/releases)
2. Download `GoogleTakeoutMetadataRestorer.zip` for Windows
3. Unzip to any folder (Desktop, Downloads, external drive)
4. Double-click `GoogleTakeoutMetadataRestorer.exe` to run the GUI

Minimal requirements:

- Windows 10/11
- ~80 MB free disk space for the app and runtime

## ▶️ Usage

Restore original photo and video timestamps (EXIF/metadata) from Google Takeout exports with a small, portable GUI tool. 2. Click "Select Folder" and point to a Google Takeout folder that contains the photo/video files together with the `.json` metadata files. 3. (Optional) Review selected folders in the UI. 4. Click "Restore" to apply original timestamps to files and (where possible) update EXIF metadata.

Notes:

- The tool matches media files with their corresponding Takeout JSON files. It will update file modified/created timestamps and write EXIF metadata for JPEG/MP4 when possible.
- Always keep a backup of your export before running batch operations.
  This repository includes ready-to-run binaries in the project root for convenience. Choose one of the options below:

1. Use the bundled Windows installer/executable: `GoogleTakeoutPhotos-Fixer-1.0.0-x64-latest.exe` (recommended on Windows).
2. Or run the Java bundle directly: `GoogleTakeoutMetadataRestorer-1.0.0.jar` (the `runtime/` folder contains a bundled JRE; double-click the `.jar` or run it with the included `javaw` in `runtime/bin`).

Unzip or place the desired binary somewhere convenient (Desktop, Downloads, external drive) and run it.

Minimal requirements:

- Windows 10/11
- ~80 MB free disk space for the app and bundled runtime
- Limitations: the tool may not be able to recover 100% of metadata for every file — results depend on the completeness and naming of the JSON metadata, the media file type, and existing metadata. In practice it recovers far more accurately than most available free resources, but keep backups and verify results.

## ⚠️ Troubleshooting

MIT License 1f2 see `./LICENSE` for details.

- If the app doesn't start: confirm you downloaded the Windows release (the bundle includes a runtime). Try running the `.exe` as administrator.
- If timestamps are not applied: verify the JSON metadata files exist next to media files and are not renamed.
- If EXIF isn't updated for some files: some file types or existing metadata layouts may prevent writing — check the app log (if available) for details.

Included files in this repository (examples found in the project root):

- `GoogleTakeoutPhotos-Fixer-1.0.0-x64-latest.exe` — Windows executable bundle with runtime.
- `GoogleTakeoutMetadataRestorer-1.0.0.jar` — Java runnable jar (can be executed with the bundled runtime in `runtime/`).

1. Fork the repo.
2. Create a feature branch: `feature/my-change`.
3. Make changes and add tests where applicable.
4. Open a pull request describing the change.

Please open an issue for bugs or feature requests before doing large work so we can discuss scope.

If you want to run or build from source, add a short BUILD.md in the repo describing the steps and runtime requirements — this README intentionally omits build commands because releases ship as a bundled Windows binary.

## Security & Privacy

- This tool processes files locally — it does not upload your photos to any external service.
- Still, test with non-sensitive samples first and keep a backup of original exports.

## License

MIT License — see `./LICENSE` for details.

---

If you'd like, I can also add a screenshot, CI badge, or a small `USAGE.md` with annotated screenshots and a short changelog. Replace `YOUR-USERNAME` in badge links with your GitHub username to enable live badges.
