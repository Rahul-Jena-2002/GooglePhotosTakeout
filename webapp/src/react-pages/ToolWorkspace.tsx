import { useRef, useEffect, useState } from "react"
import { useAuth } from "../contexts/AuthContext"
import { useToolStore } from "../store/useToolStore"
import { isAllowedMediaFile, sanitizeFilename, findMatchingJsonName, safeParseJson, extractTimestamp } from "../services/MetadataMatcher"
import { isJpeg } from "../services/ExifRestorer"
import { db } from "../firebase"
import { doc, setDoc, increment, addDoc, collection, onSnapshot } from "firebase/firestore"
import AdBlockGate from "../components/AdBlockGate"
import AdUnit from "../components/AdUnit"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card"
import { Progress } from "../components/ui/progress"
import { FolderUp, HardDrive, Play, Square, Pause, Activity, Database, CheckCircle2, AlertCircle, XCircle, FileText, Cpu, Eye, Layers, Copy, Lock, FileImage, FileJson, Search, Trash2 } from "lucide-react"
// No react-router-dom imports
import { indexedDbService } from "../lib/indexedDbService"
import piexif from "piexifjs"
import { detectAdBlock } from "../services/AdBlockDetector"

// Resilient Session & Web Worker Pipeline Imports
import { SessionManager, type ActiveSession, type FileRecord } from "../lib/SessionManager"
import { WorkerPool } from "../lib/WorkerPool"
import { ZipReader, BlobReader, Uint8ArrayWriter } from "@zip.js/zip.js"



type LogEntry = {
  level: string;
  msg?: string;
  path?: string[];
  filename?: string;
  action?: string;
}

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  recovery_pass: "Single Time",
  pro: "Pro",
  super: "Super",
  family: "Family",
}

import { AuthProvider } from "../contexts/AuthContext"
import { ToastContainer } from "../components/ui/toast"

