# 📸 Google Takeout Metadata Restorer

A modern, minimalistic web application to restore "Date Taken" timestamps to Google Photos exports. It parses Google's JSON metadata and applies the correct timestamps directly to the files on your filesystem.

## 🚀 Architecture
- **Backend**: Spring Boot 3.2 (Java 21)
- **Frontend**: React + TypeScript + Tailwind CSS
- **Real-time**: WebSockets (STOMP/SockJS) for live log streaming and progress tracking.
- **Pattern**: Modular Monolith (Separated Domain, Service, and API layers).

## 🛠️ Prerequisites
- **Java 21 JDK**
- **Maven 3.8+**
- **Node.js 18+ & npm**

## 🏁 Getting Started

### 1. Backend Setup (Spring Boot)
```bash
# Navigate to project root
mvn clean install

# Run the application
mvn spring-boot:run
```
The backend will start on `http://localhost:8080`.

### 2. Frontend Setup (React)
```bash
# Navigate to the frontend directory
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```
The UI will be available at `http://localhost:5173`.

## ⚙️ How to Use
1. **Input Folder**: Provide the absolute path to your Google Takeout media folder.
2. **Output Folder**: Provide the path where you want the processed files to be saved.
3. **Takeout Date**: (Optional) Provide the date you requested the takeout. This helps the app ignore timestamps created by Google during the export process.
4. **Post-Action**: Choose whether to just keep the screen awake or shut down the computer automatically upon completion.

## ⚠️ System Permissions
Because this application interacts with the filesystem and system power controls:
- **Filesystem**: The user running the backend must have read/write permissions for both input and output folders.
- **Power Management**: To use the "Keep Awake" and "Shutdown" features, the application must be run with **Administrative/Sudo privileges**, as it executes system-level shell commands (`shutdown` on Windows/Linux, `osascript` on macOS).

## 📂 Project Structure
- `src/main/java/com/rahul/config`: WebSocket and security configurations.
- `src/main/java/com/rahul/controller`: REST API endpoints.
- `src/main/java/com/rahul/service`: Core domain logic (MediaScanner, MetadataMatcher, etc.).
- `frontend/`: React source code and Tailwind CSS configuration.
