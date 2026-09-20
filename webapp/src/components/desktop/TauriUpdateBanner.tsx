import { useEffect, useState } from "react";
import { Download, RefreshCw, X, Sparkles } from "lucide-react";

export default function TauriUpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState<any>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [statusText, setStatusText] = useState("");

  useEffect(() => {
    // Only execute when running inside Tauri desktop environment
    if (typeof window === "undefined") return;
    const isTauri = Boolean(
      (window as any).__TAURI_INTERNALS__ || 
      (window as any).__TAURI__
    );
    if (!isTauri) return;

    let mounted = true;

    async function checkForUpdates() {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (mounted && update?.available) {
          setUpdateAvailable(update);
        }
      } catch (err) {
        console.debug("Tauri update check:", err);
      }
    }

    // Check quietly 3 seconds after application launch
    const timer = setTimeout(checkForUpdates, 3000);
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, []);

  if (!updateAvailable || dismissed) return null;

  const handleInstall = async () => {
    try {
      setDownloading(true);
      setStatusText("Downloading update...");
      let downloadedBytes = 0;
      let totalBytes = 0;

      await updateAvailable.downloadAndInstall((event: any) => {
        if (event.event === "Started") {
          totalBytes = event.data.contentLength || 0;
        } else if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes > 0) {
            setDownloadProgress(Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)));
          }
        } else if (event.event === "Finished") {
          setStatusText("Restarting app...");
        }
      });

      // Reload or notify user to restart
      setStatusText("Update installed! Restarting...");
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      console.error("Failed to install update:", err);
      setStatusText(`Update failed: ${err?.message || "Network error"}`);
      setDownloading(false);
    }
  };

  return (
    <div className="w-full bg-gradient-to-r from-indigo-900/90 via-purple-900/90 to-indigo-900/90 border-b border-indigo-500/30 text-white px-4 py-2.5 flex items-center justify-between text-xs z-50 animate-in fade-in slide-in-from-top duration-300">
      <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-4">
        <span className="p-1 rounded-md bg-indigo-500/20 text-indigo-300 flex-shrink-0">
          <Sparkles className="w-3.5 h-3.5" />
        </span>
        <span className="font-semibold truncate">
          TakeoutFix v{updateAvailable.version} is available!
        </span>
        {statusText && (
          <span className="text-[11px] text-indigo-200 hidden sm:inline">
            ({statusText} {downloadProgress > 0 && downloading ? `${downloadProgress}%` : ""})
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleInstall}
          disabled={downloading}
          className="px-3 py-1 bg-white text-zinc-950 hover:bg-zinc-100 font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
        >
          {downloading ? (
            <>
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>{downloadProgress > 0 ? `${downloadProgress}%` : "Updating..."}</span>
            </>
          ) : (
            <>
              <Download className="w-3 h-3" />
              <span>Update Now</span>
            </>
          )}
        </button>
        {!downloading && (
          <button
            onClick={() => setDismissed(true)}
            className="p-1 text-zinc-400 hover:text-white rounded-md transition-colors cursor-pointer"
            title="Dismiss update"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
