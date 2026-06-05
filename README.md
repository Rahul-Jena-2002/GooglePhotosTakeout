<p align="center">
  <img src="icons/icon.png" alt="GT Metadata Merger Logo" width="200"/>
</p>

# 📸 GT Metadata Merger

A privacy-first, completely offline desktop application that restores original "Date Taken" timestamps to your Google Photos Takeout exports. 

When you export your photos from Google Takeout, Google strips the original creation dates from your files and places them inside separate `.json` files. This tool acts as an automated engine that reads those JSON files, perfectly matches them to your photos and videos (handling all of Google's weird naming conventions and character limits), and securely embeds the correct original timestamp back into your media.

### ✨ Features
- **100% Local & Private**: No cloud uploads. Your photos never leave your device.
- **Dynamic Suffix Matching**: Automatically detects dynamically truncated Google Takeout JSON files (e.g., `IMG_2023.jpg.supplem.json`).
- **Native OS File Picker**: Easily browse your local file system using native dialogs.
- **Real-Time Streaming Logs**: Watch the restoration process live in the beautiful React UI.
- **Power Management**: Automatically keeps your computer awake during massive multi-hour extraction processes, and optionally shuts down the PC when finished.

---

## 📥 Download (No Installation Required)

You do not need to install Java or Node.js to run this. Simply download the standalone executable for your operating system:

1. Go to the [Releases Page](../../releases/latest).
2. Download the `.zip` or `.tar.gz` for your operating system (Windows, macOS, or Linux).
3. Extract the folder and run the `GTMetadataMerger` executable inside!

---

## ⚙️ How to Use

1. **Input Folder**: Click "Browse" and select your unzipped Google Takeout folder containing the images and JSON files.
2. **Output Folder**: Select an empty folder where you want the restored photos to be copied.
3. **Takeout Date (Optional)**: If you provide the date you exported the Takeout, the engine will use it to ignore incorrect timestamps injected by Google during the zipping process.
4. **Post-Action**: Choose whether to prevent your computer from sleeping, or auto-shutdown when the 50GB+ process completes.
5. Click **Start Extraction** and watch the logs fly by!

---

## 🛠️ For Developers

Want to contribute or build from source? GT Metadata Merger is a Modular Monolith built with **Spring Boot 3.2 (Java 21)** and **React + Tailwind CSS**.

### Prerequisites
- Java 21 JDK
- Node.js 20+ & npm
- Maven 3.8+

### Running Locally
Because the application is bundled to serve the React frontend natively through Spring Boot, you can build and run the entire stack with one command:

```bash
# Build the React app and package the Spring Boot JAR
mvn clean install -DskipTests

# Run the backend
java -jar target/GTakeout-1.0.0.jar
```
The application will start on `http://localhost:8081` and you can open it in your browser.

### Project Architecture
- `src/main/java/com/rahul/controller`: REST and Native System APIs.
- `src/main/java/com/rahul/service`: Core domain logic (MediaScanner, MetadataMatcher, Dynamic RegEx).
- `frontend/`: React source code, Tailwind configuration, and Vite bundler.
- `.github/workflows/release.yml`: Automated CI/CD pipeline using `jpackage` to generate native binaries.

## ⚠️ Note on Permissions
To use the "Keep Awake" and "Shutdown" features, the application executes system-level shell commands. Ensure you are running the application with the appropriate privileges if those features are blocked by your OS.
