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
  primary: boolean;
  instructions: string[];
}

export default function DownloadPage() {
  const [selectedOS, setSelectedOS] = useState<"win" | "mac" | "linux">("win");
  const [selectedType, setSelectedType] = useState<number>(0);

  const downloadOptions: Record<"win" | "mac" | "linux", DownloadOption[]> = {
    win: [
      {
        title: "Rust Native Edition (.exe)",
        badge: "Rust Native",
        desc: "Single-file direct runnable executable. Instant startup, ultra-lightweight (~10MB), and native Win32 filesystem date synchronization.",
        file: "TakeoutFix.exe",
        url: "https://takeoutfix-download.takeoutfix.workers.dev/download/windows/rust",
        directUrl: "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix.exe",
        primary: true,
        instructions: [
          "Download 'TakeoutFix.exe' directly using the button below.",
          "Double-click 'TakeoutFix.exe' to launch immediately (no folders to extract, zero installation).",
          "Deeply restores EXIF/QuickTime metadata and syncs File Explorer 'Date Modified' directly on disk.",
          "If Windows SmartScreen prompts on first run, click 'More info' and select 'Run anyway'."
        ]
      },
      {
        title: "Java Desktop Edition (.exe)",
        badge: "Java Edition",
        desc: "Single-file direct runnable executable powered by the Java engine. Zero JAR files, zero folder extraction.",
        file: "TakeoutFix-Java.exe",
        url: "https://takeoutfix-download.takeoutfix.workers.dev/download/windows/java",
        directUrl: "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix-Java.exe",
        primary: false,
        instructions: [
          "Download 'TakeoutFix-Java.exe' directly using the button below.",
          "Double-click to run immediately without extracting folders or handling JAR files.",
          "Powered by the multi-threaded Java desktop restoration engine.",
          "100% offline, private, and processes unlimited archives."
        ]
      }
    ],
    mac: [
      {
        title: "Rust Native Edition (.dmg)",
        badge: "Rust Native",
        desc: "Universal direct runnable Apple disk image. Compatible with Apple Silicon (M1/M2/M3/M4) and Intel Macs.",
        file: "TakeoutFix.dmg",
        url: "https://takeoutfix-download.takeoutfix.workers.dev/download/macos/rust",
        directUrl: "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix.dmg",
        primary: true,
        instructions: [
          "Download 'TakeoutFix.dmg' using the button below.",
          "Double-click the DMG and drag TakeoutFix into your Applications folder.",
          "Launch TakeoutFix directly from Launchpad, Spotlight, or Applications.",
          "Zero terminal commands, zero folder extraction, and native macOS date preservation."
        ]
      },
      {
        title: "Java Desktop Edition (.dmg)",
        badge: "Java Edition",
        desc: "Native Apple disk image powered by the Java engine. Zero JAR files, zero setup scripts.",
        file: "TakeoutFix-Java.dmg",
        url: "https://takeoutfix-download.takeoutfix.workers.dev/download/macos/java",
        directUrl: "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix-Java.dmg",
        primary: false,
        instructions: [
          "Download 'TakeoutFix-Java.dmg' using the button below.",
          "Double-click to mount and run directly on macOS.",
          "Clean native app experience without ever touching a raw JAR file.",
          "Supports high-speed multi-core restoration."
        ]
      }
    ],
    linux: [
      {
        title: "Rust Native Edition (.AppImage)",
        badge: "Rust Native",
        desc: "Universal single-file executable. No installation, no extracting folders—just run on any Linux distro.",
        file: "TakeoutFix.AppImage",
        url: "https://takeoutfix-download.takeoutfix.workers.dev/download/linux/rust",
        directUrl: "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix.AppImage",
        primary: true,
        instructions: [
          "Download 'TakeoutFix.AppImage' directly below.",
          "Make it executable: right-click > Properties > Permissions > 'Allow executing file as program' (or run: chmod +x TakeoutFix.AppImage).",
          "Double-click 'TakeoutFix.AppImage' to launch immediately.",
          "Runs natively across Ubuntu, Fedora, Debian, Arch, Mint, and Pop!_OS."
        ]
      },
      {
        title: "Java Desktop Edition (.AppImage)",
        badge: "Java Edition",
        desc: "Direct runnable AppImage powered by the Java engine. Zero JAR files, zero terminal scripts.",
        file: "TakeoutFix-Java.AppImage",
        url: "https://takeoutfix-download.takeoutfix.workers.dev/download/linux/java",
        directUrl: "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix-Java.AppImage",
        primary: false,
        instructions: [
          "Download 'TakeoutFix-Java.AppImage' using the button below.",
          "Make it executable (chmod +x TakeoutFix-Java.AppImage) and double-click to launch.",
          "Self-contained executable bundle with zero JAR dependencies.",
          "Fast local processing for all photo and video formats."
        ]
      }
    ]
  };

  const currentOptions = downloadOptions[selectedOS];
  const activeOption = currentOptions[selectedType] || currentOptions[0];

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
                onClick={() => { setSelectedOS("linux"); setSelectedType(0); }}
                className={`flex-1 min-w-[100px] py-2.5 px-3.5 rounded-xl text-xs md:text-sm font-bold transition-all border text-center flex items-center justify-center gap-2 cursor-pointer ${
                  selectedOS === "linux" 
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-black border-transparent shadow-md"
                    : "bg-zinc-100/80 dark:bg-white/[0.03] border-zinc-200 dark:border-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/60"
                }`}
              >
                <img src="/linux-logo.png" className="w-4 h-4 object-contain flex-shrink-0" alt="" />
                <span>Linux</span>
              </button>
            </div>

            {/* Package Format Selector Pills */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Choose Package Format</span>
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-semibold">{currentOptions.length} formats available</span>
              </div>
              <div className={`grid gap-3 ${currentOptions.length === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}>
                {currentOptions.map((opt, idx) => {
                  const isSelected = selectedType === idx;
                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedType(idx)}
                      className={`p-3.5 rounded-xl border text-left transition-all relative cursor-pointer min-h-[82px] flex flex-col justify-between ${
                        isSelected
                          ? "bg-indigo-50/80 dark:bg-indigo-500/15 border-indigo-500/60 ring-2 ring-indigo-500/20 shadow-sm"
                          : "bg-zinc-50/70 dark:bg-white/[0.02] border-zinc-200 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20 hover:bg-zinc-100/60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className={`text-xs font-bold truncate ${isSelected ? "text-indigo-600 dark:text-indigo-300" : "text-zinc-900 dark:text-white"}`}>
                          {opt.title}
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider flex-shrink-0 ${
                          opt.primary 
                            ? "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30" 
                            : "bg-zinc-200/80 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-300/60 dark:border-white/10"
                        }`}>
                          {opt.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed font-normal">
                        {opt.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Selection Details & Steps */}
            <div className="space-y-4 pt-4 border-t border-zinc-200 dark:border-white/10">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                    {activeOption.title}
                  </h3>
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-300/70 dark:border-white/10 font-mono font-semibold">
                    {activeOption.file}
                  </span>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 font-medium leading-relaxed">{activeOption.desc}</p>
              </div>

              <div className="space-y-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Installation Steps</h4>
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
          <div className="pt-6 mt-6 border-t border-zinc-200 dark:border-white/10 space-y-2">
            <a href={activeOption.url} className="w-full block">
              <button className="w-full h-12 text-sm font-bold rounded-xl flex items-center justify-center gap-2.5 cursor-pointer shadow-lg transition-all bg-zinc-900 hover:bg-black text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-black hover:scale-[1.005] active:scale-[0.995]">
                <Download className="w-4 h-4" /> Download {activeOption.title}
              </button>
            </a>
            <p className="text-[10px] text-center text-zinc-500 dark:text-zinc-400 font-medium">
              {selectedType === 0 
                ? "✓ Verified release · Standalone Native Binary · 100% Offline execution supported" 
                : "✓ Verified release · Bundled Self-Contained JRE · Zero JAR Files · 100% Offline"}
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
                  <td className="p-4">Instant (Zero install required)</td>
                  <td className="p-4 text-zinc-800 dark:text-zinc-200 font-semibold">Direct runnable (Native executable or packaged app - zero extractions, zero .jar files)</td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold text-zinc-900 dark:text-white">Processing Speed</td>
                  <td className="p-4 text-amber-600 dark:text-amber-500/90 font-medium">Standard (Browser throttle limits)</td>
                  <td className="p-4 text-emerald-600 dark:text-emerald-400 font-bold">Native Multithreaded (Fastest)</td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold text-zinc-900 dark:text-white">Ideal Archive Size</td>
                  <td className="p-4">Standard to Large (Up to 50 GB – 100 GB)</td>
                  <td className="p-4 text-zinc-800 dark:text-zinc-200 font-semibold">Massive &amp; Infinite (50 GB to Multi-Terabyte 1 TB+)</td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold text-zinc-900 dark:text-white">Offline Use</td>
                  <td className="p-4 text-rose-500 dark:text-rose-400">No (Requires internet connection)</td>
                  <td className="p-4 text-emerald-600 dark:text-emerald-400 font-bold">Yes (100% Offline with cached activation)</td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold text-zinc-900 dark:text-white">Direct Local EXIF Injection</td>
                  <td className="p-4">Yes (Via virtual files api)</td>
                  <td className="p-4 text-zinc-800 dark:text-zinc-200 font-semibold">Yes (Direct write to physical disk)</td>
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