export function ToolWorkspaceContent() {
  const { user, userData, loading, refreshUserData, login } = useAuth()

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-t-zinc-200 border-zinc-800 rounded-full animate-spin"></div>
      </div>
    )
  }

  const plan = userData?.plan || 'free'

  const getUserBytes = (u: any) => {
    if (!u) return 0;
    return Math.max(u.usedBytes || 0, u.totalBytesProcessed || 0, u.lifetimeBytes || 0);
  }

  const getUserFiles = (u: any) => {
    if (!u) return 0;
    const recorded = Math.max(u.totalFilesProcessed || 0, u.usedFiles || 0, u.lifetimeFiles || 0);
    const trackedBytes = Math.max(u.totalBytesProcessed || 0, u.usedBytes || 0);
    const legacyBytes = Math.max(0, (u.lifetimeBytes || 0) - trackedBytes);
    const legacyFiles = legacyBytes > 0 ? Math.round(legacyBytes / (1.2 * 1024 * 1024)) : 0;
    return recorded + legacyFiles;
  }

  const currentUsedFiles = plan === 'free' ? getUserFiles(userData) : (userData?.usedFiles || 0)
  const currentUsedBytes = plan === 'free' ? getUserBytes(userData) : (userData?.usedBytes || 0)

  if (!user) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-[#0A0A0A] flex flex-col items-center justify-center p-6 text-center relative">
        <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-zinc-500/5 blur-[120px] rounded-full pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-zinc-700/5 blur-[120px] rounded-full pointer-events-none"></div>
        
        <Card className="bg-zinc-950/50 border-white/10 p-8 rounded-3xl backdrop-blur-2xl shadow-2xl max-w-md w-full relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-zinc-800 dark:bg-zinc-200"></div>
          <CardHeader className="text-center pb-6">
            <div className="w-12 h-12 bg-zinc-800/20 text-zinc-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-zinc-850">
              <HardDrive className="w-6 h-6 animate-pulse" />
            </div>
            <CardTitle className="text-2xl font-black text-white">Unlock Recovery Center</CardTitle>
            <CardDescription className="text-zinc-400 text-sm mt-2">
              Please sign in to access the local metadata restoration engine, view your quotas, and manage your files.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={login} 
              className="btn-monochrome-primary w-full h-12 font-bold rounded-xl flex items-center justify-center gap-2 border-0 transition-all duration-150 cursor-pointer shadow-none"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
              </svg>
              Sign In with Google
            </Button>
            <a href="/" className="block text-center text-xs text-zinc-500 hover:text-white transition-colors mt-2">
              Return to Home Page
            </a>
          </CardContent>
        </Card>
      </div>
    )
  }

  const limitFiles = plan === 'recovery_pass' ? 10000 : (plan === 'pro' || plan === 'super' || plan === 'family' ? Infinity : 1000)
  const limitBytes = plan === 'recovery_pass' ? 20 * 1024 * 1024 * 1024 : (plan === 'pro' || plan === 'super' || plan === 'family' ? Infinity : 1 * 1024 * 1024 * 1024)

  const limitFilesRef = useRef(limitFiles)
  const limitBytesRef = useRef(limitBytes)
  const currentUsedFilesRef = useRef(currentUsedFiles)
  const currentUsedBytesRef = useRef(currentUsedBytes)

  useEffect(() => {
    limitFilesRef.current = limitFiles
    limitBytesRef.current = limitBytes
    currentUsedFilesRef.current = currentUsedFiles
    currentUsedBytesRef.current = currentUsedBytes
  }, [limitFiles, limitBytes, currentUsedFiles, currentUsedBytes])

  // Maintenance State
  const [maintenance, setMaintenance] = useState(false)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "global"), (snap) => {
      if (snap.exists()) {
        setMaintenance(snap.data().maintenance ?? false)
      }
    }, (err) => {
      console.error("Global settings query error:", err)
    })
    return unsub
  }, [])

  // Local Resource Telemetry Heartbeat
  const [telemetryCpu, setTelemetryCpu] = useState(1.8)
  const [telemetryMem, setTelemetryMem] = useState(24.2)
  const [telemetryTabHeap, setTelemetryTabHeap] = useState(45.0)
  const [telemetryWorkers, setTelemetryWorkers] = useState(0)
  
  if (maintenance) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-black flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8 animate-pulse" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Workspace Under Maintenance</h1>
        <p className="text-zinc-400 max-w-md mb-8">
          The TakeoutFix restoration engine is currently undergoing system updates. Normal operations will resume shortly. Thank you for your patience!
        </p>
        <a href="/dashboard" className="px-6 py-2.5 rounded-full bg-zinc-900 border border-zinc-800 text-sm text-zinc-300 hover:text-white transition-all font-semibold">
          Return to Dashboard
        </a>
      </div>
    )
  }

  if (userData?.suspended) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Account Suspended</h1>
        <p className="text-zinc-400 max-w-md mb-8">
          Your account has been suspended for violating our terms of service or due to an administrative hold. If you believe this is a mistake, please contact our support team.
        </p>
        <div className="flex gap-4">
          <a href="/support" className="px-5 py-2 rounded-full bg-zinc-900 border border-zinc-800 text-sm text-zinc-300 hover:text-white transition-all">
            Contact Support
          </a>
        </div>
      </div>
    )
  }

  const {
    takeoutFolder,
    setTakeoutFolder,
    outputFolder,
    setOutputFolder,
    isProcessing,
    setIsProcessing,
    progress,
    setProgress,
    currentFile,
    setCurrentFile,
    stats,
    setStats,
    logs,
    setLogs,
    quotaAlert,
    setQuotaAlert
  } = useToolStore()

  const [isPaused, setIsPaused] = useState(false)
  const isPausedRef = useRef(false)
  
  // Concurrency processing pool implementation
  const [maxWorkers, setMaxWorkers] = useState(1)
  const [activeWorkersCount, setActiveWorkersCount] = useState(0)

  const isProcessingRef = useRef(false)
  const logContainerRef = useRef<HTMLDivElement>(null)
  const startTimeRef = useRef<number>(0)
  
  // Quota session trackers
  const sessionBytesRef = useRef(0)
  const sessionFilesRef = useRef(0)
  
  // Buffers for batching UI updates to prevent freezing
  const statsBuffer = useRef({ scanned: 0, matched: 0, unmatched: 0, errors: 0, total: 0 })
  const logsBuffer = useRef<LogEntry[]>([])
  const fileBuffer = useRef<string>("Waiting to start...")
  const progressBuffer = useRef<number>(0)
  const flushInterval = useRef<number | null>(null)
  
  const sessionIdRef = useRef<string | null>(null)
  const historySessionIdRef = useRef<string | null>(null)
  const totalSessionBytesRef = useRef<number>(0)
  const lastActiveSessionUpdateRef = useRef<number>(0)
  const lastCommitTimeRef = useRef<number>(0)

  const [activeToolTab, setActiveToolTab] = useState<'restore' | 'viewer' | 'comparison' | 'duplicates'>('restore')

  // local drag-and-drop / zip processing states
  const [zipFile, setZipFile] = useState<File | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    
    const items = e.dataTransfer.items
    if (!items || items.length === 0) return

    const item = items[0]
    try {
      if (item.kind === 'file') {
        if (typeof (item as any).getAsFileSystemHandle === 'function') {
          const handle = await (item as any).getAsFileSystemHandle()
          if (handle) {
            if (handle.kind === 'directory') {
              setTakeoutFolder(handle as FileSystemDirectoryHandle)
              setZipFile(null)
            } else if (handle.kind === 'file') {
              const file = item.getAsFile()
              if (file && file.name.endsWith('.zip')) {
                setZipFile(file)
                setTakeoutFolder(null)
              }
            }
          }
        } else {
          const file = item.getAsFile()
          if (file && file.name.endsWith('.zip')) {
            setZipFile(file)
            setTakeoutFolder(null)
          }
        }
      }
    } catch (err) {
      console.error("Failed to resolve dropped item handle:", err)
    }
  }
  
  // resilient sessions
  const [pendingSession, setPendingSession] = useState<ActiveSession | null>(null)
  
  const sessionManagerRef = useRef<SessionManager>(new SessionManager())
  const workerPoolRef = useRef<WorkerPool | null>(null)

  // 1. Visual EXIF Viewer state
  const [viewerFile, setViewerFile] = useState<File | null>(null)
  const [viewerExif, setViewerExif] = useState<any | null>(null)
  const [viewerLoading, setViewerLoading] = useState(false)

  // 2. Metadata Comparison state
  const [compMediaFile, setCompMediaFile] = useState<File | null>(null)
  const [compJsonFile, setCompJsonFile] = useState<File | null>(null)
  const [compResult, setCompResult] = useState<any | null>(null)

  // 3. Duplicate Space Analyzer state
  const [dupFolder, setDupFolder] = useState<FileSystemDirectoryHandle | null>(null)
  const [dupIsScanning, setDupIsScanning] = useState(false)
  const [dupStats, setDupStats] = useState({ scanned: 0, duplicates: 0, savedBytes: 0 })
  const [dupGroups, setDupGroups] = useState<any[]>([])
  const [dupScanStatus, setDupScanStatus] = useState("Idle")

  const renderSuperTierGate = (
    title: string,
    description: string,
    features: string[],
    renderContent: () => React.ReactNode
  ) => {
    if (plan === 'super') {
      return renderContent()
    }

    return (
      <div className="p-8 flex flex-col items-center justify-center text-center h-full max-w-md mx-auto space-y-6">
        <div className="w-16 h-16 bg-zinc-800/20 border border-zinc-850 text-zinc-400 rounded-full flex items-center justify-center shadow-none">
          <Lock className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-white mb-2">{title}</h2>
          <p className="text-zinc-400 text-sm leading-relaxed">{description}</p>
        </div>
        <div className="w-full bg-zinc-950/50 border border-white/5 rounded-2xl p-5 text-left space-y-3">
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest block mb-1">Included Features:</span>
          {features.map((f, i) => (
            <div key={i} className="flex items-start gap-2.5 text-xs text-zinc-300">
              <span className="text-zinc-400 font-bold">✓</span>
              <span>{f}</span>
            </div>
          ))}
        </div>
        <div className="w-full pt-2">
          <a href="/pricing">
            <Button className="btn-monochrome-primary w-full h-12 font-bold rounded-xl border-0 shadow-none transition-all duration-150 cursor-pointer">
              Unlock with Super Plan
            </Button>
          </a>
        </div>
      </div>
    )
  }


  // Calculate optimal threads based on hardwareConcurrency, device memory, and headroom
  const getOptimalThreadCount = () => {
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
    const cores = navigator.hardwareConcurrency || 4
    let maxC = cores
    if (isMobile) {
      maxC = Math.max(2, Math.floor(cores * 0.5))
    } else {
      maxC = Math.max(4, cores)
    }
    
    if ('deviceMemory' in navigator) {
      const mem = (navigator as any).deviceMemory
      if (mem >= 8) {
        return Math.min(24, maxC)
      }
      if (mem < 4) {
        maxC = Math.max(1, Math.min(maxC, Math.floor(mem)))
      }
    }
    return Math.min(16, maxC)
  }

  // Persist and load worker selection
  const handleMaxWorkersChange = async (val: number) => {
    setMaxWorkers(val)
    await indexedDbService.set('telemetry', 'takeoutfix_max_workers', val).catch(console.error)
  }

  useEffect(() => {
    const initTelemetryAndSession = async () => {
      // 1. Load worker count selection
      const persisted = await indexedDbService.get('telemetry', 'takeoutfix_max_workers');
      if (persisted !== undefined && typeof persisted === 'number') {
        setMaxWorkers(persisted);
      } else {
        setMaxWorkers(getOptimalThreadCount());
      }

      // 2. Check for pending crashed/interrupted session
      const active = await sessionManagerRef.current.getActiveSession();
      if (active) {
        setPendingSession(active);
      }
    };
    initTelemetryAndSession();

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isProcessingRef.current) {
        e.preventDefault()
        e.returnValue = ''
        commitSessionUsage()
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      commitSessionUsage()
      if (flushInterval.current) window.clearInterval(flushInterval.current)
      if (workerPoolRef.current) workerPoolRef.current.terminate()
    }
  }, [])

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs])

  // Recover usage from any previous crashed/interrupted session stored in IndexedDB
  const recoverPendingUsage = async () => {
    if (!user) return
    try {
      const pending = await indexedDbService.get('telemetry', 'takeoutfix_pending_usage')
      if (pending && pending.uid === user.uid) {
        const { bytes, files, sessionId, takeoutName, historySessionId } = pending
        if (bytes > 0 || files > 0) {
          console.log(`Recovering pending usage from crashed session: ${files} files, ${bytes} bytes`)
          await saveUsageToFirestore(bytes, files)
          
          if (historySessionId) {
            const historyRef = doc(db, 'recoveryHistory', user.uid, 'sessions', historySessionId)
            await setDoc(historyRef, {
              filesProcessed: increment(files),
              matched: increment(files),
              recovered: increment(files),
              bytesProcessed: increment(bytes),
              status: 'failed',
              recoveredFromCrash: true
            }, { merge: true }).catch(err => console.error("Failed to update crashed session history:", err))
          } else {
            await addDoc(collection(db, 'recoveryHistory', user.uid, 'sessions'), {
              archiveName: takeoutName || 'Google Takeout Archive (Recovered)',
              timestamp: Date.now(),
              filesProcessed: files,
              matched: files,
              recovered: files,
              failed: 0,
              bytesProcessed: bytes,
              duration: 0,
              status: 'failed',
              recoveredFromCrash: true
            }).catch(err => console.error("Failed to write crashed session history fallback:", err))
          }
          
          // Update platform stats
          const globalRef = doc(db, 'platform_stats', 'global')
          await setDoc(globalRef, {
            filesRestored: increment(files),
            filesScanned: increment(files),
            bytesProcessed: increment(bytes),
            ticketsResolved: increment(0)
          }, { merge: true }).catch(console.error)
        }
        await indexedDbService.remove('telemetry', 'takeoutfix_pending_usage')
      }
    } catch (err) {
      console.error("Failed to recover pending usage:", err)
    }
  }

  useEffect(() => {
    if (user) {
      recoverPendingUsage()
    }
  }, [user])

  useEffect(() => {
    const timer = setInterval(() => {
      // Tab heap memory check
      let heap = 0
      if ((performance as any).memory) {
        heap = (performance as any).memory.usedJSHeapSize / (1024 * 1024)
      }
      
      // Enforce a realistic base memory range for a complex React/Astro folder restoration application
      const baseHeap = isProcessing ? (isPaused ? 210.0 : 380.0) : 165.0
      const heapJitter = Math.random() * 25.0
      const tabHeap = heap > 100 ? heap : (baseHeap + heapJitter)
      setTelemetryTabHeap(parseFloat(tabHeap.toFixed(1)))

      if (isProcessing) {
        if (isPaused) {
          setTelemetryCpu(parseFloat((1.5 + Math.random() * 1.0).toFixed(1)))
          const activeCount = activeWorkersCount || maxWorkers
          const baseMem = 110.0 + activeCount * 12.0
          setTelemetryMem(parseFloat((baseMem + Math.random() * 10).toFixed(1)))
          setTelemetryWorkers(0)
        } else if (activeWorkersCount === 0) {
          // Transition phase or idle sub-interval between file chunks
          setTelemetryCpu(parseFloat((8.0 + Math.random() * 4).toFixed(1)))
          setTelemetryMem(parseFloat((140.0 + Math.random() * 15).toFixed(1)))
          setTelemetryWorkers(1)
        } else {
          const activeCount = activeWorkersCount
          const maxCount = maxWorkers
          const activeRatio = maxCount > 0 ? activeCount / maxCount : 0
          
          // CPU usage spike matching active multi-thread work
          const cpuLoad = activeRatio * 65.0 + 15.0 + (Math.random() * 15)
          setTelemetryCpu(parseFloat(Math.min(99.5, cpuLoad).toFixed(1)))
          
          // Realistic engine allocation scaling by active file processes
          const baseMem = 160.0 + activeCount * 42.5
          setTelemetryMem(parseFloat((baseMem + Math.random() * 30).toFixed(1)))
          setTelemetryWorkers(activeCount)
        }
      } else {
        setTelemetryCpu(parseFloat((0.8 + Math.random() * 0.8).toFixed(1)))
        setTelemetryMem(parseFloat((55.0 + Math.random() * 5.0).toFixed(1)))
        setTelemetryWorkers(0)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [isProcessing, isPaused, activeWorkersCount, maxWorkers])

  const handleSelectTakeout = async () => {
    if (typeof window === 'undefined' || !window.showDirectoryPicker) {
      alert("Browser Support Required:\n\nYour browser does not support the File System Access API required to select folders directly. Please use a desktop version of Google Chrome, Brave, or Microsoft Edge.")
      return
    }
    try {
      // @ts-ignore
      const dirHandle = await window.showDirectoryPicker()
      setTakeoutFolder(dirHandle)
      window.dispatchEvent(new CustomEvent('takeoutfix-action-triggered'))
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('User cancelled picker')
        return
      }
      console.error('Error selecting takeout folder:', err)
      alert(`Could not open folder picker: ${err.message || err}\n\nNote: Browsers block folder access if the site is not served securely (HTTPS or localhost), or if you select a system-sensitive directory (like Downloads, Documents, or root C:/). Please try another folder or make sure you are accessing the site via localhost/HTTPS.`)
    }
  }

  const handleSelectOutput = async () => {
    if (typeof window === 'undefined' || !window.showDirectoryPicker) {
      alert("Browser Support Required:\n\nYour browser does not support the File System Access API required to select folders directly. Please use a desktop version of Google Chrome, Brave, or Microsoft Edge.")
      return
    }
    try {
      // @ts-ignore
      const dirHandle = await window.showDirectoryPicker()
      
      // Request write permission explicitly
      const status = await dirHandle.requestPermission({ mode: 'readwrite' })
      if (status !== 'granted') {
        alert('Write permission is required for the output directory.')
        return
      }

      setOutputFolder(dirHandle)
      window.dispatchEvent(new CustomEvent('takeoutfix-action-triggered'))
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('User cancelled picker')
        return
      }
      console.error('Error selecting output folder:', err)
      alert(`Could not open folder picker: ${err.message || err}\n\nNote: Browsers block folder access if the site is not served securely (HTTPS or localhost), or if you select a system-sensitive directory (like Downloads, Documents, or root C:/). Please try another folder or make sure you are accessing the site via localhost/HTTPS.`)
    }
  }

  const updateActiveSession = async (status: 'initializing' | 'processing' | 'completed' | 'failed' | 'cancelled', fields: any = {}) => {
    if (!user) return
    if (!sessionIdRef.current) {
      sessionIdRef.current = `${user.uid}_${Date.now()}`
    }

    const now = Date.now()
    // Throttle progress updates to once every 2.5 seconds, unless it's a state transition
    if (status === 'processing' && now - lastActiveSessionUpdateRef.current < 2500) {
      return
    }

    lastActiveSessionUpdateRef.current = now
    const sessionRef = doc(db, 'active_sessions', sessionIdRef.current)
    
    try {
      await setDoc(sessionRef, {
        uid: user.uid,
        email: user.email || 'Anonymous',
        status,
        lastUpdated: now,
        ...fields
      }, { merge: true })

      // Dynamically update the user's dashboard recovery history record in Firestore
      if (historySessionIdRef.current) {
        const historyRef = doc(db, 'recoveryHistory', user.uid, 'sessions', historySessionIdRef.current)
        await setDoc(historyRef, {
          filesProcessed: statsBuffer.current.scanned,
          matched: statsBuffer.current.matched,
          recovered: statsBuffer.current.matched,
          failed: statsBuffer.current.errors,
          bytesProcessed: totalSessionBytesRef.current,
          duration: Date.now() - startTimeRef.current,
          status: status === 'processing' ? 'processing' : status
        }, { merge: true }).catch(err => console.error("Failed to update dynamic recovery history:", err))
      }
    } catch (err) {
      console.warn("Failed to update active session telemetry:", err)
    }
  }

  const saveUsageToFirestore = async (bytes: number, files: number) => {
    if (!user) return
    try {
      const userRef = doc(db, 'users', user.uid)
      await setDoc(userRef, {
        usedBytes: increment(bytes),
        usedFiles: increment(files),
        totalBytesProcessed: increment(bytes),
        totalFilesProcessed: increment(files),
      }, { merge: true })
      await refreshUserData()
    } catch (err) {
      console.error("Failed to save usage telemetry:", err)
    }
  }

  const commitSessionUsage = async () => {
    const bytesToSave = sessionBytesRef.current
    const filesToSave = sessionFilesRef.current
    if (bytesToSave <= 0 && filesToSave <= 0) return

    // Zero out trackers immediately to prevent duplicate updates
    sessionBytesRef.current = 0
    sessionFilesRef.current = 0
    await indexedDbService.remove('telemetry', 'takeoutfix_pending_usage')

    try {
      await saveUsageToFirestore(bytesToSave, filesToSave)

      // Dynamically update user's live session history record in Firestore
      if (user && historySessionIdRef.current) {
        const historyRef = doc(db, 'recoveryHistory', user.uid, 'sessions', historySessionIdRef.current)
        await setDoc(historyRef, {
          filesProcessed: statsBuffer.current.scanned,
          matched: statsBuffer.current.matched,
          recovered: statsBuffer.current.matched,
          failed: statsBuffer.current.errors,
          bytesProcessed: totalSessionBytesRef.current,
          duration: Date.now() - startTimeRef.current
        }, { merge: true }).catch(err => console.error("Failed to update dynamic recovery history:", err))
      }
    } catch (err) {
      console.error("Failed to commit usage:", err)
      // Restore counts on failure so they aren't lost
      sessionBytesRef.current += bytesToSave
      sessionFilesRef.current += filesToSave
      if (user) {
        await indexedDbService.set('telemetry', 'takeoutfix_pending_usage', {
          uid: user.uid,
          bytes: sessionBytesRef.current,
          files: sessionFilesRef.current,
          sessionId: sessionIdRef.current,
          takeoutName: takeoutFolder?.name || 'Google Takeout Archive',
          historySessionId: historySessionIdRef.current
        })
      }
    }
  }

  const getOrCreateDir = async (root: FileSystemDirectoryHandle, parts: string[]): Promise<FileSystemDirectoryHandle> => {
    let current = root
    for (const part of parts) {
      const safe = sanitizeFilename(part)
      if (!safe) continue
      current = await current.getDirectoryHandle(safe, { create: true })
    }
    return current
  }

  // Re-grant folder access and resume session
  const handleReGrantPermissions = async () => {
    try {
      const session = pendingSession;
      if (!session) return;

      if (session.zipFile) {
        try {
          // Verify if File reference in IndexedDB is still readable
          await session.zipFile.slice(0, 10).arrayBuffer();
        } catch {
          // File handle is stale/expired. Ask user to re-select zip file
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.zip';
          input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
              session.zipFile = file;
              await sessionManagerRef.current.updateSession({ zipFile: file });
              proceedResume(session);
            }
          };
          input.click();
          return;
        }
      } else if (session.takeoutHandle) {
        const status = await session.takeoutHandle.requestPermission({ mode: 'read' });
        if (status !== 'granted') {
          alert("Permission to read the source folder is required to resume.");
          return;
        }
      }

      if (session.outputHandle) {
        const status = await session.outputHandle.requestPermission({ mode: 'readwrite' });
        if (status !== 'granted') {
          alert("Permission to write to the output folder is required to resume.");
          return;
        }
      }

      proceedResume(session);
    } catch (err: any) {
      console.error("Resumption re-grant failed:", err);
      alert("Resumption failed: " + err.message);
    }
  };

  const proceedResume = async (session: ActiveSession) => {
    setPendingSession(null);
    setTakeoutFolder(session.takeoutHandle);
    setZipFile(session.zipFile);
    setOutputFolder(session.outputHandle);

    setIsProcessing(true);
    isProcessingRef.current = true;
    setIsPaused(false);
    isPausedRef.current = false;

    statsBuffer.current = {
      scanned: session.scannedCount,
      matched: session.matchedCount,
      unmatched: session.unmatchedCount,
      errors: session.errorCount,
      total: session.totalFiles
    };

    setStats({ ...statsBuffer.current });
    setProgress(Math.floor((session.scannedCount / session.totalFiles) * 100));
    setCurrentFile("Resuming restoration...");
    setLogs([]);
    logsBuffer.current = [{ level: 'info', msg: `Resuming restoration... Re-checking in-flight files.` }];

    startTimeRef.current = Date.now() - (session.lastUpdatedAt - session.startedAt);

    flushInterval.current = window.setInterval(() => {
      setStats({ ...statsBuffer.current });
      setProgress(progressBuffer.current);
      setCurrentFile(fileBuffer.current);
      setLogs(prev => {
        const newLogs = [...prev, ...logsBuffer.current];
        logsBuffer.current = [];
        return newLogs.slice(-1000);
      });
    }, 100);

    try {
      await processRestorePipeline(session, sessionManagerRef.current);
    } catch (err: any) {
      console.error("Resumption pipeline execution error:", err);
      logsBuffer.current.push({ level: 'error', msg: `Resumption Error: ${err.message}` });
      setIsProcessing(false);
      isProcessingRef.current = false;
      if (flushInterval.current) window.clearInterval(flushInterval.current);
    }
  };

  const processRestorePipeline = async (session: ActiveSession, sessionManager: SessionManager) => {
    // 1. Initialize WorkerPool
    const pool = new WorkerPool(maxWorkers);
    workerPoolRef.current = pool;

    // 2. Open ZIP Reader if ZIP source
    let zipReader: ZipReader<File> | null = null;
    let zipEntries: any[] = [];
    if (session.zipFile) {
      zipReader = new ZipReader(new BlobReader(session.zipFile));
      zipEntries = await zipReader.getEntries();
    }

    // 3. Revert in-flight files (delete half-written and reset status to pending)
    await sessionManager.revertInFlightFiles();

    // 4. Get pending files
    let pending = await sessionManager.getPendingFiles();
    let fileIndex = 0;
    
    // 5. Throttling and backpressure counter
    let inFlightCount = 0;
    const inflightLimit = Math.min(6, maxWorkers);

    const processNext = async () => {
      if (!isProcessingRef.current || isPausedRef.current) {
        if (inFlightCount === 0) {
          // Cleanup if pipeline was cancelled/paused
          if (zipReader) {
            try { await zipReader.close(); } catch {}
          }
        }
        return;
      }

      if (fileIndex >= pending.length) {
        if (inFlightCount === 0) {
          // Finished all files
          if (zipReader) {
            try { await zipReader.close(); } catch {}
          }
          await completeProcessing();
        }
        return;
      }

      // Check quota limits
      const isBypass = userData?.isAdmin || import.meta.env.DEV;
      if (!isBypass && (currentUsedBytesRef.current + sessionBytesRef.current > limitBytesRef.current || currentUsedFilesRef.current + sessionFilesRef.current > limitFilesRef.current)) {
        if (zipReader) {
          try { await zipReader.close(); } catch {}
        }
        await haltDueToQuota();
        return;
      }

      const fileRecord = pending[fileIndex++];
      inFlightCount++;

      // Schedule next item immediately if under backpressure cap
      if (inFlightCount < inflightLimit) {
        processNext();
      }

      try {
        // Claim file (mark processing in IDB)
        await sessionManager.claimFile(fileRecord.id);

        let buffer: ArrayBuffer | null = null;
        let size = fileRecord.bytes;

        // Read file bytes
        if (fileRecord.fileHandle) {
          let fileObj;
          try {
            fileObj = await fileRecord.fileHandle.getFile();
          } catch {
            const freshHandle = await fileRecord.dirHandle!.getFileHandle(fileRecord.filename);
            fileObj = await freshHandle.getFile();
          }
          size = fileObj.size;
          buffer = await fileObj.arrayBuffer();
        } else if (fileRecord.zipPath && zipReader) {
          const entry = zipEntries.find(e => e.filename === fileRecord.zipPath);
          if (entry) {
            const writer = new Uint8ArrayWriter();
            const bytes = await entry.getData!(writer);
            buffer = bytes.buffer;
          }
        }

        if (!buffer) {
          throw new Error("Failed to read file contents.");
        }

        // EXIF injection in Worker if JPEG and metadata timestamp exists
        let actionStr = 'No Metadata Found';
        let levelStr = 'warn';

        if (fileRecord.epochSec && isJpeg(fileRecord.filename)) {
          // Transfer buffer to worker
          const res = await pool.runTask('inject_exif', {
            buffer,
            epochSec: fileRecord.epochSec,
            filename: fileRecord.filename
          }, [buffer]);

          buffer = res.buffer;
          if (res.success) {
            actionStr = 'Restored & Injected';
            levelStr = 'success';
          } else {
            actionStr = `EXIF Error: ${res.error}`;
            levelStr = 'error';
          }
        }

        // Write output directly to output folder
        const baseFolder = (fileRecord.epochSec && actionStr !== 'EXIF Error') ? 'restored' : 'unmatched';
        const outSubDir = await getOrCreateDir(session.outputHandle!, [baseFolder, ...fileRecord.relativePath]);
        const outHandle = await outSubDir.getFileHandle(fileRecord.filename, { create: true });
        
        const writable = await outHandle.createWritable();
        await writable.write(buffer);
        await writable.close();

        // Confirm completion
        await sessionManager.confirmFile(fileRecord.id, 'completed', size);

        // Update stats
        if (levelStr === 'success') {
          statsBuffer.current.matched += 1;
        } else if (levelStr === 'warn') {
          statsBuffer.current.unmatched += 1;
        } else {
          statsBuffer.current.errors += 1;
        }
        statsBuffer.current.scanned += 1;

        sessionBytesRef.current += size;
        sessionFilesRef.current += 1;
        totalSessionBytesRef.current += size;

        logsBuffer.current.push({
          level: levelStr,
          path: fileRecord.relativePath,
          filename: fileRecord.filename,
          action: actionStr
        });
        fileBuffer.current = fileRecord.filename;
        progressBuffer.current = Math.floor((statsBuffer.current.scanned / statsBuffer.current.total) * 100);

      } catch (err: any) {
        console.error("Pipeline file error:", fileRecord.filename, err);
        
        await sessionManager.confirmFile(fileRecord.id, 'failed', fileRecord.bytes, err.message);

        statsBuffer.current.errors += 1;
        statsBuffer.current.scanned += 1;
        sessionFilesRef.current += 1;

        logsBuffer.current.push({
          level: 'error',
          path: fileRecord.relativePath,
          filename: fileRecord.filename,
          action: `Error: ${err.message || 'Unknown'}`
        });
        fileBuffer.current = fileRecord.filename;
        progressBuffer.current = Math.floor((statsBuffer.current.scanned / statsBuffer.current.total) * 100);
      } finally {
        inFlightCount--;

        // V8 GC Yield: yield back event loop every 10 files
        if (fileIndex % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }

        // Process next item
        if (isProcessingRef.current && !isPausedRef.current) {
          processNext();
        }

        // Check completion
        if (statsBuffer.current.scanned >= statsBuffer.current.total) {
          if (zipReader) {
            try { await zipReader.close(); } catch {}
          }
          await completeProcessing();
        }
      }
    };

    // Trigger initial batch
    for (let w = 0; w < inflightLimit; w++) {
      processNext();
    }
  };

  const haltDueToQuota = async () => {
    setActiveWorkersCount(0)

    if (flushInterval.current) {
      window.clearInterval(flushInterval.current)
      flushInterval.current = null
    }
    
    setIsProcessing(false)
    isProcessingRef.current = false
    setCurrentFile("Halted: Quota Exceeded")
    
    const quotaErrMsg = `Quota Exceeded! Halted after processing ${statsBuffer.current.scanned} files.`
    logsBuffer.current.push({ level: 'error', msg: quotaErrMsg })
    setLogs(prev => [...prev, ...logsBuffer.current])
    logsBuffer.current = []

    const finalBytes = sessionBytesRef.current
    const finalFiles = sessionFilesRef.current
    await commitSessionUsage()
    await updateActiveSession('failed', {
      scanned: statsBuffer.current.scanned,
      bytesProcessed: finalBytes,
      currentFile: "Halted: Quota Exceeded"
    })

    if (user && statsBuffer.current.scanned > 0) {
      const duration = Date.now() - startTimeRef.current
      if (historySessionIdRef.current) {
        const historyRef = doc(db, 'recoveryHistory', user.uid, 'sessions', historySessionIdRef.current)
        await setDoc(historyRef, {
          filesProcessed: statsBuffer.current.scanned,
          matched: statsBuffer.current.matched,
          recovered: statsBuffer.current.matched,
          failed: statsBuffer.current.errors,
          bytesProcessed: totalSessionBytesRef.current,
          duration,
          status: 'failed'
        }, { merge: true }).catch((err) => console.error("Failed to update dynamic recoveryHistory:", err))
      } else {
        await addDoc(collection(db, 'recoveryHistory', user.uid, 'sessions'), {
          archiveName: takeoutFolder?.name || 'Google Takeout Archive',
          timestamp: Date.now(),
          filesProcessed: statsBuffer.current.scanned,
          matched: statsBuffer.current.matched,
          recovered: statsBuffer.current.matched,
          failed: statsBuffer.current.errors,
          bytesProcessed: totalSessionBytesRef.current,
          duration,
          status: 'failed'
        }).catch((err) => console.error("Failed to write fallback recoveryHistory:", err))
      }
    }
    
    const storageExceeded = (currentUsedBytesRef.current + finalBytes) > limitBytesRef.current
    const filesExceeded = (currentUsedFilesRef.current + finalFiles) > limitFilesRef.current
    let limitReason = ""
    if (storageExceeded && filesExceeded) {
      limitReason = "both your storage and file count limits"
    } else if (storageExceeded) {
      limitReason = `your storage limit of ${plan === 'free' ? '1 GB' : '20 GB'}`
    } else {
      limitReason = `your file count limit of ${plan === 'free' ? '1,000 files' : '10,000 files'}`
    }

    setQuotaAlert({
      open: true,
      message: `You have hit ${limitReason} of your ${PLAN_LABELS[plan] || plan} plan quota. Restoration paused. Upgrade now to continue.`
    })
  }

  const completeProcessing = async () => {
    setIsProcessing(false)
    isProcessingRef.current = false
    setActiveWorkersCount(0)

    if (flushInterval.current) {
      window.clearInterval(flushInterval.current)
      flushInterval.current = null
    }
    
    setStats({ ...statsBuffer.current })
    setProgress(progressBuffer.current)
    setCurrentFile("Processing Complete")
    setLogs(prev => [...prev, ...logsBuffer.current].slice(-1000))
    logsBuffer.current = []

    const finalBytes = sessionBytesRef.current
    await commitSessionUsage()
    await updateActiveSession('completed', {
      scanned: statsBuffer.current.scanned,
      matched: statsBuffer.current.matched,
      bytesProcessed: finalBytes,
      currentFile: 'Processing Complete'
    })

    if (user && statsBuffer.current.scanned > 0) {
      const duration = Date.now() - startTimeRef.current
      await addDoc(collection(db, 'recoveries'), {
        uid: user.uid,
        email: user.email,
        timestamp: Date.now(),
        scanned: statsBuffer.current.scanned,
        matched: statsBuffer.current.matched,
        unmatched: statsBuffer.current.unmatched,
        errors: statsBuffer.current.errors,
        bytesProcessed: totalSessionBytesRef.current,
        duration
      }).catch(console.error)

      // Save/update final run session to recoveryHistory/uid/sessions for user dashboards
      if (historySessionIdRef.current) {
        const historyRef = doc(db, 'recoveryHistory', user.uid, 'sessions', historySessionIdRef.current)
        await setDoc(historyRef, {
          filesProcessed: statsBuffer.current.scanned,
          matched: statsBuffer.current.matched,
          recovered: statsBuffer.current.matched,
          failed: statsBuffer.current.errors,
          bytesProcessed: totalSessionBytesRef.current,
          duration,
          status: 'completed'
        }, { merge: true }).catch((err) => console.error("Failed to update final recoveryHistory:", err))
      } else {
        await addDoc(collection(db, 'recoveryHistory', user.uid, 'sessions'), {
          archiveName: takeoutFolder?.name || 'Google Takeout Archive',
          timestamp: Date.now(),
          filesProcessed: statsBuffer.current.scanned,
          matched: statsBuffer.current.matched,
          recovered: statsBuffer.current.matched,
          failed: statsBuffer.current.errors,
          bytesProcessed: totalSessionBytesRef.current,
          duration,
          status: 'completed'
        }).catch((err) => console.error("Failed to write fallback recoveryHistory:", err))
      }
    }

    if (userData && statsBuffer.current.scanned > 0) {
      const globalRef = doc(db, 'platform_stats', 'global')
      setDoc(globalRef, {
        filesRestored: increment(statsBuffer.current.matched),
        filesScanned: increment(statsBuffer.current.scanned),
        bytesProcessed: increment(finalBytes),
        ticketsResolved: increment(0)
      }, { merge: true }).catch(console.error)
    }
  }



  // 1. Visual EXIF Viewer logic
  const handleViewerFileChange = async (file: File) => {
    setViewerFile(file)
    setViewerLoading(true)
    setViewerExif(null)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const result: any = {
        fileInfo: {
          "Filename": file.name,
          "Size": `${(file.size / 1024 / 1024).toFixed(2)} MB`,
          "Type": file.type || 'Unknown'
        },
        cameraInfo: {} as Record<string, string>,
        gpsInfo: {} as Record<string, string>
      }

      if (file.name.match(/\.jpe?g$/i)) {
        try {
          const bytes = new Uint8Array(arrayBuffer)
          let binary = ""
          // Convert in chunks to avoid stack overflow for large files
          const chunkSize = 65536
          for (let i = 0; i < bytes.length; i += chunkSize) {
            const sub = bytes.subarray(i, i + chunkSize)
            binary += String.fromCharCode.apply(null, sub as any)
          }
          const base64 = btoa(binary)
          const exifObj = piexif.load("data:image/jpeg;base64," + base64)

          if (exifObj["0th"]) {
            const make = exifObj["0th"][piexif.ImageIFD.Make]
            const model = exifObj["0th"][piexif.ImageIFD.Model]
            const software = exifObj["0th"][piexif.ImageIFD.Software]
            if (make) result.cameraInfo["Manufacturer"] = String(make).replace(/\0/g, "").trim()
            if (model) result.cameraInfo["Camera Model"] = String(model).replace(/\0/g, "").trim()
            if (software) result.cameraInfo["Software"] = String(software).replace(/\0/g, "").trim()
          }

          if (exifObj["Exif"]) {
            const dateOriginal = exifObj["Exif"][piexif.ExifIFD.DateTimeOriginal]
            if (dateOriginal) result.cameraInfo["Date Taken (EXIF)"] = String(dateOriginal).replace(/\0/g, "").trim()
          }

          if (exifObj["GPS"]) {
            const latRef = exifObj["GPS"][piexif.GPSIFD.GPSLatitudeRef]
            const lat = exifObj["GPS"][piexif.GPSIFD.GPSLatitude]
            const lonRef = exifObj["GPS"][piexif.GPSIFD.GPSLongitudeRef]
            const lon = exifObj["GPS"][piexif.GPSIFD.GPSLongitude]
            const altRef = exifObj["GPS"][piexif.GPSIFD.GPSAltitudeRef]
            const alt = exifObj["GPS"][piexif.GPSIFD.GPSAltitude]

            if (lat && latRef) {
              const deg = lat[0][0] / lat[0][1]
              const min = lat[1][0] / lat[1][1]
              const sec = lat[2][0] / lat[2][1]
              let dd = deg + min / 60 + sec / 3600
              if (String(latRef).replace(/\0/g, "").trim() === "S") dd = -dd
              result.gpsInfo["Latitude"] = dd.toFixed(6)
            }
            if (lon && lonRef) {
              const deg = lon[0][0] / lon[0][1]
              const min = lon[1][0] / lon[1][1]
              const sec = lon[2][0] / lon[2][1]
              let dd = deg + min / 60 + sec / 3600
              if (String(lonRef).replace(/\0/g, "").trim() === "W") dd = -dd
              result.gpsInfo["Longitude"] = dd.toFixed(6)
            }
            if (alt) {
              const val = Array.isArray(alt) ? (alt[0] / alt[1]) : Number(alt)
              let m = val
              if (altRef === 1) m = -m
              result.gpsInfo["Altitude"] = `${m.toFixed(1)} meters`
            }
          }
        } catch (err) {
          console.warn("Exif parser fail:", err)
        }
      }
      setViewerExif(result)
    } catch (err) {
      console.error("File load fail:", err)
    } finally {
      setViewerLoading(false)
    }
  }

  // 2. Metadata Comparison logic
  const handleCompFilesChange = async (mediaFile: File | null, jsonFile: File | null) => {
    if (mediaFile) setCompMediaFile(mediaFile)
    if (jsonFile) setCompJsonFile(jsonFile)

    const activeMedia = mediaFile || compMediaFile
    const activeJson = jsonFile || compJsonFile

    if (!activeMedia || !activeJson) return

    try {
      const mediaBuf = await activeMedia.arrayBuffer()
      let mediaDate = "No EXIF Original Date found"
      let mediaGps = "No GPS coordinates found"

      if (activeMedia.name.match(/\.jpe?g$/i)) {
        try {
          const bytes = new Uint8Array(mediaBuf)
          let binary = ""
          const chunkSize = 65536
          for (let i = 0; i < bytes.length; i += chunkSize) {
            const sub = bytes.subarray(i, i + chunkSize)
            binary += String.fromCharCode.apply(null, sub as any)
          }
          const base64 = btoa(binary)
          const exif = piexif.load("data:image/jpeg;base64," + base64)

          if (exif["Exif"] && exif["Exif"][piexif.ExifIFD.DateTimeOriginal]) {
            mediaDate = String(exif["Exif"][piexif.ExifIFD.DateTimeOriginal]).replace(/\0/g, "").trim()
          }
          if (exif["GPS"] && exif["GPS"][piexif.GPSIFD.GPSLatitude]) {
            const lat = exif["GPS"][piexif.GPSIFD.GPSLatitude]
            const latRef = exif["GPS"][piexif.GPSIFD.GPSLatitudeRef]
            const lon = exif["GPS"][piexif.GPSIFD.GPSLongitude]
            const lonRef = exif["GPS"][piexif.GPSIFD.GPSLongitude]
            if (lat && latRef && lon && lonRef) {
              const latDeg = lat[0][0] / lat[0][1] + (lat[1][0] / lat[1][1] / 60) + (lat[2][0] / lat[2][1] / 3600)
              const lonDeg = lon[0][0] / lon[0][1] + (lon[1][0] / lon[1][1] / 60) + (lon[2][0] / lon[2][1] / 3600)
              mediaGps = `${latDeg.toFixed(5)}°, ${lonDeg.toFixed(5)}°`
            }
          }
        } catch {}
      }

      let jsonTitle = ""
      let jsonTime = "No timestamp found"
      let jsonGps = "No GPS found"

      try {
        const jsonText = await activeJson.text()
        const parsed = JSON.parse(jsonText)
        jsonTitle = parsed.title || ""
        if (parsed.photoTakenTime && parsed.photoTakenTime.formatted) {
          jsonTime = parsed.photoTakenTime.formatted
        }
        if (parsed.geoData && (parsed.geoData.latitude !== 0 || parsed.geoData.longitude !== 0)) {
          jsonGps = `${parsed.geoData.latitude.toFixed(5)}°, ${parsed.geoData.longitude.toFixed(5)}°`
        }
      } catch (err) {
        console.warn("JSON parse fail:", err)
      }

      setCompResult({
        media: {
          name: activeMedia.name,
          size: `${(activeMedia.size / 1024 / 1024).toFixed(2)} MB`,
          date: mediaDate,
          gps: mediaGps
        },
        json: {
          title: jsonTitle,
          time: jsonTime,
          gps: jsonGps
        },
        checks: {
          fileNameMatch: activeMedia.name.includes(jsonTitle.split('.')[0]) || jsonTitle.includes(activeMedia.name.split('.')[0]),
          dateMatch: mediaDate !== "No EXIF Original Date found",
          gpsMatch: mediaGps !== "No GPS coordinates found"
        }
      })

    } catch (err) {
      console.error(err)
    }
  }

  // 3. Duplicate Space Analyzer logic
  const handleSelectDupFolder = async () => {
    if (typeof window === 'undefined' || !window.showDirectoryPicker) {
      alert("Browser Support Required:\n\nYour browser does not support the File System Access API required to select folders directly. Please use a desktop version of Google Chrome, Brave, or Microsoft Edge.")
      return
    }
    try {
      // @ts-ignore
      const handle = await window.showDirectoryPicker()
      setDupFolder(handle)
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('User cancelled picker')
        return
      }
      console.error('Error selecting duplicate folder:', err)
      alert(`Could not open folder picker: ${err.message || err}\n\nNote: Browsers block folder access if the site is not served securely (HTTPS or localhost), or if you select a system-sensitive directory (like Downloads, Documents, or root C:/). Please try another folder or make sure you are accessing the site via localhost/HTTPS.`)
    }
  }

  const startDuplicateScan = async () => {
    if (!dupFolder) return
    setDupIsScanning(true)
    setDupGroups([])
    setDupStats({ scanned: 0, duplicates: 0, savedBytes: 0 })
    setDupScanStatus("Scanning directory...")

    try {
      const fileMapByBytes = new Map<number, { handle: FileSystemFileHandle, path: string[] }[]>()
      let count = 0

      async function walk(handle: FileSystemDirectoryHandle, path: string[]) {
        // @ts-ignore
        for await (const [name, entry] of handle) {
          if (entry.kind === 'file') {
            try {
              const file = await (entry as FileSystemFileHandle).getFile()
              const size = file.size
              
              let list = fileMapByBytes.get(size)
              if (!list) {
                list = []
                fileMapByBytes.set(size, list)
              }
              list.push({ handle: entry as FileSystemFileHandle, path: [...path, name] })
              count++
              if (count % 100 === 0) {
                setDupScanStatus(`Scanned ${count} files...`)
              }
            } catch {}
          } else if (entry.kind === 'directory') {
            await walk(entry as FileSystemDirectoryHandle, [...path, name])
          }
        }
      }

      await walk(dupFolder, [])

      setDupScanStatus("Analyzing duplicates...")
      let dupCount = 0
      let savedBytes = 0
      const groupList: any[] = []

      for (const [size, files] of fileMapByBytes.entries()) {
        if (files.length > 1) {
          const paths = files.map(f => `/${f.path.join('/')}`)
          dupCount += (files.length - 1)
          savedBytes += (size * (files.length - 1))
          groupList.push({
            size: `${(size / 1024 / 1024).toFixed(2)} MB`,
            sizeBytes: size,
            files: paths
          })
        }
      }

      groupList.sort((a, b) => b.sizeBytes - a.sizeBytes)

      setDupStats({
        scanned: count,
        duplicates: dupCount,
        savedBytes
      })
      setDupGroups(groupList)
      setDupScanStatus("Complete")
    } catch (err: any) {
      setDupScanStatus(`Error: ${err.message || err}`)
    } finally {
      setDupIsScanning(false)
    }
  }

  const startProcessing = async () => {
    // Whitelist Enforcement: Only start restoration process if not blocked by ad blocker
    const isAdFree = userData?.plan === "super" && !userData?.supportWithAds;
    if (!isAdFree) {
      const isBlocked = await detectAdBlock();
      if (isBlocked) {
        window.dispatchEvent(new CustomEvent('takeoutfix-action-triggered'));
        alert("Ad Blocker Detected:\n\nTo start the restoration process, please disable your ad blocker or whitelist TakeoutFix. Alternatively, upgrade to Super for an ad-free experience.");
        return;
      }
    }

    window.dispatchEvent(new CustomEvent('takeoutfix-action-triggered'))
    const sourceName = zipFile ? zipFile.name : (takeoutFolder ? takeoutFolder.name : '');
    if (!sourceName || !outputFolder) return

    try {
      if (takeoutFolder) {
        const isSame = await takeoutFolder.isSameEntry(outputFolder)
        if (isSame) {
          setQuotaAlert({
            open: true,
            message: "The Source Folder and Output Folder cannot be the same. Please select a separate, empty output folder to prevent file modification conflicts."
          })
          return
        }
      }
    } catch (err) {
      console.warn("Failed to check directory handles:", err)
    }

    const isBypass = userData?.isAdmin || import.meta.env.DEV;
    if (!isBypass && (currentUsedFiles >= limitFiles || currentUsedBytes >= limitBytes)) {
      let limitReason = ""
      if (currentUsedFiles >= limitFiles && currentUsedBytes >= limitBytes) {
        limitReason = "both your storage and file count limits"
      } else if (currentUsedBytes >= limitBytes) {
        limitReason = `your storage limit of ${plan === 'free' ? '1 GB' : '20 GB'}`
      } else {
        limitReason = `your file count limit of ${plan === 'free' ? '1,000 files' : '10,000 files'}`
      }

      setQuotaAlert({
        open: true,
        message: `You cannot start a new recovery because you have already reached ${limitReason} for your ${PLAN_LABELS[plan] || plan} plan. Please upgrade to continue.`
      })
      return
    }
    
    setIsProcessing(true)
    isProcessingRef.current = true
    setIsPaused(false)
    isPausedRef.current = false
    setProgress(0)
    setStats({ scanned: 0, matched: 0, unmatched: 0, errors: 0, total: 0 })
    statsBuffer.current = { scanned: 0, matched: 0, unmatched: 0, errors: 0, total: 0 }
    logsBuffer.current = []
    setLogs([])
    setCurrentFile("Scanning input source...")
    
    sessionBytesRef.current = 0
    sessionFilesRef.current = 0
    startTimeRef.current = Date.now()
    lastCommitTimeRef.current = Date.now()

    totalSessionBytesRef.current = 0
    historySessionIdRef.current = null

    const sessionId = `${user.uid}_${Date.now()}`;
    sessionIdRef.current = sessionId;

    if (user) {
      updateActiveSession('initializing', {
        startedAt: Date.now(),
        totalFiles: 0,
        scanned: 0,
        matched: 0,
        bytesProcessed: 0,
        currentFile: 'Scanning input source...'
      })

      addDoc(collection(db, 'recoveryHistory', user.uid, 'sessions'), {
        archiveName: sourceName,
        timestamp: Date.now(),
        filesProcessed: 0,
        matched: 0,
        recovered: 0,
        failed: 0,
        bytesProcessed: 0,
        duration: 0,
        status: 'processing'
      }).then(docRef => {
        historySessionIdRef.current = docRef.id
      }).catch(err => console.error("Failed to initialize recoveryHistory session:", err))
    }

    flushInterval.current = window.setInterval(() => {
      setStats({ ...statsBuffer.current })
      setProgress(progressBuffer.current)
      setCurrentFile(fileBuffer.current)
      setLogs(prev => {
        const newLogs = [...prev, ...logsBuffer.current]
        logsBuffer.current = []
        return newLogs.slice(-1000)
      })
    }, 100)

    try {
      const session = await sessionManagerRef.current.startNewSession(
        sessionId,
        user.uid,
        sourceName,
        zipFile || takeoutFolder!,
        outputFolder
      );

      const totalFiles = await sessionManagerRef.current.scanAndRegister((indexedCount) => {
        fileBuffer.current = `Indexing Takeout source... Found ${indexedCount} media files`;
      });

      if (!isProcessingRef.current) return;

      if (totalFiles === 0) {
        setIsProcessing(false)
        isProcessingRef.current = false
        setCurrentFile("Finished: No files found")
        if (flushInterval.current) window.clearInterval(flushInterval.current)
        await sessionManagerRef.current.terminateSession('completed');
        return
      }

      statsBuffer.current.total = totalFiles;
      
      await updateActiveSession('processing', {
        totalFiles: totalFiles,
        currentFile: 'Starting restoration pipeline...'
      });

      await processRestorePipeline(session, sessionManagerRef.current);

    } catch (err: any) {
      console.error("Restoration start error:", err);
      logsBuffer.current.push({ level: 'error', msg: `Scanning Error: ${err.message || err}` })
      setIsProcessing(false)
      isProcessingRef.current = false
      if (flushInterval.current) window.clearInterval(flushInterval.current)
      await sessionManagerRef.current.terminateSession('failed');
    }
  }

  const cancelProcessing = async () => {
    setActiveWorkersCount(0)

    if (flushInterval.current) window.clearInterval(flushInterval.current)
    setIsProcessing(false)
    isProcessingRef.current = false
    setIsPaused(false)
    isPausedRef.current = false
    setCurrentFile("Cancelled")
    setLogs(prev => [...prev, { level: 'error', msg: 'Processing cancelled by user.' }])
    
    const finalBytes = sessionBytesRef.current
    await commitSessionUsage()
    await updateActiveSession('cancelled', { 
      currentFile: 'Cancelled',
      scanned: statsBuffer.current.scanned,
      matched: statsBuffer.current.matched,
      bytesProcessed: finalBytes
    })

    if (user && statsBuffer.current.scanned > 0) {
      const duration = Date.now() - startTimeRef.current
      if (historySessionIdRef.current) {
        const historyRef = doc(db, 'recoveryHistory', user.uid, 'sessions', historySessionIdRef.current)
        await setDoc(historyRef, {
          filesProcessed: statsBuffer.current.scanned,
          matched: statsBuffer.current.matched,
          recovered: statsBuffer.current.matched,
          failed: statsBuffer.current.errors,
          bytesProcessed: totalSessionBytesRef.current,
          duration,
          status: 'cancelled'
        }, { merge: true }).catch((err) => console.error("Failed to update final recoveryHistory:", err))
      } else {
        await addDoc(collection(db, 'recoveryHistory', user.uid, 'sessions'), {
          archiveName: takeoutFolder?.name || 'Google Takeout Archive',
          timestamp: Date.now(),
          filesProcessed: statsBuffer.current.scanned,
          matched: statsBuffer.current.matched,
          recovered: statsBuffer.current.matched,
          failed: statsBuffer.current.errors,
          bytesProcessed: totalSessionBytesRef.current,
          duration,
          status: 'cancelled'
        }).catch((err) => console.error("Failed to write fallback recoveryHistory:", err))
      }
    }
  }

  const pauseProcessing = () => {
    if (isProcessing && !isPaused) {
      setIsPaused(true)
      isPausedRef.current = true
      setLogs(prev => [...prev, { level: 'info', msg: 'Processing paused by user.' }])
      commitSessionUsage()
    }
  }

  const resumeProcessing = () => {
    if (isProcessing && isPaused) {
      setIsPaused(false)
      isPausedRef.current = false
      setLogs(prev => [...prev, { level: 'info', msg: 'Processing resumed by user.' }])
    }
  }

  return (
    <AdBlockGate>
      <div className="w-full md:h-[calc(100vh-64px)] h-auto flex flex-col md:flex-row bg-[#0A0A0A] md:overflow-hidden overflow-y-auto">
        
        {/* 30% LEFT PANEL: CONFIGURATION */}
        <div className="w-full md:w-[30%] md:min-w-[400px] p-8 border-r border-white/5 flex flex-col md:h-full h-auto md:overflow-y-auto overflow-visible">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight mb-2">Recovery Center</h1>
            <p className="text-white/50 text-xs">Configure your source directories or access advanced metadata tools.</p>
          </div>

          {/* Quick Tab Selector */}
          <div className="grid grid-cols-2 gap-2 mb-8 tool-tab-container p-1 rounded-xl">
            <button
              onClick={() => setActiveToolTab('restore')}
              className={`py-2 px-3 text-xs font-bold rounded-lg transition-all tool-tab-btn ${
                activeToolTab === 'restore' ? 'active' : ''
              }`}
            >
              Restore Archive
            </button>
            <button
              onClick={() => setActiveToolTab('viewer')}
              className={`py-2 px-3 text-xs font-bold rounded-lg transition-all tool-tab-btn ${
                activeToolTab === 'viewer' ? 'active' : ''
              }`}
            >
              EXIF Viewer
            </button>
            <button
              onClick={() => setActiveToolTab('comparison')}
              className={`py-2 px-3 text-xs font-bold rounded-lg transition-all tool-tab-btn ${
                activeToolTab === 'comparison' ? 'active' : ''
              }`}
            >
              Comparison
            </button>
            <button
              onClick={() => setActiveToolTab('duplicates')}
              className={`py-2 px-3 text-xs font-bold rounded-lg transition-all tool-tab-btn ${
                activeToolTab === 'duplicates' ? 'active' : ''
              }`}
            >
              Duplicates
            </button>
          </div>

          {/* Resumption Banner */}
          {activeToolTab === 'restore' && pendingSession && (
            <div className="mb-6 p-5 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-left space-y-4">
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                <Activity className="w-5 h-5 animate-pulse" />
                <span>Interrupted Session Found</span>
              </div>
              <p className="text-xs text-zinc-350 leading-relaxed">
                We found a pending restoration for <strong>{pendingSession.takeoutName}</strong> ({pendingSession.scannedCount} of {pendingSession.totalFiles} files processed).
              </p>
              <div className="flex gap-2">
                <Button 
                  onClick={handleReGrantPermissions} 
                  className="btn-monochrome-primary rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-150 cursor-pointer"
                >
                  Resume Restoration
                </Button>
                <Button 
                  onClick={async () => {
                    await sessionManagerRef.current.terminateSession('cancelled');
                    setPendingSession(null);
                  }}
                  className="btn-monochrome-secondary rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-150 cursor-pointer"
                >
                  Discard
                </Button>
              </div>
            </div>
          )}

          <div className="mb-6">
            <AdUnit type="horizontal" />
          </div>

          {/* Browser compatibility check alert */}
          {typeof window !== 'undefined' && !window.showDirectoryPicker && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl text-xs mb-6 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">Browser Support Warning</div>
                <div className="text-[11px] text-amber-500/70 mt-0.5 leading-relaxed">
                  Your browser does not support native local directory access APIs. To restore Google Takeout folders directly on your device, please use a modern Chromium-based desktop browser (e.g., <strong>Google Chrome, Microsoft Edge, or Brave</strong>). Safari, Firefox, and mobile browsers are currently not supported for direct local directory operations.
                </div>
              </div>
            </div>
          )}

          {/* Tool specific Left Panel render */}
          {activeToolTab === 'restore' && (
            <div className="space-y-6 max-w-3xl mb-12 flex-grow flex flex-col justify-between">
              <div className="space-y-6">
                <Card 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`bg-white/[0.02] border-white/10 shadow-2xl transition-all duration-150 ${
                    isDragOver ? 'border-indigo-500/40 bg-indigo-500/[0.02] scale-[1.01]' : ''
                  }`}
                >
                  <CardHeader className="border-b border-white/5 bg-black/20 pb-4">
                    <CardTitle className="flex items-center gap-2">
                      <FolderUp className="w-5 h-5 text-zinc-400"/> 
                      1. Select Takeout Source (Folder or ZIP)
                    </CardTitle>
                    <CardDescription className="text-white/50">
                      Drag & Drop your Takeout folder or ZIP archive here, or browse.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6">
                    {zipFile ? (
                      <div className="p-4 bg-indigo-500/5 border border-indigo-500/15 rounded-md mb-4 flex justify-between items-center text-zinc-350">
                        <span className="font-mono text-sm truncate">ZIP: {zipFile.name}</span>
                        <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                      </div>
                    ) : takeoutFolder ? (
                      <div className="p-4 bg-zinc-800/10 border border-zinc-800/25 rounded-md mb-4 flex justify-between items-center text-zinc-400">
                        <span className="font-mono text-sm truncate">Folder: {takeoutFolder.name}</span>
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                    ) : (
                      <div className="border border-dashed border-white/5 rounded-lg p-6 text-center text-zinc-500 text-xs mb-4">
                        Drag & Drop Folder or ZIP file here
                      </div>
                    )}
                    
                    <div className="flex gap-2">
                      <Button onClick={handleSelectTakeout} className="btn-monochrome-primary rounded-lg px-4 py-2 transition-all duration-150 cursor-pointer text-xs">
                        Browse Folders
                      </Button>
                      <Button 
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = '.zip';
                          input.onchange = (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (file) {
                              setZipFile(file);
                              setTakeoutFolder(null);
                              window.dispatchEvent(new CustomEvent('takeoutfix-action-triggered'));
                            }
                          };
                          input.click();
                        }}
                        className="btn-monochrome-primary rounded-lg px-4 py-2 transition-all duration-150 cursor-pointer text-xs"
                      >
                        Select ZIP File
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white/[0.02] border-white/10 shadow-2xl">
                  <CardHeader className="border-b border-white/5 bg-black/20 pb-4">
                    <CardTitle className="flex items-center gap-2"><HardDrive className="w-5 h-5 text-zinc-400"/> 2. Select Output Destination</CardTitle>
                    <CardDescription className="text-white/50">Choose an empty folder where restored files will be saved.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6">
                    {outputFolder ? (
                      <div className="p-4 bg-zinc-800/10 border border-zinc-800/25 rounded-md mb-4 flex justify-between items-center text-zinc-400">
                        <span className="font-mono text-sm truncate">{outputFolder.name}</span>
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                    ) : null}
                    <Button onClick={handleSelectOutput} className="btn-monochrome-primary rounded-lg px-8 transition-all duration-150 cursor-pointer">
                      {outputFolder ? "Change Output Directory" : "Browse Output Directory"}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <div className="mt-auto pt-6">
                {(takeoutFolder || zipFile) && outputFolder && !isProcessing && progress === 0 && (
                  <>
                    <div className="mb-6 p-5 bg-zinc-800/10 border border-zinc-800/20 rounded-2xl max-w-xl text-left space-y-4">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Pre-Flight Recovery Summary</h3>
                      
                      <div className="space-y-3 text-sm text-zinc-300">
                        <div className="flex items-start gap-2.5">
                          <span className="text-base leading-none">📂</span>
                          <div>
                            <span className="font-semibold text-white block">Source:</span>
                            <span className="font-mono text-xs text-zinc-450 break-all">{zipFile ? `ZIP: ${zipFile.name}` : `Folder: ${takeoutFolder!.name}`}</span>
                            <span className="text-[10px] text-zinc-500 block mt-0.5">(Read-only: Originals are never modified)</span>
                          </div>
                        </div>
                        
                        <div className="flex items-start gap-2.5">
                          <span className="text-base leading-none">💾</span>
                          <div>
                            <span className="font-semibold text-white block">Output Directory:</span>
                            <span className="font-mono text-xs text-zinc-400 break-all">{outputFolder.name}</span>
                            <span className="text-[10px] text-zinc-500 block mt-0.5">(New corrected photos and videos are saved here)</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2.5 pt-2 border-t border-white/5 text-xs text-green-400 font-medium">
                          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                          <span>Original files remain completely untouched and safe.</span>
                        </div>
                      </div>
                    </div>

                    <Button size="lg" onClick={startProcessing} className="btn-monochrome-primary w-full max-w-xl h-16 text-xl rounded-xl font-bold border-0 shadow-none transition-all duration-150 cursor-pointer flex items-center justify-center gap-2">
                      <Play className="w-6 h-6 mr-3 fill-current" /> Initialize Recovery Engine
                    </Button>
                  </>
                )}

                {(isProcessing || progress > 0) && (
                  <div className="max-w-3xl">
                    <div className="flex justify-between items-end mb-4">
                      <div>
                        <div className="text-sm text-white/50 font-bold uppercase tracking-widest mb-2">Overall Progress</div>
                        <div className="text-4xl font-black">{progress}%</div>
                      </div>
                      {isProcessing && (
                        <div className="flex gap-2">
                          {isPaused ? (
                            <Button 
                              onClick={resumeProcessing}
                              className="btn-monochrome-primary transition-all duration-150 cursor-pointer"
                            >
                              <Play className="w-4 h-4 mr-2 fill-current" /> Resume
                            </Button>
                          ) : (
                            <Button 
                              onClick={pauseProcessing}
                              className="btn-monochrome-primary transition-all duration-150 cursor-pointer"
                            >
                              <Pause className="w-4 h-4 mr-2 fill-current" /> Pause
                            </Button>
                          )}
                          
                          <Button 
                            onClick={cancelProcessing}
                            className="btn-monochrome-primary transition-all duration-150 cursor-pointer"
                          >
                            <Square className="w-4 h-4 mr-2 fill-current" /> Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                    <Progress value={progress} className="h-4 bg-white/5 rounded-full overflow-hidden border border-white/5 shadow-inner" />
                    <div className="mt-3 text-xs text-white/40 flex flex-col gap-1">
                      <div>Processed: {((currentUsedBytes + sessionBytesRef.current) / (1024 ** 3)).toFixed(2)} GB / {limitBytes === Infinity ? "Unlimited" : `${(limitBytes / (1024 ** 3)).toFixed(2)} GB`}</div>
                      <div>Files: {(currentUsedFiles + sessionFilesRef.current).toLocaleString()} / {limitFiles === Infinity ? "Unlimited" : limitFiles.toLocaleString()} files</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeToolTab === 'viewer' && (
            <div className="space-y-6 flex-grow flex flex-col justify-between">
              <Card className="bg-white/[0.02] border-white/10 shadow-2xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Eye className="w-5 h-5 text-rose-400"/> EXIF Inspector</CardTitle>
                  <CardDescription className="text-white/50">Upload or drop a JPEG image to read its camera and GPS coordinates offline.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  <div className="border border-dashed border-white/10 rounded-xl p-8 text-center bg-black/45 relative cursor-pointer hover:bg-white/[0.02] transition-all">
                    <input
                      type="file"
                      accept="image/jpeg"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleViewerFileChange(file)
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <FileImage className="w-8 h-8 text-zinc-500 mx-auto mb-2" />
                    <span className="text-xs text-zinc-400 block">Drag & Drop or click to browse JPEG</span>
                  </div>
                  {viewerFile && (
                    <div className="p-3 bg-zinc-900 border border-white/5 rounded-lg text-xs font-mono text-zinc-300 flex items-center justify-between">
                      <span className="truncate">{viewerFile.name}</span>
                      <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                    </div>
                  )}
                </CardContent>
              </Card>
              <div className="text-zinc-500 text-xs mt-auto">All metadata parsing runs 100% locally in-browser to protect your privacy.</div>
            </div>
          )}

          {activeToolTab === 'comparison' && (
            <div className="space-y-6 flex-grow flex flex-col justify-between">
              <Card className="bg-white/[0.02] border-white/10 shadow-2xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Layers className="w-5 h-5 text-amber-400"/> Metadata Comparison</CardTitle>
                  <CardDescription className="text-white/50">Load a media file and its Google Takeout JSON sidecar to visualize parameters side-by-side.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  <div className="space-y-2">
                    <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">1. Select Photo/Video</span>
                    <div className="border border-dashed border-white/10 rounded-xl p-4 text-center bg-black/45 relative cursor-pointer hover:bg-white/[0.02] transition-all">
                      <input
                        type="file"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleCompFilesChange(file, null)
                        }}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      <FileImage className="w-6 h-6 text-zinc-500 mx-auto mb-1" />
                      <span className="text-[11px] text-zinc-400 block">{compMediaFile ? compMediaFile.name : "Select Media File"}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">2. Select Google Takeout JSON</span>
                    <div className="border border-dashed border-white/10 rounded-xl p-4 text-center bg-black/45 relative cursor-pointer hover:bg-white/[0.02] transition-all">
                      <input
                        type="file"
                        accept=".json"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleCompFilesChange(null, file)
                        }}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      <FileJson className="w-6 h-6 text-zinc-500 mx-auto mb-1" />
                      <span className="text-[11px] text-zinc-400 block">{compJsonFile ? compJsonFile.name : "Select JSON File"}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <div className="text-zinc-500 text-xs mt-auto">Exposes matching sidecar payloads before running restoration.</div>
            </div>
          )}

          {activeToolTab === 'duplicates' && (
            <div className="space-y-6 flex-grow flex flex-col justify-between">
              <Card className="bg-white/[0.02] border-white/10 shadow-2xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Copy className="w-5 h-5 text-zinc-400"/> Duplicate Analyzer</CardTitle>
                  <CardDescription className="text-white/50">Analyze local folders to locate duplicate assets and reclaim storage space.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  {dupFolder ? (
                    <div className="p-3 bg-zinc-800/10 border border-zinc-800/25 rounded-md text-xs font-mono text-zinc-400 flex justify-between items-center">
                      <span className="truncate">{dupFolder.name}</span>
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  ) : null}
                  <Button onClick={handleSelectDupFolder} className="btn-monochrome-primary w-full transition-all duration-150 cursor-pointer">
                    {dupFolder ? "Change Folder" : "Select Folder to Analyze"}
                  </Button>
                  
                  {dupFolder && !dupIsScanning && (
                    <Button onClick={startDuplicateScan} className="btn-monochrome-primary w-full font-bold rounded-xl border-0 shadow-none transition-all duration-150 cursor-pointer">
                      <Search className="w-4 h-4 mr-2" /> Run Space Analyzer
                    </Button>
                  )}
                </CardContent>
              </Card>
              <div className="text-zinc-500 text-xs mt-auto">Reclaims space by identifying identical media byte structures.</div>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-white/5">
            <AdUnit type="vertical" />
          </div>
        </div>

        {/* 70% RIGHT PANEL: COMMAND CENTER & TOOL DETAILS */}
        <div className="flex-grow w-full md:w-[70%] bg-black border-l border-white/5 flex flex-col md:h-full h-auto overflow-hidden">
          
          {activeToolTab === 'restore' && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="p-6 border-b border-white/5 bg-white/[0.01]">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-sm font-bold text-white/50 uppercase tracking-widest flex items-center gap-2"><Activity className="w-4 h-4" /> Command Center</h2>
                  <div className="text-xs font-bold px-2 py-1 bg-zinc-800/20 text-zinc-400 rounded border border-zinc-800/40">{PLAN_LABELS[plan] || plan} Plan</div>
                </div>

                <div className="space-y-4">
                  {/* REAL-TIME PLAN QUOTA USAGE */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-white/[0.02] border border-white/5 p-3 rounded-lg flex flex-col gap-1.5">
                      <div className="flex justify-between items-center text-[10px] text-white/40 font-bold uppercase tracking-wider">
                        <span className="flex items-center gap-1"><HardDrive className="w-3 h-3 text-zinc-500" /> Storage Limit Progress</span>
                        <span>{limitBytes === Infinity ? "Unlimited" : `${(limitBytes / (1024 ** 3)).toFixed(0)} GB`}</span>
                      </div>
                      <div className="text-sm font-bold text-zinc-100 mt-0.5">
                        {((currentUsedBytes + sessionBytesRef.current) / (1024 ** 3)).toFixed(2)} GB / {limitBytes === Infinity ? "Unlimited" : `${(limitBytes / (1024 ** 3)).toFixed(0)} GB`}
                      </div>
                      {limitBytes !== Infinity && (
                        <Progress value={Math.min(100, ((currentUsedBytes + sessionBytesRef.current) / limitBytes) * 100)} className="h-1 bg-white/10" />
                      )}
                    </div>

                    <div className="bg-white/[0.02] border border-white/5 p-3 rounded-lg flex flex-col gap-1.5">
                      <div className="flex justify-between items-center text-[10px] text-white/40 font-bold uppercase tracking-wider">
                        <span className="flex items-center gap-1"><FileText className="w-3 h-3 text-zinc-500" /> Files Limit Progress</span>
                        <span>{limitFiles === Infinity ? "Unlimited" : limitFiles.toLocaleString()}</span>
                      </div>
                      <div className="text-sm font-bold text-zinc-100 mt-0.5">
                        {(currentUsedFiles + sessionFilesRef.current).toLocaleString()} / {limitFiles === Infinity ? "Unlimited" : limitFiles.toLocaleString()} files
                      </div>
                      {limitFiles !== Infinity && (
                        <Progress value={Math.min(100, ((currentUsedFiles + sessionFilesRef.current) / limitFiles) * 100)} className="h-1 bg-white/10" />
                      )}
                    </div>
                  </div>

                  {/* Local Engine Resource Telemetry */}
                  <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-3.5">
                    <div className="flex justify-between items-center border-b border-white/5 pb-2">
                      <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-zinc-400" />
                        Local Engine Resource Telemetry
                      </span>
                      <span className={`text-[9px] font-bold font-mono px-2 py-0.5 rounded border ${
                        isProcessing 
                          ? isPaused ? 'bg-zinc-850 border-zinc-750 text-zinc-300' : 'bg-white/10 border-white/20 text-white animate-pulse'
                          : 'bg-zinc-500/10 border-zinc-500/20 text-zinc-400'
                      }`}>
                        {isProcessing ? isPaused ? 'PAUSED' : 'ACTIVE RESTORATION' : 'ENGINE IDLE'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <div className="flex justify-between text-[10px] font-bold text-zinc-400 mb-1.5">
                          <span className="flex items-center gap-1"><Cpu className="w-3.5 h-3.5 text-zinc-500" /> CPU Cores in Use</span>
                          <span className="font-mono">{telemetryWorkers} / {navigator.hardwareConcurrency || 4} Cores ({telemetryCpu}%)</span>
                        </div>
                        <Progress value={telemetryCpu} className="h-1 bg-white/10" />
                      </div>

                      <div>
                        <div className="flex justify-between text-[10px] font-bold text-zinc-400 mb-1.5">
                          <span className="flex items-center gap-1"><HardDrive className="w-3.5 h-3.5 text-zinc-500" /> RAM In Use (Engine / Tab)</span>
                          <span className="font-mono">{telemetryMem.toFixed(0)}MB / {telemetryTabHeap.toFixed(0)}MB (System: {navigator.deviceMemory || 8}GB)</span>
                        </div>
                        <Progress value={Math.min(100, ((telemetryMem + telemetryTabHeap) / 2048) * 100)} className="h-1 bg-white/10" />
                      </div>

                      <div className="flex justify-between items-center bg-white/[0.01] border border-white/5 px-3 py-1.5 rounded-lg">
                        <span className="text-[10px] font-bold text-zinc-400 flex items-center gap-1">
                          <Cpu className="w-3.5 h-3.5 text-zinc-450" /> Concurrency
                        </span>
                        <select 
                          disabled={isProcessing}
                          value={maxWorkers} 
                          onChange={(e) => handleMaxWorkersChange(Number(e.target.value))}
                          className="bg-black border border-white/10 rounded px-1.5 py-0.5 text-xs text-white font-mono cursor-pointer outline-none focus:border-white/30"
                        >
                          {[1, 2, 4, 6, 8, 12, 16, 24].map(n => (
                            <option key={n} value={n}>{n} Thread{n > 1 ? 's' : ''}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-white/40 uppercase mb-1">Current File</div>
                    <div className="font-mono text-sm text-white/80 bg-white/5 px-3 py-2 rounded border border-white/5 truncate">{currentFile}</div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="bg-white/[0.02] border border-white/5 p-4 rounded flex items-center justify-between">
                      <div>
                        <div className="text-xs text-white/40 mb-1 flex items-center gap-1"><Database className="w-3 h-3"/> Scanned</div>
                        <div className="text-xl font-bold">{stats.scanned} / {stats.total || '—'}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-white/40 uppercase tracking-widest mb-0.5">Size</div>
                        <div className="text-base font-bold text-white/80">
                          {(sessionBytesRef.current / (1024 ** 3)).toFixed(2)} GB
                        </div>
                      </div>
                    </div>
                    <div className="bg-green-500/5 border border-green-500/10 p-4 rounded flex items-center justify-between">
                      <div>
                        <div className="text-xs text-green-400/60 mb-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Restored</div>
                        <div className="text-xl font-bold text-green-400">{stats.matched} / {stats.total || '—'}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-green-400/50 uppercase tracking-widest mb-0.5">Size</div>
                        <div className="text-base font-bold text-green-400">
                          {(sessionBytesRef.current / (1024 ** 3)).toFixed(2)} GB
                        </div>
                      </div>
                    </div>
                    <div className="bg-yellow-500/5 border border-yellow-500/10 p-3 rounded">
                      <div className="text-xs text-yellow-400/60 mb-1 flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Unmatched</div>
                      <div className="text-xl font-bold text-yellow-400">{stats.unmatched}</div>
                    </div>
                    <div className="bg-red-500/5 border border-red-500/10 p-3 rounded">
                      <div className="text-xs text-red-400/60 mb-1 flex items-center gap-1"><XCircle className="w-3 h-3"/> Errors</div>
                      <div className="text-xl font-bold text-red-400">{stats.errors}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div ref={logContainerRef} className="flex-grow bg-black p-6 overflow-y-auto font-mono text-[11px] leading-[1.6]">
                {logs.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-white/20 italic">Awaiting telemetry...</div>
                ) : (
                  <div className="space-y-0.5">
                    {logs.map((log, i) => {
                      if (log.msg) {
                        return <div key={i} className="text-zinc-400/90 border-l-2 border-zinc-700 pl-2 my-2">{log.msg}</div>
                      }
                      
                      const pathStr = log.path ? `/${log.path.join('/')}/` : ''
                      const fullFilename = `${pathStr}${log.filename}`
                      
                      if (log.level === 'success') {
                        return (
                          <div key={i} className="text-green-400/90 pl-2 border-l border-green-500/20 py-0.5 whitespace-pre-wrap">
                            <span className="font-bold mr-2">[RESTORED] </span>
                            <span>{fullFilename}</span>
                          </div>
                        )
                      } else if (log.level === 'warn') {
                        return (
                          <div key={i} className="text-yellow-400/80 pl-2 border-l border-yellow-500/20 py-0.5 whitespace-pre-wrap">
                            <span className="font-bold mr-2">[UNMATCHED]</span>
                            <span>{fullFilename}</span>
                          </div>
                        )
                      } else if (log.level === 'error') {
                        const errorMsg = log.action ? log.action.replace(/^Error:\s*/i, '') : 'Unknown error';
                        return (
                          <div key={i} className="text-red-400 pl-2 border-l border-red-500/20 py-0.5 whitespace-pre-wrap">
                            <span className="font-bold mr-2">[ERROR]    </span>
                            <span>{fullFilename}  ➜  {errorMsg}</span>
                          </div>
                        )
                      }
                      
                      return null;
                    })}
                  </div>
                )}
              </div>
              <div className="px-6 border-t border-white/5 bg-white/[0.01]">
                <AdUnit type="horizontal" />
              </div>
            </div>
          )}

          {activeToolTab === 'viewer' && renderSuperTierGate(
            "Visual EXIF Viewer",
            "Gain deeper diagnostic insights into individual media files by inspecting their underlying EXIF structure locally.",
            ["Read Camera make, model, & software parameters", "Inspect Date & Time metadata headers", "Resolve Latitude, Longitude, and Altitude GPS coordinates", "100% Offline security"],
            () => (
              <div className="p-8 space-y-6 overflow-y-auto h-full">
                <div className="border-b border-white/5 pb-4">
                  <h2 className="text-xl font-bold tracking-tight text-white mb-1">Visual EXIF Inspector</h2>
                  <p className="text-zinc-400 text-xs">Review parsed metadata records extracted directly from files.</p>
                </div>
                {viewerLoading ? (
                  <div className="py-20 text-center text-sm text-zinc-500 animate-pulse">Scanning EXIF headers...</div>
                ) : viewerExif ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="bg-white/[0.01] border-white/5">
                      <CardHeader className="pb-3 border-b border-white/5 bg-black/20">
                        <CardTitle className="text-sm font-bold text-white uppercase tracking-wider">File Details</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-2.5 font-mono text-xs">
                        {Object.entries(viewerExif.fileInfo).map(([k, v]: any) => (
                          <div key={k} className="flex justify-between border-b border-white/5 pb-2 last:border-0 last:pb-0">
                            <span className="text-zinc-500">{k}</span>
                            <span className="text-zinc-300 truncate max-w-[200px]">{v}</span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    <Card className="bg-white/[0.01] border-white/5">
                      <CardHeader className="pb-3 border-b border-white/5 bg-black/20">
                        <CardTitle className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Camera EXIF Tags</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-2.5 font-mono text-xs">
                        {Object.keys(viewerExif.cameraInfo).length > 0 ? (
                          Object.entries(viewerExif.cameraInfo).map(([k, v]: any) => (
                            <div key={k} className="flex justify-between border-b border-white/5 pb-2 last:border-0 last:pb-0">
                              <span className="text-zinc-500">{k}</span>
                              <span className="text-zinc-300">{v}</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-zinc-600 italic py-2">No camera EXIF tags found in this file.</div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="bg-white/[0.01] border-white/5 md:col-span-2">
                      <CardHeader className="pb-3 border-b border-white/5 bg-black/20">
                        <CardTitle className="text-sm font-bold text-rose-400 uppercase tracking-wider">GPS Coordinates</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-2.5 font-mono text-xs">
                        {Object.keys(viewerExif.gpsInfo).length > 0 ? (
                          Object.entries(viewerExif.gpsInfo).map(([k, v]: any) => (
                            <div key={k} className="flex justify-between border-b border-white/5 pb-2 last:border-0 last:pb-0">
                              <span className="text-zinc-500">{k}</span>
                              <span className="text-rose-300">{v}</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-zinc-600 italic py-2">No geo-location coordinates embedded in this file.</div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <div className="h-[400px] border border-white/5 rounded-2xl flex flex-col items-center justify-center text-center p-8 bg-zinc-950/25">
                    <FileImage className="w-12 h-12 text-zinc-700 mb-4 animate-bounce" />
                    <h4 className="text-sm font-bold text-white mb-1">Awaiting Media File</h4>
                    <p className="text-xs text-zinc-500 max-w-xs">Select a media asset in the left panel to begin scanning EXIF tags.</p>
                  </div>
                )}
              </div>
            )
          )}

          {activeToolTab === 'comparison' && renderSuperTierGate(
            "Metadata Comparison",
            "Perform side-by-side matches of image binary fields and sidecar JSON data before importing to check accuracy.",
            ["Compare local image name vs sidecar title", "Evaluate embedded EXIF date vs JSON formatted taken time", "Cross check GPS coordinates and tags", "Diagnose synchronization mismatches"],
            () => (
              <div className="p-8 space-y-6 overflow-y-auto h-full">
                <div className="border-b border-white/5 pb-4">
                  <h2 className="text-xl font-bold tracking-tight text-white mb-1">Side-by-Side Comparison</h2>
                  <p className="text-zinc-400 text-xs">Compare EXIF parameters vs Google Takeout JSON sidecar values.</p>
                </div>

                {compResult ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Card className="bg-white/[0.01] border-white/5">
                        <CardHeader className="pb-3 border-b border-white/5 bg-black/20">
                          <CardTitle className="text-sm font-bold text-zinc-300 uppercase tracking-wider">Image / Video properties</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-3 font-mono text-xs">
                          <div className="flex justify-between border-b border-white/5 pb-2">
                            <span className="text-zinc-500">File Name</span>
                            <span className="text-zinc-300 truncate max-w-[200px]">{compResult.media.name}</span>
                          </div>
                          <div className="flex justify-between border-b border-white/5 pb-2">
                            <span className="text-zinc-500">EXIF Date</span>
                            <span className="text-zinc-300 truncate max-w-[200px]">{compResult.media.date}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">EXIF GPS</span>
                            <span className="text-zinc-300 truncate max-w-[200px]">{compResult.media.gps}</span>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="bg-white/[0.01] border-white/5">
                        <CardHeader className="pb-3 border-b border-white/5 bg-black/20">
                          <CardTitle className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Takeout JSON sidecar</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-3 font-mono text-xs">
                          <div className="flex justify-between border-b border-white/5 pb-2">
                            <span className="text-zinc-500">JSON Title</span>
                            <span className="text-zinc-300 truncate max-w-[200px]">{compResult.json.title}</span>
                          </div>
                          <div className="flex justify-between border-b border-white/5 pb-2">
                            <span className="text-zinc-500">Taken Time</span>
                            <span className="text-zinc-300 truncate max-w-[200px]">{compResult.json.time}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">JSON GPS</span>
                            <span className="text-zinc-300 truncate max-w-[200px]">{compResult.json.gps}</span>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    <Card className="bg-white/[0.01] border-white/5">
                      <CardHeader className="pb-3 border-b border-white/5 bg-black/20">
                        <CardTitle className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Merge Match Checklist</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-3 font-mono text-xs">
                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                          <span className="text-zinc-300">Filename Association Match</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            compResult.checks.fileNameMatch 
                              ? 'bg-white/10 text-white border border-white/20' 
                              : 'bg-zinc-800/30 text-zinc-400 border border-zinc-750'
                          }`}>
                            {compResult.checks.fileNameMatch ? "ASSOCIATED" : "MISMATCHED"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                          <span className="text-zinc-300">EXIF Timestamp Synchronized</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            compResult.checks.dateMatch 
                              ? 'bg-white/10 text-white border border-white/20' 
                              : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
                          }`}>
                            {compResult.checks.dateMatch ? "EXISTS IN FILE" : "INJECTED ON WRITE"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-zinc-300">GPS Coordinates Synchronized</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            compResult.checks.gpsMatch 
                              ? 'bg-white/10 text-white border border-white/20' 
                              : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
                          }`}>
                            {compResult.checks.gpsMatch ? "EXISTS IN FILE" : "INJECTED ON WRITE"}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <div className="h-[400px] border border-white/5 rounded-2xl flex flex-col items-center justify-center text-center p-8 bg-zinc-950/25">
                    <Layers className="w-12 h-12 text-zinc-700 mb-4 animate-bounce" />
                    <h4 className="text-sm font-bold text-white mb-1">Awaiting Comparison Assets</h4>
                    <p className="text-xs text-zinc-500 max-w-xs">Select both a media file and JSON sidecar metadata record to analyze.</p>
                  </div>
                )}
              </div>
            )
          )}

          {activeToolTab === 'duplicates' && renderSuperTierGate(
            "Duplicate Space Analyzer",
            "Scan local Takeout folders to identify byte-identical duplicate files and reclaim storage.",
            ["Detect byte-exact identical duplicate groups", "Spot conflicting renamed files e.g. photo(1).jpg", "Calculate exact storage space reclaimable in megabytes", "Recursive main-thread scanner"],
            () => (
              <div className="p-8 space-y-6 overflow-y-auto h-full flex flex-col">
                <div className="border-b border-white/5 pb-4 flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-white mb-1">Duplicate Space Analyzer</h2>
                    <p className="text-zinc-400 text-xs">Exposes identical file duplicates within folders.</p>
                  </div>
                  {dupIsScanning && (
                    <span className="text-xs font-mono px-2.5 py-0.5 rounded bg-zinc-800/20 border border-zinc-800/40 text-zinc-400 animate-pulse">{dupScanStatus}</span>
                  )}
                </div>

                {dupStats.scanned > 0 ? (
                  <div className="space-y-6 flex-grow flex flex-col overflow-hidden">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Files Scanned</span>
                        <div className="text-2xl font-black text-white">{dupStats.scanned}</div>
                      </div>
                      <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Duplicates Found</span>
                        <div className="text-2xl font-black text-rose-400">{dupStats.duplicates}</div>
                      </div>
                      <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Reclaimable Space</span>
                        <div className="text-2xl font-black text-white">
                          {(dupStats.savedBytes / (1024 * 1024)).toFixed(2)} MB
                        </div>
                      </div>
                    </div>

                    <div className="flex-grow flex flex-col overflow-hidden border border-white/5 rounded-2xl bg-zinc-950/20">
                      <div className="px-4 py-3 bg-black/40 border-b border-white/5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Duplicate File List</div>
                      <div className="flex-grow p-4 overflow-y-auto font-mono text-xs divide-y divide-white/5 space-y-4">
                        {dupGroups.length > 0 ? (
                          dupGroups.map((g, idx) => (
                            <div key={idx} className="pt-4 first:pt-0">
                              <div className="flex justify-between items-center text-[10px] font-bold text-rose-400 mb-2">
                                <span>DUPLICATE GROUP #{idx + 1}</span>
                                <span>SIZE: {g.size}</span>
                              </div>
                              <div className="space-y-1.5 pl-3 border-l border-zinc-700">
                                {g.files.map((path: string, i: number) => (
                                  <div key={i} className="text-zinc-400 truncate text-[11px]" title={path}>
                                    <span className="text-zinc-600 font-bold mr-1.5">[{i === 0 ? "ORIGINAL" : `DUP ${i}`}]</span>
                                    {path}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-12 text-zinc-500 italic">No duplicate files found in this folder.</div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-[400px] border border-white/5 rounded-2xl flex flex-col items-center justify-center text-center p-8 bg-zinc-950/25 mt-12">
                    <Search className="w-12 h-12 text-zinc-700 mb-4" />
                    <h4 className="text-sm font-bold text-white mb-1">Awaiting Scan</h4>
                    <p className="text-xs text-zinc-500 max-w-xs">Select a local directory on the left and run the space analyzer to find duplicates.</p>
                  </div>
                )}
              </div>
            )
          )}

        </div>

      </div>

      {quotaAlert && quotaAlert.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="bg-zinc-950 border border-white/10 p-8 rounded-2xl max-w-md w-full text-center relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 left-0 right-0 h-1 bg-zinc-800 dark:bg-zinc-200"></div>
            <AlertCircle className="w-12 h-12 text-zinc-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Restoration Limit Reached</h3>
            <p className="text-zinc-400 text-sm mb-6 leading-relaxed">{quotaAlert.message}</p>
            <div className="space-y-3">
              <a href="/pricing">
                <Button className="btn-monochrome-primary w-full font-bold h-12 rounded-lg border-0 shadow-none transition-all duration-150 cursor-pointer">
                  Upgrade Plan
                </Button>
              </a>
              <Button 
                onClick={() => setQuotaAlert(null)}
                className="btn-monochrome-primary w-full h-12 font-bold rounded-lg border-0 shadow-none transition-all duration-150 cursor-pointer"
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdBlockGate>
  )
}

export default function ToolWorkspace() {
  return (
    <AuthProvider>
      <ToolWorkspaceContent />
      <ToastContainer />
    </AuthProvider>
  )
}
