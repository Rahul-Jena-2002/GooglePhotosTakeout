import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import { Button } from "../components/ui/button"
import { FolderSearch, Binary, Cpu, ArrowRight, ShieldCheck, CheckCircle2 } from "lucide-react"
import AdUnit from "../components/AdUnit"

// Dynamic visual representation for Phase 1
function DirectoryParsingDiagram() {
  const files = [
    { name: "IMG_3021.HEIC", type: "media", size: "4.2 MB", status: "indexed" },
    { name: "IMG_3021.HEIC.json", type: "json", size: "1.2 KB", status: "parsed" },
    { name: "IMG_3022-edited.JPG", type: "media", size: "2.8 MB", status: "indexed" },
    { name: "IMG_3022.JPG.json", type: "json", size: "1.5 KB", status: "parsed" },
    { name: "VID_20220815.mp4", type: "media", size: "45.1 MB", status: "indexed" },
  ];

  return (
    <div className="w-full h-full p-6 flex flex-col bg-zinc-950 text-left font-mono justify-between text-xs border border-zinc-800/50 rounded-xl relative overflow-hidden group select-none">
      {/* Grid backdrop overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none"></div>
      
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3 z-10">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-zinc-500 animate-pulse"></span>
          <span className="text-zinc-400 font-semibold text-[10px] uppercase tracking-wider">File System Indexer</span>
        </div>
        <span className="text-zinc-400 text-[10px] font-bold">Active Traversal</span>
      </div>

      <div className="space-y-3.5 my-4 z-10 flex-1 justify-center flex flex-col">
        {files.map((file, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -15 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.15, duration: 0.4 }}
            className="flex items-center justify-between p-2.5 rounded border border-zinc-900 bg-zinc-900/30 hover:border-zinc-800/80 transition-all"
          >
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${file.type === 'media' ? 'bg-zinc-400 shadow-[0_0_8px_rgba(255,255,255,0.15)]' : 'bg-zinc-600 shadow-[0_0_8px_rgba(255,255,255,0.05)]'}`}></span>
              <span className="text-zinc-300 font-medium truncate max-w-[130px] md:max-w-[180px]">{file.name}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-zinc-500 text-[10px] font-semibold">{file.size}</span>
              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                file.status === 'parsed' ? 'bg-zinc-900 text-zinc-400 border border-zinc-800' : 'bg-zinc-800 text-zinc-300 border border-zinc-750'
              }`}>
                {file.status}
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="border-t border-zinc-900 pt-3 flex items-center justify-between z-10 text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
        <div>
          Scanned: <span className="text-zinc-300 font-extrabold">1,824 files</span>
        </div>
        <div>
          Speed: <span className="text-zinc-400 font-extrabold">142 files/s</span>
        </div>
      </div>
    </div>
  );
}

// Dynamic visual representation for Phase 2
function MetadataMatchingDiagram() {
  const matches = [
    { media: "IMG_9102-edited.JPG", json: "IMG_9102.JPG.json", type: "Fuzzy String Match", color: "from-zinc-400 to-zinc-500" },
    { media: "IMG_9102(1).JPG", json: "IMG_9102.JPG.json", type: "Copy Suffix Resolved", color: "from-zinc-500 to-zinc-650" },
    { media: "IMG_9102_GPS.JPG", json: "IMG_9102.JPG.json", type: "Timestamp Match", color: "from-zinc-600 to-zinc-400" },
  ];

  return (
    <div className="w-full h-full p-6 flex flex-col bg-zinc-950 text-left font-mono justify-between text-xs border border-zinc-800/50 rounded-xl relative overflow-hidden group select-none">
      {/* Grid backdrop overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none"></div>

      <div className="flex items-center justify-between border-b border-zinc-800 pb-3 z-10">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-zinc-500 animate-pulse"></span>
          <span className="text-zinc-400 font-semibold text-[10px] uppercase tracking-wider">Heuristic Matching Engine</span>
        </div>
        <span className="text-zinc-400 text-[10px] font-bold">Resolving Permutations</span>
      </div>

      <div className="my-auto py-2 space-y-4 z-10 flex-1 justify-center flex flex-col">
        {matches.map((match, i) => (
          <div key={i} className="relative space-y-1 bg-zinc-900/20 p-2.5 rounded border border-zinc-900/60">
            <div className="flex justify-between text-[8px] text-zinc-500 font-bold uppercase tracking-wider px-1">
              <span>Source Media</span>
              <span className="text-zinc-400 font-bold">{match.type}</span>
              <span>Sidecar JSON</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 p-2 rounded bg-zinc-900 border border-zinc-800/50 text-zinc-300 truncate max-w-[130px] text-center font-bold text-[10px]">
                {match.media}
              </div>
              <div className="relative flex-1 flex items-center justify-center h-2">
                <div className="absolute inset-0 bg-zinc-800 rounded-full h-[1px]"></div>
                <motion.div 
                  initial={{ left: 0 }}
                  animate={{ left: "100%" }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: i * 0.4 }}
                  className={`absolute w-2.5 h-2.5 -mt-[4px] rounded-full bg-gradient-to-r ${match.color} shadow-[0_0_8px_rgba(255,255,255,0.2)]`}
                ></motion.div>
              </div>
              <div className="flex-1 p-2 rounded bg-zinc-900 border border-zinc-800/50 text-zinc-400 truncate max-w-[130px] text-center text-[10px]">
                {match.json}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-zinc-900 pt-3 flex items-center justify-between z-10 text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
        <span>Fuzzy Match Accuracy: <span className="text-zinc-300 font-extrabold">99.99%</span></span>
        <span>Fail Safe Fallback: <span className="text-zinc-400 font-extrabold">Active</span></span>
      </div>
    </div>
  );
}

// Dynamic visual representation for Phase 3
function ExifHeaderInjectionDiagram() {
  const tags = [
    { tag: "0x9003", name: "DateTimeOriginal", val: "2021:08:15 14:23:35", status: "written" },
    { tag: "0x0002", name: "GPSLatitude", val: "40.7128 N", status: "written" },
    { tag: "0x0004", name: "GPSLongitude", val: "74.0060 W", status: "written" },
    { tag: "0x0112", name: "Orientation", val: "1 (Normal)", status: "verified" },
  ];

  return (
    <div className="w-full h-full p-6 flex flex-col bg-zinc-950 text-left font-mono justify-between text-xs border border-zinc-800/50 rounded-xl relative overflow-hidden group select-none">
      {/* Grid backdrop overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none"></div>

      <div className="flex items-center justify-between border-b border-zinc-800 pb-3 z-10">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-zinc-500 animate-pulse"></span>
          <span className="text-zinc-400 font-semibold text-[10px] uppercase tracking-wider">EXIF Binary Injector</span>
        </div>
        <span className="text-zinc-400 text-[10px] font-bold">Writing EXIF Headers</span>
      </div>

      <div className="space-y-3 my-4 z-10 flex-1 justify-center flex flex-col">
        {tags.map((item, i) => (
          <div key={i} className="flex items-center justify-between p-2.5 rounded border border-zinc-900 bg-zinc-900/30 hover:border-zinc-850 transition-all">
            <div className="flex items-center gap-2 text-zinc-500 text-[10px] font-bold uppercase">
              <span className="font-extrabold text-zinc-400">{item.tag}</span>
              <span className="text-zinc-300 font-bold">{item.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <motion.span 
                initial={{ opacity: 0.5 }}
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.3 }}
                className="text-zinc-300 text-[10px] font-bold tracking-tight truncate max-w-[110px] md:max-w-[140px]"
              >
                {item.val}
              </motion.span>
              <span className="text-zinc-300 text-[8px] font-bold border border-zinc-750 bg-zinc-850 px-1.5 py-0.5 rounded uppercase flex-shrink-0">
                {item.status}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-zinc-900 pt-3 flex items-center justify-between z-10 text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
        <span>Binary Integrity: <span className="text-zinc-300 font-extrabold">100% Valid</span></span>
        <span>Recomp: <span className="text-zinc-450 font-extrabold">None (Raw)</span></span>
      </div>
    </div>
  );
}

export default function HowItWorksPage() {
  const steps = [
    {
      phase: "Phase 01",
      title: "Local Directory Parsing",
      subtitle: "Secure Client-Side Indexing",
      icon: FolderSearch,
      color: "text-zinc-400",
      glowColor: "",
      description: "TakeoutFix utilizes the modern browser File System Access API to gain read-only permission to your Google Takeout folder. It executes a high-performance recursive traversal to locate all media files and their corresponding sidecar JSON files entirely on your machine.",
      technicalDetails: [
        "Zero-upload architecture: media bytes never leave your device.",
        "Asynchronous scanning runs in a background Web Worker to prevent UI blocking.",
        "Supports nested folder structures and multi-part Takeout archives."
      ],
      codeLabel: "Browser Security Sandbox",
      codeSnippet: `// Requesting local folder access
const dirHandle = await window.showDirectoryPicker({
  mode: 'readwrite' // Read source, write to output
});

// Traversing folders recursively
for await (const [name, entry] of dirHandle) {
  if (entry.kind === 'file') {
    // Indexes locally, no network calls
    addToLocalIndex(name, entry);
  }
}`
    },
    {
      phase: "Phase 02",
      title: "Heuristic Metadata Matching",
      subtitle: "Pairing Files with Sidecars",
      icon: Cpu,
      color: "text-zinc-400",
      glowColor: "",
      description: "Google Takeout often edits names, truncates titles, or appends suffixes (like '-edited' or '(1)') to media, making standard matching fail. TakeoutFix applies a multi-layered match heuristic to pair files with their JSON sidecar, resolving filename inconsistencies automatically.",
      technicalDetails: [
        "Name-hash pairing checks original file titles inside the JSON schema.",
        "Fuzzy matching reconciles truncated strings and system-appended suffixes.",
        "Timestamp alignment acts as a fallback to resolve similar media files."
      ],
      codeLabel: "Google Takeout JSON Schema",
      codeSnippet: `{
  "title": "IMG_9102.JPG",
  "photoTakenTime": {
    "timestamp": "1629037415",
    "formatted": "Aug 15, 2021, 2:23:35 PM UTC"
  },
  "geoData": {
    "latitude": 40.7128,
    "longitude": -74.0060,
    "altitude": 10.5
  }
}`
    },
    {
      phase: "Phase 03",
      title: "Deep EXIF Header Injection",
      subtitle: "Rebuilding Media Headers",
      icon: Binary,
      color: "text-zinc-400",
      glowColor: "",
      description: "Once matched, the engine extracts the Unix epoch timestamps and coordinates. It parses the binary structures of JPEGs, PNGs, and HEICs, injecting the parameters directly into their EXIF headers (DateTimeOriginal and GPS tags) before outputting clean files.",
      technicalDetails: [
        "Reconstructs native binary EXIF tags without re-compressing the image.",
        "Updates QuickTime/UserData metadata headers inside MP4/MOV videos.",
        "Outputs clean, linkable files ready for Apple Photos or Google Photos import."
      ],
      codeLabel: "Injected EXIF Header Structure",
      codeSnippet: `[EXIF Header Block]
├─ Tag 0x9003 (DateTimeOriginal)  ➜ "2021:08:15 14:23:35"
├─ Tag 0x0001 (GPSLatitudeRef)    ➜ "N"
├─ Tag 0x0002 (GPSLatitude)       ➜ [40, 42, 46.08]
├─ Tag 0x0003 (GPSLongitudeRef)   ➜ "W"
└─ Tag 0x0004 (GPSLongitude)      ➜ [74, 0, 21.6]
[End of Binary Payload]`
    }
  ];

  return (
    <div className="bg-black text-zinc-100 min-h-screen py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Header */}
      <div className="max-w-4xl mx-auto text-center mb-32 relative">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-semibold text-zinc-400 mb-6 font-mono"
        >
          <ShieldCheck className="w-4 h-4 text-zinc-400" />
          100% Client-Side Engine Telemetry
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-5xl md:text-7xl font-extrabold tracking-tight text-white mb-6"
        >
          How It <span className="text-white">Works</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto font-normal leading-relaxed"
        >
          A deeply technical breakdown of the metadata restoration process. Learn how TakeoutFix reconstructs your photo metadata locally without ever compromising your security.
        </motion.p>
      </div>

      {/* Timeline Section */}
      <div className="max-w-6xl mx-auto relative">
        
        {/* Central connecting line for desktop */}
        <div className="absolute left-[50%] top-12 bottom-20 w-[1px] bg-zinc-800 opacity-30 hidden lg:block"></div>

        <div className="space-y-40">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const isEven = idx % 2 === 0;

            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.6 }}
                className="relative flex flex-col lg:flex-row items-stretch gap-12 lg:gap-20"
              >
                {/* Timeline node marker for desktop */}
                <div className="absolute left-[50%] -translate-x-1/2 top-4 w-10 h-10 rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center shadow-[0_0_20px_rgba(0,0,0,0.8)] z-20 hidden lg:flex">
                  <span className="w-3.5 h-3.5 rounded-full bg-zinc-500 animate-pulse"></span>
                </div>

                {/* Left Block (Text & Code) */}
                <div className={`flex-1 flex flex-col justify-center space-y-6 order-1 ${isEven ? 'lg:order-1 lg:text-left' : 'lg:order-2 lg:text-left'}`}>
                  <div className="flex items-center gap-3">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 shadow-md">
                      <Icon className={`w-6 h-6 ${step.color}`} />
                    </div>
                    <div>
                      <span className={`text-[10px] font-bold uppercase tracking-[0.2em] font-mono ${step.color}`}>{step.phase}</span>
                      <h3 className="text-2xl font-bold tracking-tight text-white">{step.title}</h3>
                    </div>
                  </div>
                  
                  <div className="text-sm font-semibold tracking-wide text-zinc-500 uppercase font-mono">{step.subtitle}</div>
                  
                  <p className="text-base text-zinc-400 leading-relaxed font-normal">
                    {step.description}
                  </p>

                  <ul className="space-y-2.5">
                    {step.technicalDetails.map((detail, dIdx) => (
                      <li key={dIdx} className="flex items-start gap-2.5 text-sm text-zinc-450 font-normal">
                        <CheckCircle2 className={`w-4 h-4 mt-0.5 flex-shrink-0 ${step.color}`} />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>

                </div>

                {/* Right Block (Image / Interactive Diagram Card) */}
                <div className={`flex-1 flex items-center justify-center order-2 ${isEven ? 'lg:order-2' : 'lg:order-1'}`}>
                  <div className="relative w-full max-w-lg">
                    {/* Glass Container */}
                    <div className="relative bg-zinc-900/30 border border-white/5 rounded-2xl p-4 shadow-2xl backdrop-blur-md">
                      <div className="aspect-square bg-zinc-950/80 rounded-xl border border-zinc-800/80 overflow-hidden p-2 flex items-center justify-center relative">
                        {step.phase === "Phase 01" && <DirectoryParsingDiagram />}
                        {step.phase === "Phase 02" && <MetadataMatchingDiagram />}
                        {step.phase === "Phase 03" && <ExifHeaderInjectionDiagram />}
                      </div>
                    </div>
                  </div>
                </div>

              </motion.div>
            )
          })}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 my-12">
        <AdUnit type="horizontal" />
      </div>

      {/* BOTTOM CTA */}
      <div className="max-w-4xl mx-auto text-center mt-48 py-16 border-t border-zinc-900 relative">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-white">Ready to reclaim your metadata?</h2>
        <p className="text-zinc-500 mb-8 max-w-md mx-auto">Launch the recovery center and process your files securely, 100% offline in your browser.</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link to="/pricing" className="w-full sm:w-auto">
            <button className="btn-monochrome-secondary px-8 h-14 font-semibold rounded-xl transition-all flex items-center justify-center w-full sm:w-auto cursor-pointer">
              Compare Plans
            </button>
          </Link>
          <Link to="/tool" className="w-full sm:w-auto">
            <button className="btn-monochrome-primary px-10 h-14 font-semibold rounded-xl transition-all flex items-center justify-center gap-2 w-full sm:w-auto cursor-pointer">
              Restore My Data <ArrowRight className="w-5 h-5" />
            </button>
          </Link>
        </div>
      </div>

    </div>
  )
}
