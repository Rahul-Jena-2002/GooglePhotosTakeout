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
        title: "Windows Portable (.zip)",
        badge: "Available Now",
        desc: "Standalone zero-install folder. Extract anywhere and launch TakeoutFix.exe immediately.",
        file: "TakeoutFix-Windows-Portable.zip",
        url: "https://takeoutfix-download.takeoutfix.workers.dev/download/windows/portable",
        directUrl: "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix-Windows-Portable.zip",
        primary: true,
        instructions: [
          "Download the 'TakeoutFix-Windows-Portable.zip' archive below.",
          "Right-click the downloaded zip and select 'Extract All...'.",
          "Double-click 'TakeoutFix.exe' in the extracted folder to launch immediately.",
          "Use 'Run-Debug.bat' if you ever need to view real-time console troubleshooting output."
        ]
      },
      {
        title: "Windows Installer (.msi)",
        badge: "Official Setup",
        desc: "Automated Windows installer with Start Menu shortcut and per-user automatic setup.",
        file: "TakeoutFix-Setup.msi",
        url: "https://takeoutfix-download.takeoutfix.workers.dev/download/windows/installer",
        directUrl: "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix-Setup.msi",
        primary: false,
        instructions: [
          "Download the 'TakeoutFix-Setup.msi' installer using the button below.",
          "Double-click to install (runs cleanly per-user without requiring admin prompt).",
          "Launch TakeoutFix directly from your Windows Start Menu or Desktop search.",
          "If Windows SmartScreen prompts on first run, click 'More info' and select 'Run anyway'."
        ]
      }
    ],
    mac: [
      {
        title: "macOS Portable (.zip)",
        badge: "Available Now",
        desc: "Standalone app bundle with zero-certificate launcher script to bypass Gatekeeper quarantine.",
        file: "TakeoutFix-macOS-Portable.zip",
        url: "https://takeoutfix-download.takeoutfix.workers.dev/download/macos/portable",
        directUrl: "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix-macOS-Portable.zip",
        primary: true,
        instructions: [
          "Download and unzip 'TakeoutFix-macOS-Portable.zip'.",
          "Double-click 'Run-TakeoutFix.command' to automatically clear quarantine and start the app.",
          "Or right-click 'TakeoutFix.app' and click 'Open' to confirm macOS security prompt."
        ]
      },
      {
        title: "macOS Installer (.dmg)",
        badge: "Apple Disk Image",
        desc: "Native Apple disk image with Applications folder drag-and-drop installer.",
        file: "TakeoutFix-macOS.dmg",
        url: "https://takeoutfix-download.takeoutfix.workers.dev/download/macos/installer",
        directUrl: "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix-macOS.dmg",
        primary: false,
        instructions: [
          "Download 'TakeoutFix-macOS.dmg' disk image below.",
          "Double-click the DMG file to mount it.",
          "Drag 'TakeoutFix.app' into your Applications folder.",
          "Launch TakeoutFix from Launchpad, Spotlight, or your Applications folder."
        ]
      }
    ],
    linux: [
      {
        title: "Linux Portable (.tar.gz)",
        badge: "Universal Tarball",
        desc: "Standalone compressed archive. Compatible with any modern x86_64 Linux distribution.",
        file: "TakeoutFix-Linux-Portable.tar.gz",
        url: "https://takeoutfix-download.takeoutfix.workers.dev/download/linux/portable",
        directUrl: "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix-Linux-Portable.tar.gz",
        primary: true,
        instructions: [
          "Download and extract: tar -xzf TakeoutFix-Linux-Portable.tar.gz",
          "Navigate into directory: cd TakeoutFix",
          "Launch directly: ./run.sh"
        ]
      },
      {
        title: "Debian / Ubuntu (.deb)",
        badge: "Debian / Ubuntu",
        desc: "Native package for Ubuntu, Debian, Linux Mint, Pop!_OS, and derivatives.",
        file: "TakeoutFix-Linux.deb",
        url: "https://takeoutfix-download.takeoutfix.workers.dev/download/linux/deb",
        directUrl: "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix-Linux.deb",
        primary: false,
        instructions: [
          "Download 'TakeoutFix-Linux.deb' package below.",
          "Install via terminal: sudo dpkg -i TakeoutFix-Linux.deb (or double-click to install via Software Center).",
          "Launch 'TakeoutFix' from your Applications menu."
        ]
      },
      {
        title: "Fedora / RHEL (.rpm)",
        badge: "Fedora / RHEL",
        desc: "Native package for Fedora, Red Hat Enterprise Linux, CentOS, Rocky Linux, and openSUSE.",
        file: "TakeoutFix-Linux.rpm",
        url: "https://takeoutfix-download.takeoutfix.workers.dev/download/linux/rpm",
        directUrl: "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix-Linux.rpm",
        primary: false,
        instructions: [
          "Download 'TakeoutFix-Linux.rpm' package below.",
          "Install via terminal: sudo rpm -i TakeoutFix-Linux.rpm (or sudo dnf install ./TakeoutFix-Linux.rpm).",
          "Launch 'TakeoutFix' from your Applications menu."
        ]
      }
    ]
  };

  const currentOptions = downloadOptions[selectedOS];
  const activeOption = currentOptions[selectedType] || currentOptions[0];

  return (
    <div className="min-h-screen text-zinc-900 dark:text-white relative py-12 px-6">
      {/* Grid container to structure the page */}
      <div className="max-w-6xl mx-auto space-y-16">
        
        {/* Header Block */}
        <div className="text-center space-y-4 max-w-3xl mx-auto pt-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold uppercase tracking-wider shadow-sm">
            <Cpu className="w-3.5 h-3.5" /> High Performance Engine
          </div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight text-zinc-900 dark:text-white">
            TakeoutFix Desktop App
          </h1>
          <p className="text-sm md:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed font-medium">
            Restore thousands of photo dates and GPS location tags 100% locally on your computer. Bypasses browser memory limits, supports multi-threaded speeds, and runs entirely offline.
          </p>
        </div>

        {/* Dynamic Selector Tabs & Download Box */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
          
          {/* Left 3 columns: OS Info and instructions */}
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-white dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 p-6 md:p-8 rounded-2xl shadow-sm dark:shadow-2xl">
              
              {/* Tab headers */}
              <div className="flex border-b border-zinc-200 dark:border-white/10 pb-4 mb-6 justify-between gap-2 overflow-x-auto">
                <button 
                  onClick={() => { setSelectedOS("win"); setSelectedType(0); }}
                  className={`flex-1 min-w-[90px] py-2.5 px-4 rounded-xl text-xs font-bold transition-all border text-center flex items-center justify-center gap-2 ${
                    selectedOS === "win" 
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-black border-transparent shadow-md"
                      : "bg-zinc-100/80 dark:bg-white/[0.03] border-zinc-200 dark:border-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/60"
                  }`}
                >
                  <img src="/windows-logo.png" className="w-3.5 h-3.5 object-contain flex-shrink-0" alt="" />
                  <span>Windows</span>
                </button>
                <button 
                  onClick={() => { setSelectedOS("mac"); setSelectedType(0); }}
                  className={`flex-1 min-w-[90px] py-2.5 px-4 rounded-xl text-xs font-bold transition-all border text-center flex items-center justify-center gap-2 ${
                    selectedOS === "mac" 
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-black border-transparent shadow-md"
                      : "bg-zinc-100/80 dark:bg-white/[0.03] border-zinc-200 dark:border-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/60"
                  }`}
                >
                  {selectedOS === "mac" ? (
                    <img src="/apple-logo-white.png" className="w-3.5 h-3.5 object-contain flex-shrink-0 dark:hidden" alt="" />
                  ) : (
                    <>
                      <img src="/apple-logo-black.png" className="w-3.5 h-3.5 object-contain flex-shrink-0 dark:hidden" alt="" />
                      <img src="/apple-logo-white.png" className="w-3.5 h-3.5 object-contain flex-shrink-0 hidden dark:block" alt="" />
                    </>
                  )}
                  <span>macOS</span>
                </button>
                <button 
                  onClick={() => { setSelectedOS("linux"); setSelectedType(0); }}
                  className={`flex-1 min-w-[90px] py-2.5 px-4 rounded-xl text-xs font-bold transition-all border text-center flex items-center justify-center gap-2 ${
                    selectedOS === "linux" 
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-black border-transparent shadow-md"
                      : "bg-zinc-100/80 dark:bg-white/[0.03] border-zinc-200 dark:border-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/60"
                  }`}
                >
                  <img src="/linux-logo.png" className="w-3.5 h-3.5 object-contain flex-shrink-0" alt="" />
                  <span>Linux</span>
                </button>
              </div>

              {/* Package Format Selector Pills */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Choose Package Format</span>
                  <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">{currentOptions.length} formats available</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {currentOptions.map((opt, idx) => {
                    const isSelected = selectedType === idx;
                    return (
                      <button
                        key={idx}
                        onClick={() => setSelectedType(idx)}
                        className={`p-3.5 rounded-xl border text-left transition-all relative ${
                          isSelected
                            ? "bg-indigo-50/70 dark:bg-indigo-500/10 border-indigo-500/60 ring-2 ring-indigo-500/20 shadow-sm"
                            : "bg-zinc-50/60 dark:bg-white/[0.02] border-zinc-200 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20 hover:bg-zinc-100/50"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`text-xs font-bold ${isSelected ? "text-indigo-600 dark:text-indigo-300" : "text-zinc-900 dark:text-white"}`}>
                            {opt.title}
                          </span>
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                            opt.primary 
                              ? "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30" 
                              : "bg-zinc-200/80 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-300/60 dark:border-white/10"
                          }`}>
                            {opt.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed font-normal">
                          {opt.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active Selection Details & Download Action */}
              <div className="space-y-6 pt-6 border-t border-zinc-200 dark:border-white/10 mt-6">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                      {activeOption.title}
                    </h3>
                    <span className="text-[11px] px-2.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-300/70 dark:border-white/10 font-mono font-semibold">
                      {activeOption.file}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">{activeOption.desc}</p>
                </div>

                <div className="space-y-3">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Installation Steps</h4>
                  <ol className="space-y-2.5 pl-0.5">
                    {activeOption.instructions.map((step, idx) => (
                      <li key={idx} className="flex gap-3 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed font-medium">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-white/10 flex items-center justify-center text-[11px] font-bold text-zinc-700 dark:text-zinc-300 shadow-sm">
                          {idx + 1}
                        </span>
                        <span className="pt-0.5">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="pt-2">
                  <a href={activeOption.url} className="w-full block">
                    <button className="w-full h-12 text-sm font-bold rounded-xl flex items-center justify-center gap-2.5 cursor-pointer shadow-lg transition-all bg-zinc-900 hover:bg-black text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-black hover:scale-[1.005] active:scale-[0.995]">
                      <Download className="w-4 h-4" /> Download {activeOption.title}
                    </button>
                  </a>
                </div>
              </div>

            </div>

            {/* Offline note */}
            <div className="p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl flex gap-3 text-left">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-amber-900 dark:text-amber-400">Offline activation notice</h4>
                <p className="text-[11px] text-amber-900/80 dark:text-amber-200/80 leading-relaxed font-medium">
                  Your upgraded tier limits (Pro/Super) are backed by Firestore and synchronize automatically. If you plan to run the software completely offline, simply log in to your account once while connected to the internet. The app securely caches your active plan thresholds locally, enabling unlimited offline use!
                </p>
              </div>
            </div>
          </div>

          {/* Right 2 columns: Desktop app advantages */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Advantages block */}
            <div className="bg-white dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 p-6 rounded-2xl space-y-5 shadow-sm dark:shadow-2xl">
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-400">Why Desktop App?</h3>
              
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 mt-0.5">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-zinc-900 dark:text-white">10x Faster Processing</h4>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 leading-relaxed">Uses native multi-threading and asynchronous background workers. Processes large archives in minutes rather than hours.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 mt-0.5">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-zinc-900 dark:text-white">Infinite Size Limits</h4>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 leading-relaxed">No browser memory block constraints. Confidently restore large Google Takeout archives from 50GB up to 500GB+.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 mt-0.5">
                    <WifiOff className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-zinc-900 dark:text-white">100% Offline Capability</h4>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 leading-relaxed">Runs entirely locally without any network connection. Perfect for users with slow or metered internet lines.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 mt-0.5">
                    <HardDrive className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-zinc-900 dark:text-white">Direct Drive Integration</h4>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 leading-relaxed">Bypasses browser sandboxes to read/write directories and ZIP archives directly on your hard drive or external disk.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Tech Requirements */}
            <div className="bg-white dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 p-6 rounded-2xl space-y-3 shadow-sm dark:shadow-2xl">
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-400 flex items-center gap-1.5">
                <Terminal className="w-4 h-4" /> System Specs
              </h3>
              <ul className="space-y-2 text-xs text-zinc-700 dark:text-zinc-300 font-medium">
                <li className="flex justify-between border-b border-zinc-200 dark:border-white/10 pb-2">
                  <span className="text-zinc-500 dark:text-zinc-400">Java Version</span>
                  <span className="font-semibold text-zinc-900 dark:text-white">Java 21 JRE (Bundled inside)</span>
                </li>
                <li className="flex justify-between border-b border-zinc-200 dark:border-white/10 pb-2">
                  <span className="text-zinc-500 dark:text-zinc-400">Memory (RAM)</span>
                  <span className="font-semibold text-zinc-900 dark:text-white">4 GB Minimum (8 GB Recommended)</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-zinc-500 dark:text-zinc-400">Free Space</span>
                  <span className="font-semibold text-zinc-900 dark:text-white">~120 MB for installation</span>
                </li>
              </ul>
            </div>

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
                  <td className="p-4">Instant (Zero install required)</td>
                  <td className="p-4 text-zinc-800 dark:text-zinc-200 font-semibold">Requires download (No install needed)</td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold text-zinc-900 dark:text-white">Processing Speed</td>
                  <td className="p-4 text-amber-600 dark:text-amber-500/90 font-medium">Standard (Browser throttle limits)</td>
                  <td className="p-4 text-emerald-600 dark:text-emerald-400 font-bold">Native Multithreaded (Fastest)</td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold text-zinc-900 dark:text-white">Ideal Archive Size</td>
                  <td className="p-4">Small archives (&lt; 20 GB)</td>
                  <td className="p-4 text-zinc-800 dark:text-zinc-200 font-semibold">Infinite size (50 GB to 1 TB+)</td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold text-zinc-900 dark:text-white">Offline Use</td>
                  <td className="p-4 text-rose-500 dark:text-rose-400">No (Requires server sync)</td>
                  <td className="p-4 text-emerald-600 dark:text-emerald-400 font-bold">Yes (100% Offline supported)</td>
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
