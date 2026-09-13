import React, { useState } from "react";
import { 
  Download, 
  ShieldCheck, 
  Cpu, 
  WifiOff, 
  HardDrive, 
  Terminal, 
  CheckCircle2, 
  ArrowRight,
  Info,
  Server,
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
        title: "Windows Installer (.msi)",
        badge: "Recommended",
        desc: "Official Windows installer with Start Menu shortcut and per-user automatic setup.",
        file: "TakeoutFix-Setup.msi",
        url: "https://takeoutfix-download.takeoutfix.workers.dev/download/windows/installer",
        directUrl: "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix-Setup.msi",
        primary: true,
        instructions: [
          "Download the 'TakeoutFix-Setup.msi' installer using the button below.",
          "Double-click to install (runs cleanly per-user without requiring admin administrator prompt).",
          "Launch TakeoutFix directly from your Windows Start Menu or Desktop search.",
          "If Windows SmartScreen prompts on first run, click 'More info' and select 'Run anyway'."
        ]
      },
      {
        title: "Windows Portable (.zip)",
        badge: "Portable / Zero-Install",
        desc: "Standalone folder. Extract anywhere and launch immediately without installing anything.",
        file: "TakeoutFix-Windows-Portable.zip",
        url: "https://takeoutfix-download.takeoutfix.workers.dev/download/windows/portable",
        directUrl: "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix-Windows-Portable.zip",
        primary: false,
        instructions: [
          "Download the 'TakeoutFix-Windows-Portable.zip' archive below.",
          "Right-click the zip and select 'Extract All...'.",
          "Double-click 'TakeoutFix.exe' in the extracted folder to launch immediately.",
          "Use 'Run-Debug.bat' if you ever need to view real-time troubleshooting terminal output."
        ]
      }
    ],
    mac: [
      {
        title: "macOS Installer (.dmg)",
        badge: "Recommended",
        desc: "Native Apple disk image with Applications folder drag-and-drop installer.",
        file: "TakeoutFix-macOS.dmg",
        url: "https://takeoutfix-download.takeoutfix.workers.dev/download/macos/installer",
        directUrl: "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix-macOS.dmg",
        primary: true,
        instructions: [
          "Download 'TakeoutFix-macOS.dmg' disk image below.",
          "Double-click the DMG file to mount it.",
          "Drag 'TakeoutFix.app' into your Applications folder.",
          "Launch TakeoutFix from Launchpad, Spotlight, or your Applications folder."
        ]
      },
      {
        title: "macOS Portable (.zip)",
        badge: "Portable / Zero-Install",
        desc: "Standalone app bundle with zero-certificate launcher script to bypass Gatekeeper quarantine.",
        file: "TakeoutFix-macOS-Portable.zip",
        url: "https://takeoutfix-download.takeoutfix.workers.dev/download/macos/portable",
        directUrl: "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix-macOS-Portable.zip",
        primary: false,
        instructions: [
          "Download and unzip 'TakeoutFix-macOS-Portable.zip'.",
          "Double-click 'Run-TakeoutFix.command' to automatically clear quarantine and start the app.",
          "Or right-click 'TakeoutFix.app' and click 'Open' to confirm macOS security prompt."
        ]
      }
    ],
    linux: [
      {
        title: "Debian / Ubuntu (.deb)",
        badge: "Debian / Ubuntu",
        desc: "Native package for Ubuntu, Debian, Linux Mint, Pop!_OS, and derivatives.",
        file: "TakeoutFix-Linux.deb",
        url: "https://takeoutfix-download.takeoutfix.workers.dev/download/linux/deb",
        directUrl: "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix-Linux.deb",
        primary: true,
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
      },
      {
        title: "Linux Portable (.tar.gz)",
        badge: "Portable / Tarball",
        desc: "Standalone compressed archive. Compatible with any modern x86_64 Linux distribution.",
        file: "TakeoutFix-Linux-Portable.tar.gz",
        url: "https://takeoutfix-download.takeoutfix.workers.dev/download/linux/portable",
        directUrl: "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix-Linux-Portable.tar.gz",
        primary: false,
        instructions: [
          "Download and extract: tar -xzf TakeoutFix-Linux-Portable.tar.gz",
          "Navigate into directory: cd TakeoutFix",
          "Launch directly: ./run.sh"
        ]
      }
    ]
  };

  const currentOptions = downloadOptions[selectedOS];
  const activeOption = currentOptions[selectedType] || currentOptions[0];

  return (
    <div className="min-h-screen text-white relative py-12 px-6">
      {/* Grid container to structure the page */}
      <div className="max-w-6xl mx-auto space-y-16">
        
        {/* Header Block */}
        <div className="text-center space-y-4 max-w-3xl mx-auto pt-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 text-[10px] font-bold uppercase tracking-wider">
            <Cpu className="w-3.5 h-3.5" /> High Performance Engine
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-none bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
            TakeoutFix Desktop App
          </h1>
          <p className="text-sm md:text-base text-zinc-400 leading-relaxed font-medium">
            Restore thousands of photo dates and GPS location tags 100% locally on your computer. Bypasses browser memory limits, supports multi-threaded speeds, and runs entirely offline.
          </p>
        </div>

        {/* Dynamic Selector Tabs & Download Box */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
          
          {/* Left 3 columns: OS Info and instructions */}
          <div className="lg:col-span-3 space-y-6">
            <div className="glass-card p-6 md:p-8 rounded-2xl border border-white/5 bg-zinc-950/40">
              
              {/* Tab headers */}
              <div className="flex border-b border-white/5 pb-4 mb-6 justify-between gap-2 overflow-x-auto">
                <button 
                  onClick={() => { setSelectedOS("win"); setSelectedType(0); }}
                  className={`flex-1 min-w-[90px] py-2.5 px-4 rounded-xl text-xs font-bold transition-all border text-center flex items-center justify-center gap-1.5 ${
                    selectedOS === "win" 
                      ? "bg-white text-black border-transparent shadow-md"
                      : "bg-white/[0.02] border-white/5 text-zinc-400 hover:text-white"
                  }`}
                >
                  <img src="/windows-logo.png" className="w-3.5 h-3.5 object-contain flex-shrink-0" alt="" />
                  <span>Windows</span>
                </button>
                <button 
                  onClick={() => { setSelectedOS("mac"); setSelectedType(0); }}
                  className={`flex-1 min-w-[90px] py-2.5 px-4 rounded-xl text-xs font-bold transition-all border text-center flex items-center justify-center gap-1.5 ${
                    selectedOS === "mac" 
                      ? "bg-white text-black border-transparent shadow-md"
                      : "bg-white/[0.02] border-white/5 text-zinc-400 hover:text-white"
                  }`}
                >
                  {selectedOS === "mac" ? (
                    <img src="/apple-logo-black.png" className="w-3.5 h-3.5 object-contain flex-shrink-0" alt="" />
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
                  className={`flex-1 min-w-[90px] py-2.5 px-4 rounded-xl text-xs font-bold transition-all border text-center flex items-center justify-center gap-1.5 ${
                    selectedOS === "linux" 
                      ? "bg-white text-black border-transparent shadow-md"
                      : "bg-white/[0.02] border-white/5 text-zinc-400 hover:text-white"
                  }`}
                >
                  <img src="/linux-logo.png" className="w-3.5 h-3.5 object-contain flex-shrink-0" alt="" />
                  <span>Linux</span>
                </button>
              </div>

              {/* Package Format Selector Pills */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Choose Package Format</span>
                  <span className="text-[10px] text-zinc-500">{currentOptions.length} format{currentOptions.length > 1 ? 's' : ''} available</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {currentOptions.map((opt, idx) => {
                    const isSelected = selectedType === idx;
                    return (
                      <button
                        key={idx}
                        onClick={() => setSelectedType(idx)}
                        className={`p-3 rounded-xl border text-left transition-all relative ${
                          isSelected
                            ? "bg-indigo-500/10 border-indigo-500/40 text-white shadow-sm ring-1 ring-indigo-500/20"
                            : "bg-white/[0.02] border-white/5 text-zinc-400 hover:border-white/10 hover:text-zinc-200"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-bold ${isSelected ? "text-indigo-300" : "text-white"}`}>{opt.title}</span>
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                            opt.primary 
                              ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" 
                              : "bg-zinc-800 text-zinc-400 border border-white/5"
                          }`}>
                            {opt.badge}
                          </span>
                        </div>
                        <p className="text-[10.5px] text-zinc-400 line-clamp-2 leading-relaxed">{opt.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active Selection Details & Download Action */}
              <div className="space-y-6 pt-6 border-t border-white/5 mt-6">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    {activeOption.title}
                    <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono font-normal">{activeOption.file}</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">{activeOption.desc}</p>
                </div>

                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Installation Steps</h4>
                  <ol className="space-y-2.5 pl-0.5">
                    {activeOption.instructions.map((step, idx) => (
                      <li key={idx} className="flex gap-3 text-xs text-zinc-300 leading-relaxed font-medium">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center text-[10px] font-bold text-white/50">{idx + 1}</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row gap-3">
                  <a href={activeOption.url} className="flex-1">
                    <button className="primary-saas w-full h-11 text-xs font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md">
                      <Download className="w-4 h-4" /> Download {activeOption.title}
                    </button>
                  </a>
                  <a 
                    href={activeOption.directUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    title="Direct GitHub Releases download mirror"
                    className="flex-shrink-0 px-4 h-11 rounded-xl border border-white/10 hover:border-white/20 bg-white/[0.02] hover:bg-white/[0.05] text-xs font-semibold text-zinc-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors"
                  >
                    GitHub Mirror
                  </a>
                </div>
              </div>

            </div>

            {/* Offline note */}
            <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl flex gap-3 text-left">
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-amber-500">Offline activation notice</h4>
                <p className="text-[10.5px] text-zinc-400 leading-relaxed">
                  Your upgraded tier limits (Pro/Super) are backed by Firestore and synchronize automatically. If you plan to run the software completely offline, simply log in to your account once while connected to the internet. The app securely caches your active plan thresholds locally, enabling unlimited offline use!
                </p>
              </div>
            </div>
          </div>

          {/* Right 2 columns: Desktop app advantages */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Advantages block */}
            <div className="glass-card p-6 rounded-2xl border border-white/5 bg-zinc-950/40 space-y-5">
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Why Desktop App?</h3>
              
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 mt-0.5">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">10x Faster Processing</h4>
                    <p className="text-[10px] text-zinc-400 mt-0.5 leading-relaxed">Uses native multi-threading and asynchronous background workers. Processes large archives in minutes rather than hours.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mt-0.5">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Infinite Size Limits</h4>
                    <p className="text-[10px] text-zinc-400 mt-0.5 leading-relaxed">No browser memory block constraints. Confidently restore large Google Takeout archives from 50GB up to 500GB+.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 mt-0.5">
                    <WifiOff className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">100% Offline Capability</h4>
                    <p className="text-[10px] text-zinc-400 mt-0.5 leading-relaxed">Runs entirely locally without any network connection. Perfect for users with slow or metered internet lines.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 mt-0.5">
                    <HardDrive className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Direct Drive Integration</h4>
                    <p className="text-[10px] text-zinc-400 mt-0.5 leading-relaxed">Bypasses browser sandboxes to read/write directories and ZIP archives directly on your hard drive or external disk.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Tech Requirements */}
            <div className="glass-card p-6 rounded-2xl border border-white/5 bg-zinc-950/40 space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Terminal className="w-4 h-4" /> System Specs
              </h3>
              <ul className="space-y-2 text-[10px] text-zinc-300 font-medium">
                <li className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-zinc-500">Java Version</span>
                  <span>Java 21 JRE (Bundled inside)</span>
                </li>
                <li className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-zinc-500">Memory (RAM)</span>
                  <span>4 GB Minimum (8 GB Recommended)</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-zinc-500">Free Space</span>
                  <span>~120 MB for installation</span>
                </li>
              </ul>
            </div>

          </div>
        </div>

        {/* Feature Comparison Table */}
        <div className="space-y-4">
          <div className="text-center space-y-1.5">
            <h2 className="text-xl font-bold text-white">Compare Browser vs. Desktop</h2>
            <p className="text-xs text-zinc-400">See which platform fits your Google Takeout archive size best</p>
          </div>

          <div className="overflow-x-auto border border-white/5 rounded-2xl bg-zinc-950/20">
            <table className="w-full text-xs text-zinc-400 border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02] text-left text-zinc-300 font-bold">
                  <th className="p-4">Feature</th>
                  <th className="p-4">🌐 Web Browser Tool</th>
                  <th className="p-4 text-indigo-400">💻 Desktop Standalone App</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-medium">
                <tr>
                  <td className="p-4 font-semibold text-white">Installation</td>
                  <td className="p-4">Instant (Zero install required)</td>
                  <td className="p-4 text-zinc-300">Requires download (No install needed)</td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold text-white">Processing Speed</td>
                  <td className="p-4 text-amber-500/80">Standard (Browser throttle limits)</td>
                  <td className="p-4 text-emerald-400/80 font-bold">Native Multithreaded (Fastest)</td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold text-white">Ideal Archive Size</td>
                  <td className="p-4">Small archives (&lt; 20 GB)</td>
                  <td className="p-4 text-zinc-300">Infinite size (50 GB to 1 TB+)</td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold text-white">Offline Use</td>
                  <td className="p-4 text-red-400/80">No (Requires server sync)</td>
                  <td className="p-4 text-emerald-400/80 font-bold">Yes (100% Offline supported)</td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold text-white">Direct Local EXIF Injection</td>
                  <td className="p-4">Yes (Via virtual files api)</td>
                  <td className="p-4 text-zinc-300">Yes (Direct write to physical disk)</td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold text-white">System Standby Prevention</td>
                  <td className="p-4 text-red-400/80">No</td>
                  <td className="p-4 text-emerald-400/80 font-bold">Yes (Includes Auto-Wake lock)</td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold text-white">Auto PC Shutdown</td>
                  <td className="p-4 text-red-400/80">No</td>
                  <td className="p-4 text-emerald-400/80 font-bold">Yes (Optional post-action)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
