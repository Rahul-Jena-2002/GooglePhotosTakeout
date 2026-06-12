import { useEffect } from "react"
import { useParams, Link, useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { ShieldCheck, ArrowRight, CheckCircle2, AlertTriangle, Cpu, HardDrive, Eye, XCircle } from "lucide-react"

// SEO Keyword Permutation Dictionary
const actions: Record<string, string> = {
  restore: "Restore",
  recover: "Recover",
  fix: "Fix",
  repair: "Repair",
  merge: "Merge",
  sync: "Sync",
  rebuild: "Rebuild",
  reconstruct: "Reconstruct",
  retrieve: "Retrieve",
  preserve: "Preserve",
  extract: "Extract",
  convert: "Convert",
  transfer: "Transfer"
}

const targets: Record<string, string> = {
  metadata: "EXIF Metadata",
  exif: "EXIF Header Tags",
  gps: "GPS Coordinates",
  location: "GPS Locations",
  timestamp: "Original Timestamps",
  "date-taken": "Date Taken Tags",
  "creation-date": "Creation Dates",
  albums: "Photo Albums",
  "people-tags": "People Tags",
  "camera-data": "Camera and Lens Data",
  "photo-information": "Photo Metadata",
  "video-information": "Video Metadata"
}

const sources: Record<string, string> = {
  takeout: "Google Takeout",
  photos: "Google Photos",
  export: "Google Photos Export"
}

export default function SeoLandingPage() {
  const { seoSlug } = useParams<{ seoSlug: string }>()
  const navigate = useNavigate()
  
  const slug = (seoSlug || "").toLowerCase()
  
  // Default values
  let matchedAction = "Restore"
  let matchedTarget = "EXIF Metadata"
  let matchedSource = "Google Takeout"
  
  let isValidSeo = false
  
  // Parse keyword matches from slug
  for (const [key, val] of Object.entries(actions)) {
    if (slug.includes(key)) {
      matchedAction = val
      isValidSeo = true
      break
    }
  }
  
  for (const [key, val] of Object.entries(targets)) {
    if (slug.includes(key)) {
      matchedTarget = val
      isValidSeo = true
      break
    }
  }
  
  for (const [key, val] of Object.entries(sources)) {
    if (slug.includes(key)) {
      matchedSource = val
      isValidSeo = true
      break
    }
  }

  // Safety check to allow Google Photos/Takeout/Metadata paths
  if (slug.startsWith("google-") || slug.includes("takeout") || slug.includes("metadata") || slug.includes("exif")) {
    isValidSeo = true
  }

  // Redirect to landing page if path matches nothing related to the app
  useEffect(() => {
    if (!isValidSeo) {
      navigate("/", { replace: true })
    }
  }, [isValidSeo, navigate])

  // Inject meta tags for search indexing crawlers
  useEffect(() => {
    if (!isValidSeo) return
    
    document.title = `How to ${matchedAction} ${matchedTarget} from ${matchedSource} | TakeoutFix`
    
    let metaDesc = document.querySelector('meta[name="description"]')
    if (!metaDesc) {
      metaDesc = document.createElement('meta')
      metaDesc.setAttribute('name', 'description')
      document.head.appendChild(metaDesc)
    }
    metaDesc.setAttribute(
      'content', 
      `Learn how to ${matchedAction.toLowerCase()} your ${matchedTarget.toLowerCase()} from your ${matchedSource} export easily. TakeoutFix matches sidecar JSON data and injects EXIF metadata 100% locally in your browser.`
    )
  }, [isValidSeo, matchedAction, matchedTarget, matchedSource])

  if (!isValidSeo) return null

  return (
    <div className="bg-black text-zinc-100 min-h-screen py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden font-sans">
      {/* Background neon glows */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-900/10 blur-[150px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-20 right-1/4 w-[600px] h-[600px] bg-purple-900/10 blur-[150px] rounded-full pointer-events-none"></div>

      {/* Hero Section */}
      <div className="max-w-4xl mx-auto text-center mb-20 relative z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-semibold text-indigo-400 mb-6 font-mono"
        >
          <ShieldCheck className="w-4 h-4 text-indigo-400" />
          100% Local Browser Engine · HIPAA Compliant
        </motion.div>
        
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-4xl md:text-6xl font-extrabold tracking-tight text-white mb-6 leading-tight"
        >
          {matchedAction} <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-500">{matchedTarget}</span> from {matchedSource}
        </motion.h1>
        
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-lg md:text-xl text-zinc-400 max-w-3xl mx-auto font-normal leading-relaxed mb-8"
        >
          Did your {matchedSource} export strip out original dates, camera info, or GPS coordinates? TakeoutFix automatically merges the separate JSON metadata sidecar files back into your photos and videos offline on your device.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex justify-center"
        >
          <Link to="/tool">
            <Button size="lg" className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-90 text-white border-0 shadow-[0_0_35px_rgba(99,102,241,0.4)] px-10 h-14 font-semibold text-sm">
              Restore My Data <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </motion.div>
      </div>

      {/* Grid Content Sections */}
      <div className="max-w-6xl mx-auto relative z-10 space-y-16">
        
        {/* Comparison Showcase (Before / After) */}
        <Card className="bg-zinc-950/40 border-white/5 backdrop-blur-md overflow-hidden">
          <CardHeader className="border-b border-white/5 py-4 px-6">
            <CardTitle className="text-sm font-sans font-bold tracking-tight text-zinc-300 flex items-center gap-2">
              <Eye className="w-4 h-4 text-indigo-400" />
              Dynamic EXIF Header Verification Matrix
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8">
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
                    <span className="compare-file-name">IMG_3012.JPG</span>
                    <span className="compare-file-desc">3.1 MB · Camera Original</span>
                  </div>
                </div>

                <div className="compare-list">
                  <div className="compare-item">
                    <span className="compare-item-label">Date Taken</span>
                    <span className="compare-item-value-missing">Missing (Today's Date)</span>
                  </div>
                  <div className="compare-item">
                    <span className="compare-item-label">GPS Coordinates</span>
                    <span className="compare-item-value-missing">None (0.0, 0.0)</span>
                  </div>
                  <div className="compare-item">
                    <span className="compare-item-label">Camera Model</span>
                    <span className="compare-item-value-missing">Stripped</span>
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
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <span className="compare-file-name">IMG_3012.JPG</span>
                    <span className="compare-file-desc">3.1 MB · EXIF Restored</span>
                  </div>
                </div>

                <div className="compare-list">
                  <div className="compare-item">
                    <span className="compare-item-label">Date Taken</span>
                    <span className="compare-item-value-fixed">2018:04:12 18:32:04</span>
                  </div>
                  <div className="compare-item">
                    <span className="compare-item-label">GPS Coordinates</span>
                    <span className="compare-item-value-fixed">40.7128° N, 74.0060° W</span>
                  </div>
                  <div className="compare-item">
                    <span className="compare-item-label">Camera Model</span>
                    <span className="compare-item-value-fixed">Apple iPhone X</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Detailed Explanation Grid */}
        <div className="grid md:grid-cols-2 gap-8">
          <Card className="bg-zinc-950/40 border-white/5 backdrop-blur-md p-6">
            <CardHeader className="p-0 mb-4">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-3">
                <Cpu className="w-5 h-5 text-indigo-400" />
              </div>
              <CardTitle className="text-lg text-white">Why {matchedSource} Stripped Your {matchedTarget}</CardTitle>
            </CardHeader>
            <CardContent className="p-0 text-sm text-zinc-400 leading-relaxed space-y-4">
              <p>
                When exporting your photo library via {matchedSource}, the platform separates your media binary files from their descriptive headers. Instead of writing metadata directly inside the photo headers, it creates individual sidecar files ending in <code>.json</code>.
              </p>
              <p>
                As a result, importing these files into new systems (like Apple Photos, Windows Gallery, or Synology) displays them with wrong dates (often showing the date of your takeout export itself) and strips out GPS location tracking maps.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950/40 border-white/5 backdrop-blur-md p-6">
            <CardHeader className="p-0 mb-4">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-3">
                <HardDrive className="w-5 h-5 text-purple-400" />
              </div>
              <CardTitle className="text-lg text-white">How TakeoutFix Resolves the Bug Locally</CardTitle>
            </CardHeader>
            <CardContent className="p-0 text-sm text-zinc-400 leading-relaxed space-y-4">
              <p>
                TakeoutFix's client-side compilation engine bypasses network servers. By keeping file matching 100% on your device:
              </p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-zinc-300">
                  <CheckCircle2 className="w-4 h-4 text-purple-400 flex-shrink-0" />
                  <span>Recursively traverses directories to locate sidecar JSONs.</span>
                </li>
                <li className="flex items-center gap-2 text-zinc-300">
                  <CheckCircle2 className="w-4 h-4 text-purple-400 flex-shrink-0" />
                  <span>Executes name-hash matching to link edited and copy versions.</span>
                </li>
                <li className="flex items-center gap-2 text-zinc-300">
                  <CheckCircle2 className="w-4 h-4 text-purple-400 flex-shrink-0" />
                  <span>Writes binary headers directly without quality loss or recompression.</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Step-by-Step Recovery Guide */}
        <div className="text-center py-10">
          <h2 className="text-2xl font-bold mb-10 text-white">3 Steps to {matchedAction} {matchedTarget}</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-zinc-950/20 border border-zinc-900 rounded-xl p-5 text-left relative overflow-hidden">
              <span className="absolute right-4 top-2 text-5xl font-extrabold text-white/5 font-mono select-none">1</span>
              <h4 className="font-bold text-white mb-2">Select Folders</h4>
              <p className="text-xs text-zinc-450 leading-relaxed">
                Provide your {matchedSource} directory. TakeoutFix scans files recursively entirely within your local browser sandbox.
              </p>
            </div>
            
            <div className="bg-zinc-950/20 border border-zinc-900 rounded-xl p-5 text-left relative overflow-hidden">
              <span className="absolute right-4 top-2 text-5xl font-extrabold text-white/5 font-mono select-none">2</span>
              <h4 className="font-bold text-white mb-2">Run Matcher</h4>
              <p className="text-xs text-zinc-450 leading-relaxed">
                Our dynamic heuristic resolver maps modified, truncated, and multi-copy suffix filenames back to their parent JSON descriptors.
              </p>
            </div>

            <div className="bg-zinc-950/20 border border-zinc-900 rounded-xl p-5 text-left relative overflow-hidden">
              <span className="absolute right-4 top-2 text-5xl font-extrabold text-white/5 font-mono select-none">3</span>
              <h4 className="font-bold text-white mb-2">Inject Headers</h4>
              <p className="text-xs text-zinc-450 leading-relaxed">
                Timestamps, GPS coordinates, and camera info are written directly into binary headers, exporting clean folders for immediate import.
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* Call to Action Footer */}
      <div className="max-w-4xl mx-auto text-center mt-32 py-16 border-t border-zinc-900 relative z-10">
        <h2 className="text-3xl font-bold tracking-tight mb-4 text-white">Rebuild Your {matchedSource} Photos Today</h2>
        <p className="text-zinc-500 mb-8 max-w-md mx-auto">
          Start recovering your {matchedTarget.toLowerCase()} in seconds. Absolutely no sign-ups or software installation required.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link to="/tool">
            <Button size="lg" className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-90 text-white border-0 shadow-[0_0_35px_rgba(99,102,241,0.4)] px-10 h-14 font-semibold text-sm">
              Restore My Data <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
          <Link to="/pricing">
            <Button size="lg" variant="outline" className="rounded-full border-zinc-800 text-zinc-300 hover:bg-zinc-900 hover:text-white px-8 h-14 font-semibold">
              Compare Plans
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
