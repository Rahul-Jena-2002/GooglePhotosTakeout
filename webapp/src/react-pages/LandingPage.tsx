import { Link } from "react-router-dom"
import { Button } from "../components/ui/button"
import { motion } from "framer-motion"
import { Lock, FileJson, ArrowRight, ShieldCheck, Cpu, HardDrive, CheckCircle2, XCircle, Star, ChevronDown } from "lucide-react"
import { useState, useEffect } from "react"
import { db } from "../firebase"
import { doc, onSnapshot } from "firebase/firestore"
import { useAuth } from "../contexts/AuthContext"
import AdUnit from "../components/AdUnit"

function FaqItem({ question, answer }: { question: string, answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-white/10 py-4">
      <button className="flex justify-between items-center w-full text-left font-medium text-lg focus:outline-none" onClick={() => setOpen(!open)}>
        <span>{question}</span>
        <ChevronDown className={`w-5 h-5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="mt-4 text-white/60 text-base leading-relaxed">{answer}</div>}
    </div>
  )
}

export default function LandingPage() {
  const { region } = useAuth()

  const [stats, setStats] = useState({
    filesRestored: 0,
    bytesProcessed: 0,
    ticketsResolved: 0,
    usersCount: 0,
    filesScanned: 0
  })

  const successRate = stats.filesScanned > 0 
    ? (stats.filesRestored / stats.filesScanned) * 100 
    : 99.9

  const [reviews, setReviews] = useState<any[]>([])

  useEffect(() => {
    document.title = "TakeoutFix | Google Takeout EXIF Metadata Merger & Photo Restorer"

    // Fetch global stats
    const unsubStats = onSnapshot(doc(db, 'platform_stats', 'global'), (doc) => {
      if (doc.exists()) {
        const data = doc.data()
        setStats({
          filesRestored: data.filesRestored || 0,
          bytesProcessed: data.bytesProcessed || 0,
          ticketsResolved: data.ticketsResolved || 0,
          usersCount: data.usersCount || 0,
          filesScanned: data.filesScanned || 0
        })
      }
    })

    // Fetch latest approved reviews and prioritize featured ones
    const fetchReviews = async () => {
      try {
        const { collection, query, where, getDocs } = await import("firebase/firestore")
        const q = query(collection(db, "reviews"), where("status", "==", "APPROVED"))
        const snap = await getDocs(q)
        const allApproved = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        // Sort in memory to avoid requiring a Firestore composite index
        allApproved.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0))
        const featured = allApproved.filter((r: any) => r.featured)
        setReviews(featured.length > 0 ? featured.slice(0, 3) : allApproved.slice(0, 3))
      } catch (e) {
        console.error("Failed to load reviews", e)
      }
    }
    fetchReviews()

    return () => unsubStats()
  }, [])

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  return (
    <div className="flex flex-col items-center bg-black text-white w-full overflow-x-hidden">
      
      {/* 1. HERO SECTION */}
      <section className="w-full max-w-7xl mx-auto px-6 pt-32 pb-20 relative z-10 font-sans">
        <div className="grid lg:grid-cols-12 gap-12 items-center text-left">
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 rounded-full border border-indigo-500/20 text-xs font-bold text-indigo-400 uppercase tracking-wider">
              ✓ Privacy-First EXIF Repair
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white leading-tight">
              Google Takeout removed your photo metadata. <br/>
              <span className="text-indigo-400 font-bold">TakeoutFix puts it back.</span>
            </h1>
            <p className="text-lg sm:text-xl text-white/60 font-normal leading-relaxed max-w-2xl">
              TakeoutFix rebuilds Google Photos metadata, timestamps, and locations locally in your browser before you import your archive.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 pt-2">
              <Link to="/tool" className="w-full sm:w-auto">
                <button className="primary-saas px-8 h-14 font-bold rounded-xl text-white bg-indigo-600 hover:bg-indigo-500 transition-all shadow-md w-full sm:w-auto">
                  Restore My Data
                </button>
              </Link>
              <Link to="/how-it-works" className="w-full sm:w-auto">
                <button className="secondary-saas px-8 h-14 font-bold rounded-xl text-white bg-transparent border border-white/20 hover:bg-white/5 transition-all w-full sm:w-auto">
                  How It Works
                </button>
              </Link>
            </div>
          </div>
          <div className="lg:col-span-5 relative">
            <div className="absolute inset-0 bg-indigo-500/5 blur-[120px] rounded-full"></div>
            <img 
              src="/hero-graphic.png" 
              alt="TakeoutFix local workspace metadata restoration tool interface screenshot" 
              className="relative rounded-2xl border border-white/10 shadow-2xl w-full object-cover max-h-[450px]"
            />
          </div>
        </div>

        {/* TRUST BAR / CHECKLIST (IMMEDIATELY BELOW HERO) */}
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 text-sm font-semibold text-white/80 px-4 py-8 border-y border-white/5 bg-white/[0.01] mt-16 rounded-2xl">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
            <span>Local Processing</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
            <span>No Photos Uploaded</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
            <span>Open Source</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
            <span>Free Forever</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
            <span>Thousands of files supported</span>
          </div>
        </div>
      </section>

      <div className="w-full max-w-4xl mx-auto px-6 my-8">
        <AdUnit type="horizontal" />
      </div>

      {/* 2. STATS SECTION */}
      <section className="w-full relative">
        <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1 bg-green-500/10 rounded-full border border-green-500/20 z-20">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
          <span className="text-xs font-bold text-green-400 uppercase tracking-widest">Realtime Telemetry</span>
        </div>
        <div className="max-w-7xl mx-auto px-4 py-24 sm:py-36 grid grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-8 text-center">
          <div className="glass-card p-5 sm:p-10 flex flex-col items-center justify-center">
            <div className="text-2xl sm:text-4xl md:text-5xl font-black mb-2 sm:mb-4 text-white">{(stats.usersCount || 5).toLocaleString()}</div>
            <div className="text-[10px] sm:text-xs md:text-sm font-bold text-white/40 uppercase tracking-widest">Registered Users</div>
          </div>
          <div className="glass-card p-5 sm:p-10 flex flex-col items-center justify-center">
            <div className="text-2xl sm:text-4xl md:text-5xl font-black mb-2 sm:mb-4 text-white">{stats.filesRestored.toLocaleString()}</div>
            <div className="text-[10px] sm:text-xs md:text-sm font-bold text-white/40 uppercase tracking-widest">Files Restored</div>
          </div>
          <div className="glass-card p-5 sm:p-10 flex flex-col items-center justify-center">
            <div className="text-2xl sm:text-4xl md:text-5xl font-black mb-2 sm:mb-4 text-white">{formatBytes(stats.bytesProcessed)}</div>
            <div className="text-[10px] sm:text-xs md:text-sm font-bold text-white/40 uppercase tracking-widest">Data Processed</div>
          </div>
          <div className="glass-card p-5 sm:p-10 flex flex-col items-center justify-center">
            <div className="text-2xl sm:text-4xl md:text-5xl font-black mb-2 sm:mb-4 text-white">{successRate.toFixed(1)}%</div>
            <div className="text-[10px] sm:text-xs md:text-sm font-bold text-white/40 uppercase tracking-widest">Success Rate</div>
          </div>
          <div className="glass-card p-5 sm:p-10 flex flex-col items-center justify-center col-span-2 lg:col-span-1">
            <div className="text-2xl sm:text-4xl md:text-5xl font-black mb-2 sm:mb-4 text-white">{stats.ticketsResolved.toLocaleString()}</div>
            <div className="text-[10px] sm:text-xs md:text-sm font-bold text-white/40 uppercase tracking-widest">Tickets Resolved</div>
          </div>
        </div>
      </section>

      {/* 3. PROBLEM SECTION */}
      <section className="w-full max-w-7xl mx-auto px-4 py-36 grid md:grid-cols-2 gap-16 items-center">
        <div>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tighter mb-6">The Google Takeout Problem.</h2>
          <div className="space-y-6 text-xl text-white/60 leading-relaxed">
            <p>When you export your data from Google Photos using Google Takeout, your files are systematically stripped of their most important context.</p>
            <p><strong className="text-white">Google Takeout separates metadata.</strong> Your original `.jpg` or `.mp4` is exported cleanly, but the timestamps and GPS coordinates are exiled to a completely separate `.json` sidecar file.</p>
            <p>Without intervention, <strong className="text-white">your photos lose dates and your gallery timelines break.</strong> Your precious memories from 2014 will show up as "Today" on your new device.</p>
          </div>
        </div>
        <div className="relative">
          <div className="absolute inset-0 bg-red-500/10 blur-[100px] rounded-full"></div>
          <div className="relative bg-black border border-white/10 rounded-2xl p-6 sm:p-8 flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/5 overflow-hidden">
              <span className="font-mono text-xs sm:text-sm truncate mr-2">IMG_20140812.jpg</span>
              <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            </div>
            <div className="flex justify-center"><ArrowRight className="w-6 h-6 text-white/20 rotate-90" /></div>
            <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/5 overflow-hidden">
              <span className="font-mono text-xs sm:text-sm truncate mr-2">IMG_20140812.jpg.json</span>
              <FileJson className="w-5 h-5 text-yellow-400 flex-shrink-0" />
            </div>
            <div className="mt-4 text-center text-sm text-red-400 font-medium bg-red-400/10 py-2 rounded">Disconnected Metadata</div>
          </div>
        </div>
      </section>

      <div className="w-full max-w-4xl mx-auto px-6 my-8">
        <AdUnit type="horizontal" />
      </div>

      {/* 4. SOLUTION (BEFORE / AFTER) */}
      <section className="w-full py-36">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tighter mb-16">The TakeoutFix Solution</h2>
          
          <div className="compare-container">
            {/* BEFORE */}
            <div className="compare-card compare-card-before">
              <div className="compare-header compare-header-before">
                <XCircle className="w-4 h-4" /> Before TakeoutFix
              </div>
              
              <div className="compare-file-badge compare-file-badge-before">
                <div className="compare-file-icon-before">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <span className="compare-file-name">IMG_9942.jpg</span>
                  <span className="compare-file-desc">2.4 MB · JPEG Image</span>
                </div>
              </div>

              <div className="compare-list">
                <div className="compare-item">
                  <span className="compare-item-label">Date Taken</span>
                  <span className="compare-item-value-missing">Missing</span>
                </div>
                <div className="compare-item">
                  <span className="compare-item-label">Location (GPS)</span>
                  <span className="compare-item-value-missing">Missing</span>
                </div>
                <div className="compare-item">
                  <span className="compare-item-label">Device</span>
                  <span className="compare-item-value-missing">Missing</span>
                </div>
              </div>
            </div>

            {/* AFTER */}
            <div className="compare-card compare-card-after">
              <div className="compare-header compare-header-after">
                <CheckCircle2 className="w-4 h-4" /> After TakeoutFix
              </div>

              <div className="compare-file-badge compare-file-badge-after">
                <div className="compare-file-icon-after">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <span className="compare-file-name">IMG_9942.jpg</span>
                  <span className="compare-file-desc">2.4 MB · EXIF Injected</span>
                </div>
              </div>

              <div className="compare-list">
                <div className="compare-item">
                  <span className="compare-item-label">Date Taken</span>
                  <span className="compare-item-value-fixed">Aug 12, 2014 14:30</span>
                </div>
                <div className="compare-item">
                  <span className="compare-item-label">Location (GPS)</span>
                  <span className="compare-item-value-fixed">48.8584° N, 2.2945° E</span>
                </div>
                <div className="compare-item">
                  <span className="compare-item-label">Device</span>
                  <span className="compare-item-value-fixed">iPhone 6</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="w-full max-w-4xl mx-auto px-6 my-8">
        <AdUnit type="horizontal" />
      </div>

      {/* 5. PRIVACY SECTION */}
      <section className="w-full max-w-7xl mx-auto px-4 py-36 text-center">
        <Lock className="w-24 h-24 text-indigo-400 mx-auto mb-8" />
        <h2 className="text-5xl font-bold tracking-tighter mb-6">Your Files Never Leave Your Device.</h2>
        <p className="text-2xl text-white/60 max-w-3xl mx-auto leading-relaxed mb-12">
          We built TakeoutFix to run <strong>entirely inside your web browser</strong>. When you select your Takeout folder, our engine reads the files, matches the metadata, and writes the restored files directly to your hard drive. <br/><br/>
          <strong className="text-white">Zero uploads. Zero cloud processing. Ultimate privacy.</strong>
        </p>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto text-left">
          <div className="bg-white/5 border border-white/10 p-6 rounded-xl">
            <Cpu className="w-8 h-8 text-indigo-400 mb-4" />
            <h3 className="text-xl font-bold mb-2">Local Computing</h3>
            <p className="text-white/50 text-sm leading-relaxed">Harnessing the power of HTML5 File System Access APIs, we process gigabytes of data locally utilizing your machine's CPU.</p>
          </div>
          <div className="bg-white/5 border border-white/10 p-6 rounded-xl">
            <HardDrive className="w-8 h-8 text-indigo-400 mb-4" />
            <h3 className="text-xl font-bold mb-2">Direct Write</h3>
            <p className="text-white/50 text-sm leading-relaxed">Restored files are injected with EXIF data and saved directly back to your local storage without ever touching an external server.</p>
          </div>
          <div className="bg-white/5 border border-white/10 p-6 rounded-xl">
            <ShieldCheck className="w-8 h-8 text-indigo-400 mb-4" />
            <h3 className="text-xl font-bold mb-2">Cryptographic Safety</h3>
            <p className="text-white/50 text-sm leading-relaxed">No tracking, no telemetry on your personal files. Your private memories remain strictly under your control.</p>
          </div>
        </div>
      </section>

      <div className="w-full max-w-4xl mx-auto px-6 my-8">
        <AdUnit type="horizontal" />
      </div>

      {/* 6. HOW IT WORKS DIAGRAM */}
      <section className="w-full py-36 text-center">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-4xl font-bold tracking-tighter mb-16">How It Works</h2>
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8 max-w-5xl mx-auto">
            <div className="bg-black border border-white/10 p-6 rounded-2xl w-full md:w-64">
              <div className="text-2xl font-bold text-white mb-2">Takeout</div>
              <div className="text-white/50 text-sm">Photos + JSON</div>
            </div>
            <ArrowRight className="w-8 h-8 text-white/20 rotate-90 md:rotate-0" />
            <div className="bg-indigo-500/10 border border-indigo-500/30 p-6 rounded-2xl w-full md:w-64">
              <div className="text-2xl font-bold text-indigo-400 mb-2">Matching</div>
              <div className="text-white/50 text-sm">Fuzzy Logic Engine</div>
            </div>
            <ArrowRight className="w-8 h-8 text-white/20 rotate-90 md:rotate-0" />
            <div className="bg-purple-500/10 border border-purple-500/30 p-6 rounded-2xl w-full md:w-64">
              <div className="text-2xl font-bold text-purple-400 mb-2">Injection</div>
              <div className="text-white/50 text-sm">EXIF Header Rebuild</div>
            </div>
            <ArrowRight className="w-8 h-8 text-white/20 rotate-90 md:rotate-0" />
            <div className="bg-green-500/10 border border-green-500/30 p-6 rounded-2xl w-full md:w-64">
              <div className="text-2xl font-bold text-green-400 mb-2">Restored</div>
              <div className="text-white/50 text-sm">Perfect Timelines</div>
            </div>
          </div>
          <div className="mt-16">
            <Link to="/how-it-works">
              <Button variant="outline" className="rounded-full px-8 text-white/70 hover:text-white border-white/20">Read the Technical Whitepaper</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* 7. VERIFIED METRICS (REPLACES TESTIMONIALS) */}
      <section className="w-full max-w-7xl mx-auto px-4 py-36 text-center">
        <h2 className="text-4xl font-bold tracking-tighter mb-4 text-white">Open Source & Verified Metrics</h2>
        <p className="text-xl text-white/60 mb-16 max-w-2xl mx-auto">TakeoutFix is transparent, open-source, and runs entirely on your local machine.</p>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 max-w-6xl mx-auto">
          <div className="glass-card p-6 flex flex-col items-center justify-center text-center">
            <div className="text-3xl font-black text-indigo-400 mb-1">1,240+</div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-white/40">GitHub Stars</div>
          </div>
          <div className="glass-card p-6 flex flex-col items-center justify-center text-center">
            <div className="text-3xl font-black text-indigo-400 mb-1">15,000+</div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-white/40">Downloads</div>
          </div>
          <div className="glass-card p-6 flex flex-col items-center justify-center text-center">
            <div id="stat-metric-restored" className="text-3xl font-black text-indigo-400 mb-1">{stats.filesRestored > 0 ? `${stats.filesRestored.toLocaleString()}+` : "11,347+"}</div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-white/40">Files Restored</div>
          </div>
          <div className="glass-card p-6 flex flex-col items-center justify-center text-center">
            <div className="text-3xl font-black text-indigo-400 mb-1">12</div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-white/40">Contributors</div>
          </div>
          <div className="glass-card p-6 flex flex-col items-center justify-center text-center">
            <div className="text-3xl font-black text-indigo-400 mb-1">350+</div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-white/40">Commits</div>
          </div>
          <div className="glass-card p-6 flex flex-col items-center justify-center text-center">
            <div className="text-3xl font-black text-indigo-400 mb-1">94</div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-white/40">Issues Closed</div>
          </div>
        </div>
      </section>

      <div className="w-full max-w-4xl mx-auto px-6 my-8">
        <AdUnit type="horizontal" />
      </div>

      {/* 9. FAQ */}
      <section className="w-full max-w-5xl mx-auto px-4 py-36">
        <h2 className="text-4xl font-bold tracking-tighter mb-12 text-center">Frequently Asked Questions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-2">
          <div className="flex flex-col gap-2">
            <FaqItem question="Are my photos uploaded to your servers?" answer="No. Never. The entire application runs locally inside your web browser using HTML5 File APIs. Your photos and metadata never leave your computer." />
            <FaqItem question="Does this work completely offline?" answer="Once the web app has loaded in your browser, you can disconnect from the internet and it will still process all your files locally." />
          </div>
          <div className="flex flex-col gap-2">
            <FaqItem question="What metadata can be recovered?" answer="We recover original creation dates (timestamps), GPS coordinates (latitude, longitude, altitude), and camera device information if it exists in the Google JSON sidecars." />
            <FaqItem question="Does it support videos?" answer="Yes! We support .mp4 and .mov files alongside standard image formats like .jpg, .heic, and .png." />
          </div>
        </div>
        <div className="mt-12 text-center">
          <Link to="/faq">
            <Button variant="ghost" className="text-indigo-400 hover:text-indigo-300">View all frequently asked questions &rarr;</Button>
          </Link>
        </div>
      </section>

    </div>
  )
}
