import React, { useState } from "react";
import { 
  Download, 
  ShieldCheck, 
  Cpu, 
  WifiOff, 
  HardDrive, 
  Terminal, 
  AlertCircle
} from "lucide-react";
import AdUnit from "../../components/monetization/AdUnit";

interface DownloadOption {
  title: string;
  badge: string;
  desc: string;
  file: string;
  url: string;
  directUrl: string;
  instructions: string[];
}

export default function DownloadPage() {
  const [selectedOS, setSelectedOS] = useState<"win" | "mac" | "linux" | "android">("win");

  const downloadOptions: Record<"win" | "mac" | "linux" | "android", DownloadOption> = {
    win: {
      title: "TakeoutFix for Windows",
      badge: "Windows 10 & 11",
      desc: "Fast, single-file desktop app. Double-click to run immediately with zero installation required.",
      file: "TakeoutFix.exe",
      url: "https://takeoutfix-download.takeoutfix.workers.dev/download/windows/rust",
      directUrl: "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix.exe",
      instructions: [
        "Click the download button below to get 'TakeoutFix.exe'.",
        "Double-click 'TakeoutFix.exe' in your Downloads folder to open it.",
        "Select your unzipped Google Takeout folder to automatically restore all photo dates and locations."
      ]
    },
    mac: {
      title: "TakeoutFix for Mac",
      badge: "Apple Silicon & Intel",
      desc: "Universal Mac app compatible with all modern macOS versions and M-series or Intel chips.",
      file: "TakeoutFix.dmg",
      url: "https://takeoutfix-download.takeoutfix.workers.dev/download/macos/rust",
      directUrl: "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix.dmg",
      instructions: [
        "Download 'TakeoutFix.dmg' using the button below.",
        "Double-click the downloaded DMG file and drag TakeoutFix into your Applications folder.",
        "Launch TakeoutFix from your Applications folder or Spotlight search."
      ]
    },
    linux: {
      title: "TakeoutFix for Linux",
      badge: "Ubuntu, Fedora, Mint",
      desc: "Universal self-contained AppImage. Double-click to run on any major Linux distribution.",
      file: "TakeoutFix.AppImage",
      url: "https://takeoutfix-download.takeoutfix.workers.dev/download/linux/rust",
      directUrl: "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix.AppImage",
      instructions: [
        "Download 'TakeoutFix.AppImage' using the button below.",
        "Right-click the file > Properties > Permissions > check 'Allow executing file as program'.",
        "Double-click 'TakeoutFix.AppImage' to run."
      ]
    },
    android: {
      title: "TakeoutFix for Android",
      badge: "Android 8.0+",
      desc: "Native mobile APK. Install directly on your phone or tablet to restore metadata on the go.",
      file: "TakeoutFix.apk",
      url: "https://takeoutfix-download.takeoutfix.workers.dev/download/android",
      directUrl: "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix.apk",
      instructions: [
        "Tap the download button below to get 'TakeoutFix.apk'.",
        "Tap the downloaded APK file in your notifications or Downloads folder.",
        "If prompted, allow 'Install from unknown sources' for your browser, then tap Install."
      ]
    }
  };

  const activeOption = downloadOptions[selectedOS];

  return (
    <div className="min-h-screen text-zinc-900 dark:text-white relative py-12 px-4 sm:px-6">
      {/* Container aligned with max-w-4xl to match other pages like Guides */}
      <div className="w-full max-w-4xl mx-auto space-y-12">
        
        {/* Header Block */}
        <div className="text-center space-y-4 max-w-3xl mx-auto pt-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-wider shadow-xs">
            <ShieldCheck className="w-3.5 h-3.5" /> 100% Free Desktop Restoration Engine
          </div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight text-zinc-900 dark:text-white">
            TakeoutFix Desktop App
          </h1>
          <p className="text-sm md:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed font-medium">
            Restore unlimited photo dates and GPS location tags 100% free on your computer. Bypasses browser memory limits, processes massive 500GB+ libraries at native multi-threaded disk speeds, and runs entirely offline.
          </p>
        </div>

        {/* 1. TOP: Main Downloads Card (Full Width) */}
        <div className="bg-white dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 p-6 md:p-8 rounded-2xl shadow-sm dark:shadow-2xl flex flex-col justify-between">
          <div className="space-y-6">
            {/* Tab headers */}
            <div className="flex border-b border-zinc-200 dark:border-white/10 pb-4 justify-between gap-2.5 overflow-x-auto">
              <button 
                onClick={() => { setSelectedOS("win"); setSelectedType(0); }}
                className={`flex-1 min-w-[100px] py-2.5 px-3.5 rounded-xl text-xs md:text-sm font-bold transition-all border text-center flex items-center justify-center gap-2 cursor-pointer ${
                  selectedOS === "win" 
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-black border-transparent shadow-md"
                    : "bg-zinc-100/80 dark:bg-white/[0.03] border-zinc-200 dark:border-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/60"
                }`}
              >
                <img src="/windows-logo.png" className="w-4 h-4 object-contain flex-shrink-0" alt="" />
                <span>Windows</span>
              </button>
              <button 
                onClick={() => { setSelectedOS("mac"); setSelectedType(0); }}
                className={`flex-1 min-w-[100px] py-2.5 px-3.5 rounded-xl text-xs md:text-sm font-bold transition-all border text-center flex items-center justify-center gap-2 cursor-pointer ${
                  selectedOS === "mac" 
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-black border-transparent shadow-md"
                    : "bg-zinc-100/80 dark:bg-white/[0.03] border-zinc-200 dark:border-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/60"
                }`}
              >
                {selectedOS === "mac" ? (
                  <img src="/apple-logo-white.png" className="w-4 h-4 object-contain flex-shrink-0 dark:hidden" alt="" />
                ) : (
                  <>
                    <img src="/apple-logo-black.png" className="w-4 h-4 object-contain flex-shrink-0 dark:hidden" alt="" />
                    <img src="/apple-logo-white.png" className="w-4 h-4 object-contain flex-shrink-0 hidden dark:block" alt="" />
                  </>
                )}
                <span>macOS</span>
              </button>
              <button 
                onClick={() => { setSelectedOS("linux"); }}
                className={`flex-1 min-w-[100px] py-2.5 px-3.5 rounded-xl text-xs md:text-sm font-bold transition-all border text-center flex items-center justify-center gap-2 cursor-pointer ${
                  selectedOS === "linux" 
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-black border-transparent shadow-md"
                    : "bg-zinc-100/80 dark:bg-white/[0.03] border-zinc-200 dark:border-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/60"
                }`}
              >
                <img src="/linux-logo.png" className="w-4 h-4 object-contain flex-shrink-0" alt="" />
                <span>Linux</span>
              </button>
              <button 
                onClick={() => { setSelectedOS("android"); }}
                className={`flex-1 min-w-[100px] py-2.5 px-3.5 rounded-xl text-xs md:text-sm font-bold transition-all border text-center flex items-center justify-center gap-2 cursor-pointer ${
                  selectedOS === "android" 
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-black border-transparent shadow-md"
                    : "bg-zinc-100/80 dark:bg-white/[0.03] border-zinc-200 dark:border-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/60"
                }`}
              >
                <img src="/android-logo.png" className="w-4 h-4 object-contain flex-shrink-0" alt="" />
                <span>Android</span>
              </button>
            </div>

            {/* Direct OS Selection Card Details */}
            <div className="space-y-5 pt-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-white">
                    {activeOption.title}
                  </h3>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/20 font-bold uppercase tracking-wider">
                    {activeOption.badge}
                  </span>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-mono font-medium">
                  {activeOption.file}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 font-medium leading-relaxed">
                {activeOption.desc}
              </p>

              <div className="space-y-3 pt-2">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Quick Setup</h4>
                <ol className="space-y-2.5 pl-0.5">
                  {activeOption.instructions.map((step, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed font-medium">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 flex items-center justify-center text-[10px] font-bold text-zinc-600 dark:text-zinc-400 mt-0.5 shadow-xs">
                        {idx + 1}
                      </span>
                      <span className="flex-1 pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>

          {/* Download Button Action */}
          <div className="pt-6 mt-6 border-t border-zinc-200 dark:border-white/10 space-y-2.5">
            <a href={activeOption.url} className="w-full block">
              <button className="w-full h-14 text-sm font-bold rounded-xl flex items-center justify-center gap-2.5 cursor-pointer shadow-lg transition-all bg-zinc-900 hover:bg-black text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-black hover:scale-[1.005] active:scale-[0.995]">
                <Download className="w-4 h-4" /> Download {activeOption.title}
              </button>
            </a>
            <p className="text-[11px] text-center text-zinc-500 dark:text-zinc-400 font-medium">
              ✓ Verified release · 100% Offline execution · Direct single-file download
            </p>
          </div>
        </div>

        {/* Ad directly below downloads div */}
        <div className="w-full max-w-xl mx-auto -mt-4 mb-2">
          <AdUnit placement="DOWNLOAD_TOP" type="compact" />
        </div>

        {/* 2. BELOW: Why Desktop App? (2x2 Grid) */}
        <div className="bg-white dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 p-6 md:p-8 rounded-2xl space-y-6 shadow-sm dark:shadow-2xl">
          <div className="flex items-center justify-between border-b border-zinc-200 dark:border-white/10 pb-3">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">Why Desktop App?</h3>
            <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
              Engineered for Massive Google Takeout Libraries
            </span>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-zinc-50/60 dark:bg-white/[0.02] border border-zinc-200/60 dark:border-white/5">
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-zinc-900 dark:text-white">10x Faster Processing</h4>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 leading-relaxed">Uses native multi-threading and asynchronous background workers. Processes large archives in minutes rather than hours.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-zinc-50/60 dark:bg-white/[0.02] border border-zinc-200/60 dark:border-white/5">
              <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-zinc-900 dark:text-white">Infinite Size Limits</h4>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 leading-relaxed">No browser memory constraints. Confidently restore large Google Takeout archives from 50GB up to 1TB+.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-zinc-50/60 dark:bg-white/[0.02] border border-zinc-200/60 dark:border-white/5">
              <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0">
                <WifiOff className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-zinc-900 dark:text-white">100% Offline Capability</h4>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 leading-relaxed">Runs entirely locally without any network connection. Perfect for users with slow or metered internet lines.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-zinc-50/60 dark:bg-white/[0.02] border border-zinc-200/60 dark:border-white/5">
              <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 mt-0.5 shrink-0">
                <HardDrive className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-zinc-900 dark:text-white">Direct Drive Integration</h4>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 leading-relaxed">Bypasses browser sandboxes to read/write directories and ZIP archives directly on your hard drive or external disk.</p>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Tech Requirements (System Specs Horizontal Pills) */}
        <div className="bg-white dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 p-6 rounded-2xl shadow-sm dark:shadow-2xl space-y-3.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-400 flex items-center gap-1.5">
            <Terminal className="w-4 h-4" /> System Specs
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs text-zinc-700 dark:text-zinc-300 font-medium">
            <div className="p-3.5 rounded-xl bg-zinc-50/60 dark:bg-white/[0.02] border border-zinc-200/60 dark:border-white/5 space-y-1">
              <span className="text-zinc-500 dark:text-zinc-400 text-[11px] block">Runtime Requirements</span>
              <span className="font-semibold text-zinc-900 dark:text-white block">Self-Contained (Zero dependencies needed)</span>
            </div>
            <div className="p-3.5 rounded-xl bg-zinc-50/60 dark:bg-white/[0.02] border border-zinc-200/60 dark:border-white/5 space-y-1">
              <span className="text-zinc-500 dark:text-zinc-400 text-[11px] block">Memory (RAM)</span>
              <span className="font-semibold text-zinc-900 dark:text-white block">4 GB Minimum (8 GB Recommended)</span>
            </div>
            <div className="p-3.5 rounded-xl bg-zinc-50/60 dark:bg-white/[0.02] border border-zinc-200/60 dark:border-white/5 space-y-1">
              <span className="text-zinc-500 dark:text-zinc-400 text-[11px] block">Free Space</span>
              <span className="font-semibold text-zinc-900 dark:text-white block">~120 MB for installation</span>
            </div>
          </div>
        </div>

        {/* Ad directly below system specs */}
        <div className="w-full max-w-xl mx-auto -mt-4 mb-2">
          <AdUnit placement="DOWNLOAD_BOTTOM" type="compact" />
        </div>

        {/* Windows Security Notice */}
        <div className="bg-white dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 p-6 rounded-2xl shadow-sm dark:shadow-2xl space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Code Signing &amp; Verification</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Authenticode certificate and release integrity</p>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed space-y-2">
            <p className="font-medium text-zinc-900 dark:text-white">
              Free code signing provided by <a href="https://signpath.io" target="_blank" rel="noopener noreferrer" className="underline font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500">SignPath.io</a>, certificate by <a href="https://signpath.org" target="_blank" rel="noopener noreferrer" className="underline font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500">SignPath Foundation</a>.
            </p>
            <p className="text-zinc-500 dark:text-zinc-400">
              Windows releases of TakeoutFix are code signed using the SignPath Foundation. Unsigned or newly published release builds may display a standard security notice in Windows Smart App Control while publisher cloud reputation is established.
            </p>
          </div>
        </div>

        {/* Feature Comparison Table */}
        <div className="space-y-4">
          <div className="text-center space-y-1.5">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Compare Browser vs. Desktop</h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">See which platform fits your Google Takeout archive size best</p>
          </div>

          <div className="overflow-x-auto border border-zinc-200 dark:border-white/10 rounded-2xl bg-white dark:bg-zinc-950/20 shadow-sm">
            <table className="w-full text-xs text-zinc-600 dark:text-zinc-400 border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.02] text-left text-zinc-900 dark:text-zinc-300 font-bold">
                  <th className="p-4">Feature</th>
                  <th className="p-4">🌐 Web Browser Tool</th>
                  <th className="p-4 text-indigo-600 dark:text-indigo-400">💻 Desktop Standalone App</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:border-white/10 font-medium">
                <tr>
                  <td className="p-4 font-semibold text-zinc-900 dark:text-white">Installation</td>
                  <td className="p-4">Instant (Open directly in browser)</td>
                  <td className="p-4 text-zinc-800 dark:text-zinc-200 font-semibold">One-click app (Double-click and run, zero setup)</td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold text-zinc-900 dark:text-white">Processing Speed</td>
                  <td className="p-4 text-amber-600 dark:text-amber-500/90 font-medium">Standard (Fast browser processing)</td>
                  <td className="p-4 text-emerald-600 dark:text-emerald-400 font-bold">Native Speed (Fastest disk processing)</td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold text-zinc-900 dark:text-white">Ideal Archive Size</td>
                  <td className="p-4">Standard to Large (Up to 50 GB – 100 GB)</td>
                  <td className="p-4 text-zinc-800 dark:text-zinc-200 font-semibold">Massive libraries (50 GB to Multi-Terabyte 1 TB+)</td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold text-zinc-900 dark:text-white">Offline Use</td>
                  <td className="p-4 text-rose-500 dark:text-rose-400">No (Requires internet connection)</td>
                  <td className="p-4 text-emerald-600 dark:text-emerald-400 font-bold">Yes (100% Offline on your computer)</td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold text-zinc-900 dark:text-white">Fixes Dates on Physical Drive</td>
                  <td className="p-4">Downloads repaired ZIP archives</td>
                  <td className="p-4 text-zinc-800 dark:text-zinc-200 font-semibold">Directly updates your files in place</td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold text-zinc-900 dark:text-white">System Standby Prevention</td>
                  <td className="p-4 text-rose-500 dark:text-rose-400">No</td>
                  <td className="p-4 text-emerald-600 dark:text-emerald-400 font-bold">Yes (Includes Auto-Wake lock)</td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold text-zinc-900 dark:text-white">Auto PC Shutdown</td>
                  <td className="p-4 text-rose-500 dark:text-rose-400">No</td>
                  <td className="p-4 text-emerald-600 dark:text-emerald-400 font-bold">Yes (Optional post-action)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
