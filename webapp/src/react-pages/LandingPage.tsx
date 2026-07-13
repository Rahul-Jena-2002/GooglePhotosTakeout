import { Link } from "react-router-dom"
import { Button } from "../components/ui/button"

import { Lock, FileJson, ArrowRight, ShieldCheck, Cpu, HardDrive, CheckCircle2, XCircle, ChevronLeft, ChevronRight } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { db } from "../firebase"
import { doc, onSnapshot } from "firebase/firestore"
import { useAuth } from "../contexts/AuthContext"
import AdUnit from "../components/AdUnit"
import Compare from "../components/ui/Compare"
import ExpandableFaq from "../components/ui/ExpandableFaq"

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
    }, (err) => {
      console.error("Global stats query error:", err)
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

  const trackRef = useRef<HTMLDivElement>(null)
  const [activeStep, setActiveStep] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const [isExplicitlyPaused, setIsExplicitlyPaused] = useState(false)
  const isAutoScrollingRef = useRef(false)
  const userInteractionTimeoutRef = useRef<any>(null)

  // Autoplay cycle advancing step-by-step
  useEffect(() => {
    if (!isPlaying) return

    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % 4)
    }, 3000)

    return () => clearInterval(interval)
  }, [isPlaying])

  // Scroll to activeStep when it changes
  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    const itemWidth = 280 // cardWidth (256) + gap (24)
    const targetScrollLeft = activeStep * itemWidth

    if (Math.abs(track.scrollLeft - targetScrollLeft) > 10) {
      isAutoScrollingRef.current = true
      track.scrollTo({
        left: targetScrollLeft,
        behavior: "smooth"
      })
      const timeout = setTimeout(() => {
        isAutoScrollingRef.current = false
      }, 500)
      return () => clearTimeout(timeout)
    }
  }, [activeStep])

  const handleUserInteraction = () => {
    setIsPlaying(false)
    clearTimeout(userInteractionTimeoutRef.current)
    
    // Only set auto-resume timeout if NOT explicitly paused
    if (!isExplicitlyPaused) {
      userInteractionTimeoutRef.current = setTimeout(() => {
        setIsPlaying(true)
      }, 8000)
    }
  }

  // Toggles play/pause
  const togglePlayPause = () => {
    clearTimeout(userInteractionTimeoutRef.current)
    if (isPlaying) {
      setIsPlaying(false)
      setIsExplicitlyPaused(true)
    } else {
      setIsPlaying(true)
      setIsExplicitlyPaused(false)
    }
  }

  const handleScrollLeft = () => {
    handleUserInteraction()
    setActiveStep((prev) => (prev - 1 + 4) % 4)
  }

  const handleScrollRight = () => {
    handleUserInteraction()
    setActiveStep((prev) => (prev + 1) % 4)
  }

  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    const itemWidth = 280

    const updateCenterMagnification = () => {
      const rect = track.getBoundingClientRect()
      const center = rect.left + rect.width / 2
      const cards = track.querySelectorAll(".slider-card")

      cards.forEach((card: any) => {
        const cardRect = card.getBoundingClientRect()
        const cardCenter = cardRect.left + cardRect.width / 2
        const distance = Math.abs(center - cardCenter)

        const maxDistance = 300
        const factor = Math.max(0, 1 - distance / maxDistance)
        const scale = 0.88 + factor * 0.24
        const opacity = 0.4 + factor * 0.6

        card.style.transform = `scale(${scale})`
        card.style.opacity = `${opacity}`

        if (distance < 140) {
          card.style.borderColor = "var(--border)"
          card.style.boxShadow = "none"
        } else {
          card.style.borderColor = "var(--border)"
          card.style.boxShadow = "none"
        }
      })
    }

    const handleScroll = () => {
      updateCenterMagnification()

      if (!isAutoScrollingRef.current) {
        const scrollPos = track.scrollLeft
        const currentStep = Math.round(scrollPos / itemWidth)
        const clampedStep = Math.max(0, Math.min(3, currentStep))
        setActiveStep(clampedStep)
      }
    }

    track.addEventListener("scroll", handleScroll)
    track.addEventListener("mousedown", handleUserInteraction)
    track.addEventListener("touchstart", handleUserInteraction, { passive: true })
    track.addEventListener("wheel", handleUserInteraction, { passive: true })

    // Initial styling setup
    setTimeout(updateCenterMagnification, 100)

    return () => {
      track.removeEventListener("scroll", handleScroll)
      track.removeEventListener("mousedown", handleUserInteraction)
      track.removeEventListener("touchstart", handleUserInteraction)
      track.removeEventListener("wheel", handleUserInteraction)
      clearTimeout(userInteractionTimeoutRef.current)
    }
  }, [isExplicitlyPaused, isPlaying])

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  return (
    <div className="flex flex-col items-center bg-background text-foreground w-full overflow-x-hidden aceternity-grid">
      
      {/* 1. HERO SECTION */}
      <section className="w-full max-w-7xl mx-auto px-6 pt-32 pb-20 relative z-10 font-sans">
        <div className="grid lg:grid-cols-12 gap-12 items-center text-left">
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-zinc-100 dark:bg-zinc-900 rounded-full border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
              ✓ Privacy-First EXIF Repair
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-foreground leading-tight">
              Missing Google Takeout metadata? <br/>
              <span className="text-zinc-900 dark:text-zinc-100 font-bold underline decoration-zinc-400 dark:decoration-zinc-800 decoration-2 underline-offset-4">Restore photo dates, GPS locations, timestamps, and EXIF information.</span>
            </h1>
            <p className="text-lg sm:text-xl text-zinc-500 font-normal leading-relaxed max-w-2xl">
              Restore missing EXIF dates, GPS coordinates, timestamps, and other metadata from Google Takeout archives. Everything runs locally in your browser—your files never leave your device.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 pt-2 items-center">
              <Link to="/restore-data" className="text-zinc-500 hover:text-foreground transition-colors flex items-center justify-center h-14 font-bold px-6 w-full sm:w-auto">
                Restore Guide
              </Link>
              <Link to="/tool" className="w-full sm:w-auto">
                <button className="btn-monochrome-primary rounded-lg px-8 h-14 font-bold transition-all w-full sm:w-auto cursor-pointer flex items-center justify-center gap-2">
                  Restore My Data
                  <ArrowRight className="w-5 h-5" />
                </button>
              </Link>
            </div>
          </div>
          <div className="lg:col-span-5 relative">
            <div className="absolute inset-0 bg-zinc-500/5 blur-[120px] rounded-full"></div>
            <img 
              src="/hero-graphic-light.png" 
              alt="TakeoutFix local workspace metadata restoration tool interface screenshot" 
              className="relative rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-none w-full object-cover max-h-[450px] block dark:hidden"
            />
            <img 
              src="/hero-graphic-dark.png" 
              alt="TakeoutFix local workspace metadata restoration tool interface screenshot" 
              className="relative rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-none w-full object-cover max-h-[450px] hidden dark:block"
            />
          </div>
        </div>

        {/* TRUST BAR / CHECKLIST (IMMEDIATELY BELOW HERO) */}
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 text-sm font-semibold text-zinc-700 dark:text-zinc-350 px-4 py-8 border-y border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20 mt-16 rounded-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-zinc-900 dark:text-zinc-100 flex-shrink-0" />
            <span>Local Processing</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-zinc-900 dark:text-zinc-100 flex-shrink-0" />
            <span>No Photos Uploaded</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-zinc-900 dark:text-zinc-100 flex-shrink-0" />
            <span>Thousands of files supported</span>
          </div>
        </div>
      </section>

      <div className="w-full max-w-4xl mx-auto px-6 my-8">
        <AdUnit type="horizontal" slot="1" />
      </div>

      {/* 2. STATS SECTION */}
      <section className="w-full relative z-10">
        <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1 bg-zinc-100 dark:bg-zinc-900 rounded-full border border-zinc-200 dark:border-zinc-800 z-20">
          <div className="w-2 h-2 rounded-full bg-zinc-500 animate-pulse"></div>
          <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Realtime Telemetry</span>
        </div>
        <div className="max-w-7xl mx-auto px-4 py-24 sm:py-36 grid grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-8 text-center">
          <div className="glass-card p-5 sm:p-10 flex flex-col items-center justify-center">
            <div className="text-2xl sm:text-4xl md:text-5xl font-black mb-2 sm:mb-4 text-foreground">{(stats.usersCount || 5).toLocaleString()}</div>
            <div className="text-[10px] sm:text-xs md:text-sm font-bold text-zinc-400 uppercase tracking-widest">Registered Users</div>
          </div>
          <div className="glass-card p-5 sm:p-10 flex flex-col items-center justify-center">
            <div className="text-2xl sm:text-4xl md:text-5xl font-black mb-2 sm:mb-4 text-foreground">{stats.filesRestored.toLocaleString()}</div>
            <div className="text-[10px] sm:text-xs md:text-sm font-bold text-zinc-400 uppercase tracking-widest">Files Restored</div>
          </div>
          <div className="glass-card p-5 sm:p-10 flex flex-col items-center justify-center">
            <div className="text-2xl sm:text-4xl md:text-5xl font-black mb-2 sm:mb-4 text-foreground">{formatBytes(stats.bytesProcessed)}</div>
            <div className="text-[10px] sm:text-xs md:text-sm font-bold text-zinc-400 uppercase tracking-widest">Data Processed</div>
          </div>
          <div className="glass-card p-5 sm:p-10 flex flex-col items-center justify-center">
            <div className="text-2xl sm:text-4xl md:text-5xl font-black mb-2 sm:mb-4 text-foreground">{successRate.toFixed(1)}%</div>
            <div className="text-[10px] sm:text-xs md:text-sm font-bold text-zinc-400 uppercase tracking-widest">Success Rate</div>
          </div>
          <div className="glass-card p-5 sm:p-10 flex flex-col items-center justify-center col-span-2 lg:col-span-1">
            <div className="text-2xl sm:text-4xl md:text-5xl font-black mb-2 sm:mb-4 text-foreground">{stats.ticketsResolved.toLocaleString()}</div>
            <div className="text-[10px] sm:text-xs md:text-sm font-bold text-zinc-400 uppercase tracking-widest">Tickets Resolved</div>
          </div>
        </div>
      </section>

      {/* 3. PROBLEM SECTION */}
      <section className="w-full max-w-7xl mx-auto px-4 py-36 grid md:grid-cols-2 gap-16 items-center relative z-10">
        <div>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tighter mb-6">The Google Takeout Problem.</h2>
          <div className="space-y-6 text-xl text-zinc-500 leading-relaxed">
            <p>When you export your data from Google Photos using Google Takeout, your files are systematically stripped of their most important context.</p>
            <p><strong className="text-foreground">Google Takeout separates metadata.</strong> Your original `.jpg` or `.mp4` is exported cleanly, but the timestamps and GPS coordinates are exiled to a completely separate `.json` sidecar file.</p>
            <p>Without intervention, <strong className="text-foreground">your photos lose dates and your gallery timelines break.</strong> Your precious memories from 2014 will show up as "Today" on your new device.</p>
          </div>
        </div>
        <div className="relative">
          <div className="absolute inset-0 bg-zinc-550/5 blur-[100px] rounded-full"></div>
          <div className="relative bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6 sm:p-8 flex flex-col gap-4 shadow-none">
            <div className="flex items-center justify-between p-4 bg-zinc-100 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <span className="font-mono text-xs sm:text-sm truncate mr-2 text-foreground">IMG_20140812.jpg</span>
              <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            </div>
            <div className="flex justify-center"><ArrowRight className="w-6 h-6 text-zinc-400 dark:text-zinc-600 rotate-90" /></div>
            <div className="flex items-center justify-between p-4 bg-zinc-100 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <span className="font-mono text-xs sm:text-sm truncate mr-2 text-foreground">IMG_20140812.jpg.json</span>
              <FileJson className="w-5 h-5 text-amber-500 flex-shrink-0" />
            </div>
            <div className="mt-4 text-center text-sm text-red-500 font-medium bg-red-500/10 border border-red-500/20 py-2 rounded-lg">Disconnected Metadata</div>
          </div>
        </div>
      </section>

      <div className="w-full max-w-4xl mx-auto px-6 my-8">
        <AdUnit type="horizontal" slot="2" />
      </div>

      {/* 4. SOLUTION (BEFORE / AFTER - INTERACTIVE COMPARE SLIDER) */}
      <section className="w-full py-36 relative z-10">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tighter mb-16">The TakeoutFix Solution</h2>
          <Compare />
        </div>
      </section>

      <div className="w-full max-w-4xl mx-auto px-6 my-8">
        <AdUnit type="horizontal" slot="3" />
      </div>

      {/* 5. PRIVACY SECTION */}
      <section className="w-full max-w-7xl mx-auto px-4 py-36 text-center relative z-10">
        <Lock className="w-24 h-24 text-zinc-900 dark:text-zinc-100 mx-auto mb-8" />
        <h2 className="text-5xl font-bold tracking-tighter mb-6">Your Files Never Leave Your Device.</h2>
        <p className="text-2xl text-zinc-500 max-w-3xl mx-auto leading-relaxed mb-12">
          We built TakeoutFix to run <strong>entirely inside your web browser</strong>. When you select your Takeout folder, our engine reads the files, matches the metadata, and writes the restored files directly to your hard drive. <br/><br/>
          <strong className="text-foreground">Zero uploads. Zero cloud processing. Privacy by Design.</strong>
        </p>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto text-left">
          <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-6 rounded-lg">
            <Cpu className="w-8 h-8 text-zinc-900 dark:text-zinc-100 mb-4" />
            <h3 className="text-xl font-bold mb-2">Local Processing</h3>
            <p className="text-zinc-500 text-sm leading-relaxed">Harnessing the power of HTML5 File System Access APIs, we process gigabytes of data locally utilizing your machine's CPU.</p>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-6 rounded-lg">
            <HardDrive className="w-8 h-8 text-zinc-900 dark:text-zinc-100 mb-4" />
            <h3 className="text-xl font-bold mb-2">Direct Write</h3>
            <p className="text-zinc-500 text-sm leading-relaxed">Restored files are injected with EXIF data and saved directly back to your local storage without ever touching an external server.</p>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-6 rounded-lg">
            <ShieldCheck className="w-8 h-8 text-zinc-900 dark:text-zinc-100 mb-4" />
            <h3 className="text-xl font-bold mb-2">Files stay on your device</h3>
            <p className="text-zinc-500 text-sm leading-relaxed">No tracking, no telemetry on your personal files. Your private memories remain strictly under your control.</p>
          </div>
        </div>
      </section>

      <div className="w-full max-w-4xl mx-auto px-6 my-8">
        <AdUnit type="horizontal" slot="4" />
      </div>

      {/* 6. HOW IT WORKS DIAGRAM */}
      <section className="w-full py-36 text-center relative overflow-hidden z-10">
        <div className="max-w-7xl mx-auto px-4 relative">
          <h2 className="text-4xl font-bold tracking-tighter mb-16">How It Works</h2>
          
          {/* Timeline Navigation Controls */}
          <div className="flex justify-center items-center gap-3 mb-6 max-w-4xl mx-auto px-6">
            <button 
              onClick={handleScrollLeft}
              className="w-10 h-10 rounded-full border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 bg-background flex items-center justify-center text-foreground transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer"
              aria-label="Previous step"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button 
              onClick={togglePlayPause}
              className="w-10 h-10 rounded-full border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 bg-background flex items-center justify-center text-foreground transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer"
              aria-label={isPlaying ? "Pause auto-scroll" : "Play auto-scroll"}
            >
              {isPlaying ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>
            <button 
              onClick={handleScrollRight}
              className="w-10 h-10 rounded-full border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 bg-background flex items-center justify-center text-foreground transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer"
              aria-label="Next step"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Timeline slider container */}
          <div className="relative max-w-4xl mx-auto px-6">
            {/* Center Focus Target Frame Indicator */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[210px] border-2 border-zinc-400/20 dark:border-zinc-600/20 rounded-lg pointer-events-none z-20 bg-zinc-500/[0.02]"></div>

            {/* Scrollable Track */}
            <div 
              ref={trackRef}
              className="flex items-center gap-6 overflow-x-auto no-scrollbar py-12 px-[calc(50%-128px)] scroll-smooth select-none cursor-grab active:cursor-grabbing"
              style={{ WebkitOverflowScrolling: 'touch', scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}
            >
              <div className="slider-card bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-8 rounded-lg w-64 min-w-[256px] h-48 flex-shrink-0 flex flex-col justify-center items-center text-center transition-all duration-300 scroll-snap-align-center" data-step="0">
                <div className="text-3xl font-black text-foreground mb-2 tracking-tight">Takeout</div>
                <div className="text-zinc-500 text-sm font-semibold">Photos + JSON</div>
              </div>
              <div className="slider-card bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-8 rounded-lg w-64 min-w-[256px] h-48 flex-shrink-0 flex flex-col justify-center items-center text-center transition-all duration-300 scroll-snap-align-center" data-step="1">
                <div className="text-3xl font-black text-foreground mb-2 tracking-tight">Matching</div>
                <div className="text-zinc-500 text-sm font-semibold">Fuzzy Logic Engine</div>
              </div>
              <div className="slider-card bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-8 rounded-lg w-64 min-w-[256px] h-48 flex-shrink-0 flex flex-col justify-center items-center text-center transition-all duration-300 scroll-snap-align-center" data-step="2">
                <div className="text-3xl font-black text-foreground mb-2 tracking-tight">Injection</div>
                <div className="text-zinc-500 text-sm font-semibold">EXIF Header Rebuild</div>
              </div>
              <div className="slider-card bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-8 rounded-lg w-64 min-w-[256px] h-48 flex-shrink-0 flex flex-col justify-center items-center text-center transition-all duration-300 scroll-snap-align-center" data-step="3">
                <div className="text-3xl font-black text-foreground mb-2 tracking-tight">Restored</div>
                <div className="text-zinc-500 text-sm font-semibold font-sans">Perfect Timelines</div>
              </div>
            </div>
          </div>

          <div className="mt-16">
            <Link to="/restore-data">
              <Button className="btn-monochrome-primary rounded-lg px-8 transition-all duration-150 cursor-pointer">See here for more details</Button>
            </Link>
          </div>
        </div>
      </section>

      <div className="w-full max-w-4xl mx-auto px-6 my-8">
        <AdUnit type="horizontal" slot="1" />
      </div>

      {/* 9. FAQ (INTERACTIVE EXPANDABLE FAQ DECK) */}
      <section className="w-full max-w-5xl mx-auto px-4 py-36 relative z-10">
        <h2 className="text-4xl font-bold tracking-tighter mb-12 text-center">Frequently Asked Questions</h2>
        <ExpandableFaq />
        <div className="mt-12 text-center">
          <Link to="/support">
            <Button variant="ghost" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">View all frequently asked questions &rarr;</Button>
          </Link>
        </div>
      </section>

    </div>
  )
}
