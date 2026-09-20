<p align="center">
  <img src="webapp/public/favicon-512x512.png" alt="TakeoutFix Logo" width="140"/>
</p>

<h1 align="center">TakeoutFix</h1>

<p align="center">
  <strong>Privacy-First, Ultra-Fast Google Photos Takeout Metadata & Timestamp Restorer</strong>
</p>

<p align="center">
  <a href="https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest"><img src="https://img.shields.io/github/v/release/Rahul-Jena-2002/GooglePhotosTakeout?style=flat-square&color=indigo" alt="Latest Release" /></a>
  <a href="https://takeoutfix.pages.dev"><img src="https://img.shields.io/badge/Web_App-takeoutfix.pages.dev-blue?style=flat-square" alt="Web App" /></a>
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-success?style=flat-square" alt="Platforms" />
  <img src="https://img.shields.io/badge/Privacy-100%25%20Local%20Processing-emerald?style=flat-square" alt="100% Local" />
  <img src="https://img.shields.io/badge/License-MIT-gray?style=flat-square" alt="License" />
</p>

---

## 📖 What is TakeoutFix?

When you export your photos and videos from **Google Takeout**, Google separates authentic creation dates, GPS coordinates, and camera tags from your media and dumps them into companion `.json` sidecar files. To make matters worse, file system timestamps are overwritten with the date you downloaded the zip archives.

**TakeoutFix** solves this completely offline:
- Accurately pairs every photo and video with its corresponding Google Takeout JSON sidecar.
- Handles Google's nasty edge cases: character truncation (46-char and 51-char cutoff limits), duplicate numbering `(1)`, `edited` suffixes, supplemental metadata, and live photo pairings.
- Embeds authentic EXIF, IPTC, and XMP metadata directly into your files.
- Synchronizes OS file system creation and modification timestamps natively.
- **Your files never leave your computer.** Everything executes 100% locally on your machine.

---

## ⚡ Available Editions

TakeoutFix is distributed in two high-performance desktop editions as well as an in-browser Web edition:

| Feature / Edition | **Rust Tauri Edition** (Recommended) | **Java Edition** | **Web Edition** |
|---|---|---|---|
| **Binary** | `TakeoutFix.exe` / `.dmg` / `.AppImage` | `TakeoutFix-Java.exe` / `.dmg` / `.AppImage` | WebAssembly in Browser |
| **Engine** | Native Rust + ZeroPerl WASM / ExifTool | Embedded Multi-Core ExifTool Engine | WebAssembly (Client-side) |
| **UI** | Modern Reactive Dark/Light UI | Desktop Java Swing (FlatLaf) | Modern Astro + React SPA |
| **Size** | Ultra-lightweight (~15–20 MB) | Self-contained jpackage runtime | 0 MB install (Instant) |
| **Network** | 100% Offline Local Processing | 100% Offline Local Processing | 100% Offline Local Processing |

---

## 📥 Download Standalone Binaries

Download directly from the [Releases Page](https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest) or use our fast download links:

### 🦀 Rust Edition (Modern & Lightweight)
- **Windows (x64)**: [`TakeoutFix.exe`](https://takeoutfix-download.takeoutfix.workers.dev/download/windows/rust)
- **macOS (Universal / Apple Silicon & Intel)**: [`TakeoutFix.dmg`](https://takeoutfix-download.takeoutfix.workers.dev/download/mac/rust)
- **Linux (x64)**: [`TakeoutFix.AppImage`](https://takeoutfix-download.takeoutfix.workers.dev/download/linux/rust)

### ☕ Java Edition (Standalone jpackage)
- **Windows (x64)**: [`TakeoutFix-Java.exe`](https://takeoutfix-download.takeoutfix.workers.dev/download/windows/java)
- **macOS (Universal)**: [`TakeoutFix-Java.dmg`](https://takeoutfix-download.takeoutfix.workers.dev/download/mac/java)
- **Linux (x64)**: [`TakeoutFix-Java.AppImage`](https://takeoutfix-download.takeoutfix.workers.dev/download/linux/java)

---

## 🚀 How to Use

1. **Launch TakeoutFix**: Open `TakeoutFix.exe` (or your platform equivalent).
2. **Select Takeout Directory**: Choose the folder where your unzipped Google Takeout archives reside.
3. **Select Output Directory**: Choose where restored, organized media should be placed.
4. **Choose Timestamp Options**: Toggle whether you want to update EXIF metadata, sync file system birth/modification times, or organize files chronologically into `YYYY/MM` folders.
5. **Start Extraction**: Click **Restore My Data** and watch the real-time processing log.

---

## 🛠️ For Developers & Building from Source

### Prerequisites
- **Node.js 20+** and **npm**
- **Rust** (stable toolchain with `cargo`)
- **Java 17+ / 21 JDK** and **Maven** (for Java Edition only)

### 1. Building the Rust Tauri App
```bash
cd webapp
npm install
npm run build
npx @tauri-apps/cli build
```
The compiled standalone executable will be generated at `webapp/src-tauri/target/release/`.

### 2. Building the Web Application Locally
```bash
cd webapp
npm install
npm run dev
```
Open [http://localhost:4321](http://localhost:4321) in your browser.

### 3. Building the Java Desktop App
```bash
cd native
mvn clean package -DskipTests
java -jar target/takeoutfix.jar
```

To package a standalone Windows installer using `jpackage`:
```powershell
powershell -ExecutionPolicy Bypass -File .\build-exe.ps1
```

---

## 🔒 Privacy Guarantee

TakeoutFix was designed with one fundamental principle:
> **Your files are yours. They never leave your device.**

- **Zero Cloud Uploads**: Photos, videos, GPS coordinates, and filenames remain strictly on your local disk.
- **No Tracking of Personal Content**: No analytics or telemetry tracks your photo contents or EXIF data.
- **Open Source & Verifiable**: All source code is publicly auditable on GitHub.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
Google Takeout™ and Google Photos™ are trademarks of Google LLC. TakeoutFix is an independent utility and is not affiliated with, endorsed by, or sponsored by Google LLC.
