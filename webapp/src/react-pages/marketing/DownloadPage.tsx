import { useState } from "react";
import {
  Download,
  ShieldCheck,
  Cpu,
  WifiOff,
  HardDrive,
  CheckCircle2,
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
  smartScreenNote?: boolean;
}

export default function DownloadPage() {
  const [selectedOS, setSelectedOS] = useState<"win" | "mac" | "linux">("win");

  const downloadOptions: Record<"win" | "mac" | "linux", DownloadOption> = {
    win: {
      title: "TakeoutFix for Windows",
      badge: "Windows 10 & 11 · x64",
      desc: "Download one executable. On first launch it unpacks the app into your local Windows profile; no manual ZIP extraction is needed.",
      file: "TakeoutFix.exe",
      url: "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix.exe",
      directUrl: "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix.exe",
      smartScreenNote: true,
      instructions: [
        "Click the download button below to get 'TakeoutFix.exe'.",
        "Double-click 'TakeoutFix.exe' in your Downloads folder.",
        "If Windows displays a security warning, review it before deciding whether to proceed.",
        "Select your extracted Google Takeout folder, then check the restored files."
      ]
    },
    mac: {
      title: "TakeoutFix for Mac",
      badge: "macOS · Apple silicon",
      desc: "The current build workflow targets Apple silicon. Check the release notes for supported devices and signing status.",
      file: "TakeoutFix.dmg",
      url: "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix.dmg",
      directUrl: "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix.dmg",
      instructions: [
        "Download 'TakeoutFix.dmg' using the button below.",
        "Double-click the downloaded DMG file and drag TakeoutFix into your Applications folder.",
        "If macOS displays a security warning, review it before deciding whether to proceed.",
        "Launch TakeoutFix from your Applications folder or Spotlight search."
      ]
    },
    linux: {
      title: "TakeoutFix for Linux",
      badge: "Linux · x64",
      desc: "The build workflow targets 64-bit Intel and AMD computers. Check the release notes for system requirements.",
      file: "TakeoutFix.AppImage",
      url: "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix.AppImage",
      directUrl: "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/latest/download/TakeoutFix.AppImage",
      instructions: [
        "Download 'TakeoutFix.AppImage' using the button below.",
        "Right-click the file > Properties > Permissions > check 'Allow executing file as program'.",
        "Double-click 'TakeoutFix.AppImage' to run."
      ]
    }
  };

  const activeOption = downloadOptions[selectedOS];

  return (
    <div className="min-h-screen text-zinc-900 dark:text-white relative py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-7xl mx-auto space-y-12">

        {/* Header */}
        <div className="text-center space-y-4 max-w-4xl mx-auto pt-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-wider shadow-xs">
            <ShieldCheck className="w-3.5 h-3.5" /> Desktop restoration app
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-zinc-900 dark:text-white leading-tight">
            Download TakeoutFix
          </h1>
          <p className="text-sm md:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed font-medium">
            For very large photo collections, the desktop app may be a better fit. Check the system requirements and release notes for your platform before downloading.
          </p>
        </div>

        {/* Main Downloads Card */}
        <div className="bg-white dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 p-6 md:p-8 rounded-2xl shadow-sm dark:shadow-2xl flex flex-col justify-between">
          <div className="space-y-6">
            {/* OS Tabs */}
            <div className="flex border-b border-zinc-200 dark:border-white/10 pb-4 justify-between gap-2.5 overflow-x-auto">
              <button
                onClick={() => setSelectedOS("win")}
                aria-pressed={selectedOS === "win"}
                className={`flex-1 min-w-[100px] py-2.5 px-3.5 rounded-xl text-xs md:text-sm font-bold transition-all border text-center flex items-center justify-center gap-2 cursor-pointer ${
                  selectedOS === "win"
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-black border-transparent shadow-md"
                    : "bg-zinc-100/80 dark:bg-white/[0.03] border-zinc-200 dark:border-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/60"
                }`}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0" fill="#00a4ef">
                  <path d="M0 4.5 8.8 3v8.3H0zm10-1.7L24 .4v10.9H10zM0 12.3h8.8v8.3L0 19zm10 0h14v11.3l-14-2.7z" />
                </svg>
                <span>Windows</span>
              </button>
              <button
                onClick={() => setSelectedOS("mac")}
                aria-pressed={selectedOS === "mac"}
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
                onClick={() => setSelectedOS("linux")}
                aria-pressed={selectedOS === "linux"}
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

            {/* OS Details */}
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

              {/* SmartScreen notice for Windows */}
              {activeOption.smartScreenNote && (
                <div className="mt-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 flex gap-3">
                  <span className="text-amber-500 text-lg leading-none mt-0.5 flex-shrink-0">⚠</span>
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Windows SmartScreen may appear on first run</p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                      Windows may warn about an unsigned or unfamiliar app. Download only from the official release page and review any warning before proceeding.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Download Button */}
          <div className="pt-6 mt-6 border-t border-zinc-200 dark:border-white/10 space-y-2.5">
            <a href={activeOption.url} className="w-full h-14 text-sm font-bold rounded-xl flex items-center justify-center gap-2.5 cursor-pointer shadow-lg transition-all bg-zinc-900 hover:bg-black text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-black hover:scale-[1.005] active:scale-[0.995]">
              <Download className="w-4 h-4" /> Download {activeOption.title}
            </a>
            <div className="flex items-center justify-between gap-4">
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
                Download hosted on GitHub Releases. Check the release notes before installing.
              </p>
              <a
                href={activeOption.directUrl}
                className="text-[11px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors whitespace-nowrap underline underline-offset-2"
              >
                Direct link
              </a>
            </div>
          </div>
        </div>

        {/* Sponsored Recommendations: Top Download Banner */}
        <section className="w-full relative z-10" aria-label="Sponsored recommendations">
          <AdUnit placement="ARTICLE_TOP" />
        </section>

        {/* Why Desktop App */}
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
                <h4 className="text-xs font-bold text-zinc-900 dark:text-white">Local processing</h4>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 leading-relaxed">Processing time depends on your files, storage speed, and computer.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-zinc-50/60 dark:bg-white/[0.02] border border-zinc-200/60 dark:border-white/5">
              <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-zinc-900 dark:text-white">Work with larger libraries</h4>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 leading-relaxed">Available space and device resources affect the size of a job. Guests can process 1 GB before signing in for free.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-zinc-50/60 dark:bg-white/[0.02] border border-zinc-200/60 dark:border-white/5">
              <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0">
                <WifiOff className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-zinc-900 dark:text-white">Your media stays local</h4>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 leading-relaxed">Restore selected media on your computer. Sign-in, account sync, and update checks use the internet.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-zinc-50/60 dark:bg-white/[0.02] border border-zinc-200/60 dark:border-white/5">
              <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 mt-0.5 shrink-0">
                <HardDrive className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-zinc-900 dark:text-white">Direct Drive Integration</h4>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 leading-relaxed">Bypasses browser sandboxes to read/write directories directly on your hard drive or external disk.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Compatibility Notice */}
        <div className="bg-white dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 p-5 sm:p-6 rounded-2xl shadow-sm dark:shadow-2xl flex items-center gap-4">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">System compatibility</h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 leading-relaxed">
              Packages target Windows, macOS, and Linux. Availability and system requirements depend on the release; check its notes before downloading.
            </p>
          </div>
        </div>

        {/* Code Signing Notice */}
        <div className="bg-white dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/10 p-6 rounded-2xl shadow-sm dark:shadow-2xl space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Code Signing &amp; Verification</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Check release information before installing</p>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed space-y-2">
            <p className="text-zinc-500 dark:text-zinc-400">
              Desktop packages may be unsigned. Check the release page for the signing status of the version you download; Windows and macOS may show security warnings for unsigned applications.
            </p>
          </div>
        </div>

        {/* Sponsored Recommendations: Bottom Download Banner */}
        <section className="w-full relative z-10" aria-label="Sponsored recommendations">
          <AdUnit placement="ARTICLE_BOTTOM" />
        </section>

        {/* Web Browser Option */}
        <div className="p-6 rounded-2xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 text-left w-full flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Prefer using your web browser?
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              You can also restore photos directly in your browser with zero installation required.
            </p>
          </div>
          <a href="/tool" className="flex-shrink-0 w-full sm:w-auto">
            <button className="btn-monochrome-secondary px-5 py-2.5 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 w-full sm:w-auto cursor-pointer">
              <span>Try Web Browser Tool</span>
            </button>
          </a>
        </div>

      </div>
    </div>
  );
}
