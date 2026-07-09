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

export default function DownloadPage() {
  const [selectedOS, setSelectedOS] = useState<"win" | "mac" | "linux">("win");

  const downloadUrls = {
    win: "https://takeoutfix-download.takeoutfix.workers.dev/download/windows",
    mac: "https://takeoutfix-download.takeoutfix.workers.dev/download/macos",
    linux: "https://takeoutfix-download.takeoutfix.workers.dev/download/linux"
  };

  const osInfo = {
    win: {
      title: "Windows Standalone",
      desc: "Compatible with Windows 10 & 11 (64-bit). No installer required.",
      file: "TakeoutFix-Windows-Portable.zip",
      instructions: [
        "Download the ZIP archive using the link below.",
        "Right-click the downloaded folder and select 'Extract All...'.",
        "Open the extracted directory and double-click the 'GTMetadataMerger.exe' file.",
        "If Windows SmartScreen prompts a warning (since it's a new standalone release), click 'More info' and select 'Run anyway'."
      ]
    },
    mac: {
      title: "macOS Application",
      desc: "Supports Intel & Apple Silicon (M1/M2/M3) chips. macOS 12+.",
      file: "TakeoutFix-macOS-Portable.zip",
      instructions: [
        "Download the macOS archive file.",
        "Double-click to extract the ZIP archive.",
        "Drag the extracted 'GTMetadataMerger.app' into your Applications folder.",
        "Right-click the app icon and select 'Open' to launch it. Confirm the security prompt by clicking 'Open' again."
      ]
    },
    linux: {
      title: "Linux Executable",
      desc: "Compatible with modern x86_64 distributions (Ubuntu, Fedora, Arch).",
      file: "TakeoutFix-Linux-Portable.tar.gz",
      instructions: [
        "Download the Linux compressed tarball.",
        "Extract it using your archive manager or run: tar -xzf TakeoutFix-Linux-Portable.tar.gz",
        "Navigate into the folder and mark the main executable as runnable: chmod +x GTMetadataMerger",
        "Launch the tool directly from terminal or double-click to start: ./GTMetadataMerger"
      ]
    }
  };

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
                  onClick={() => setSelectedOS("win")}
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
                  onClick={() => setSelectedOS("mac")}
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
                  onClick={() => setSelectedOS("linux")}
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

              {/* Instructions list */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white">{osInfo[selectedOS].title}</h3>
                  <p className="text-xs text-zinc-400 mt-1">{osInfo[selectedOS].desc}</p>
                </div>

                <div className="space-y-4">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Installation Steps</h4>
                  <ol className="space-y-3.5 pl-0.5">
                    {osInfo[selectedOS].instructions.map((step, idx) => (
                      <li key={idx} className="flex gap-3 text-xs text-zinc-300 leading-relaxed font-medium">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center text-[10px] font-bold text-white/50">{idx + 1}</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="pt-4 flex flex-col sm:flex-row gap-3">
                  <a href={downloadUrls[selectedOS]} className="flex-1">
                    <button className="primary-saas w-full h-11 text-xs font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md">
                      <Download className="w-4 h-4" /> Download Standalone ({osInfo[selectedOS].file})
                    </button>
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
