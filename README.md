<p align="center">
  <img src="native/icons/icon.png" alt="TakeoutFix Logo" width="160"/>
</p>

# 📸 TakeoutFix

A privacy-first, ultra-fast native desktop application that restores original "Date Taken" EXIF timestamps, GPS coordinates, and camera metadata to your Google Photos Takeout archives.

When you export your photos from Google Takeout, Google strips the original creation dates from your files and places them inside separate `.json` files. TakeoutFix reads those JSON sidecar files, matches them to your photos and videos (handling Google's character truncation, duplicate numbering, and edited suffixes), and embeds the authentic metadata directly back into your media files.

### ✨ Features
- **100% Local & Private**: No cloud uploads. Your photos and videos never leave your computer.
- **Embedded Multi-Core ExifTool Engine**: Dynamically manages parallel ExifTool workers utilizing up to 80% of your CPU cores.
- **Smart Timestamp & GPS Restoration**: Restores Date Taken, digitized date, GPS geolocation, and camera model tags.
- **Native OS File Dialogs**: Seamless local folder navigation.
- **Lightweight Native Desktop Core**: Pure Java Swing interface with FlatLaf styling—boots in < 300ms with zero background port listeners.
- **Power Management**: Prevents system sleep during long restorations, with optional auto-shutdown upon completion.

---

## 📥 Download (No Installation Required)

Download the standalone package for your operating system:

1. Go to the [Releases Page](../../releases/latest).
2. Download the package for your OS:
   - **Windows**: `TakeoutFix-Setup.msi` (Installer) or `TakeoutFix-Windows-Portable.zip` (Portable)
   - **macOS**: `TakeoutFix-macOS.dmg` or `TakeoutFix-macOS-Portable.zip`
   - **Linux**: `TakeoutFix-Linux.deb`, `TakeoutFix-Linux.rpm`, or `TakeoutFix-Linux-Portable.tar.gz`
3. Launch `TakeoutFix` and start restoring!

---

## ⚙️ How to Use

1. **Source**: Select your unzipped Google Takeout folder or archive containing your photos and JSON files.
2. **Destination**: Select an output folder where restored photos and videos will be saved.
3. **Takeout Export Date (Optional)**: Provide your takeout export date so the engine can safely discard artificial zip timestamps.
4. Click **Start Extraction** and monitor real-time progress in the operations log.

---

## 🛠️ For Developers

### Prerequisites
- Java 17+ JDK
- Maven 3.8+
- Node.js 20+ (for web landing page)

### Building the Native Desktop App
```bash
cd native
mvn clean package -DskipTests
java -jar target/takeoutfix.jar
```

### Packaging Native Installers Locally
```powershell
# Windows EXE installer via jpackage
powershell -ExecutionPolicy Bypass -File .\build-exe.ps1
```
