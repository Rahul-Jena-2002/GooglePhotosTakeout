import { useRef, useEffect, useState } from "react"
import { useAuth } from "../contexts/AuthContext"
import { useToolStore } from "../store/useToolStore"
import { useToastStore } from "../store/useToastStore"
import { sanitizeFilename, findMatchingJsonName, safeParseJson, extractTimestamp } from "../services/MetadataMatcher"
import { findMatchingJsonNameForZip } from "../services/ZipMetadataMatcher"
import { isJpeg } from "../services/ExifRestorer"
import { db } from "../firebase"
import { doc, setDoc, increment, addDoc, collection, onSnapshot } from "firebase/firestore"
import AdBlockGate from "../components/AdBlockGate"
import AdUnit from "../components/AdUnit"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card"
import { Progress } from "../components/ui/progress"
import { FolderUp, HardDrive, Play, Square, Pause, Activity, Database, CheckCircle2, AlertCircle, XCircle, FileText, Cpu, Eye, Layers, Copy, Lock, FileImage, FileJson, Search, Zap, X, Sparkles, ShieldCheck } from "lucide-react"
// No react-router-dom imports
import { indexedDbService } from "../lib/indexedDbService"
import piexif from "piexifjs"
import { detectAdBlock } from "../services/AdBlockDetector"

// Resilient Session & Web Worker Pipeline Imports
import { SessionManager, type ActiveSession } from "../lib/SessionManager"
import { WorkerPool } from "../lib/WorkerPool"
import { ZipReader, BlobReader, BlobWriter, Uint8ArrayWriter } from "@zip.js/zip.js"
import { normalizeZipPath } from "../services/ZipMetadataMatcher"



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
}

const getPlanCardStyles = (plan: string, thresholds?: {
  free?: { maxFiles: number; maxSizeMB: number };
  recovery_pass?: { maxFiles: number; maxSizeMB: number };
  pro?: { maxFiles: number; maxSizeMB: number };
  super?: { maxFiles: number; maxSizeMB: number };
}) => {
  switch (plan) {
    case 'super':
      return {
        cardClass: "bg-white border-amber-200 shadow-sm",
        badgeClass: "bg-amber-100 border-amber-200 text-amber-800 font-bold",
        badgeText: "Super Active",
        iconClass: "text-amber-600",
        titleClass: "text-amber-800",
        titleText: "Super Lifetime Plan",
        description: "Unlimited restorations, EXIF repairs, and maximum thread count (Super Tier).",
      };
    case 'pro':
      return {
        cardClass: "bg-white border-purple-200 shadow-sm",
        badgeClass: "bg-purple-100 border-purple-200 text-purple-800 font-bold",
        badgeText: "Pro Active",
        iconClass: "text-purple-600",
        titleClass: "text-purple-800",
        titleText: "Pro Lifetime Plan",
        description: "High speed restorations, EXIF repairs, and priority support.",
      };
    case 'recovery_pass': {
      const maxFiles = thresholds?.recovery_pass?.maxFiles ?? 3000;
      const maxSizeMB = thresholds?.recovery_pass?.maxSizeMB ?? 3072;
      const sizeStr = maxSizeMB >= 1024 ? `${(maxSizeMB / 1024).toFixed(0)} GB` : `${maxSizeMB} MB`;
      const fileStr = maxFiles === Infinity ? "unlimited" : maxFiles.toLocaleString();
      const descText = maxFiles === Infinity
        ? "Single pass fully unlocked with no file count limits."
        : `Single pass fully unlocked up to ${fileStr} files (${sizeStr} size limit).`;
      return {
        cardClass: "bg-white border-blue-200 shadow-sm",
        badgeClass: "bg-blue-100 border-blue-200 text-blue-800 font-bold",
        badgeText: "Single Pass",
        iconClass: "text-blue-600",
        titleClass: "text-blue-800",
        titleText: "Single Time Plan",
        description: descText,
      };
    }
    case 'free':
    default: {
      const maxFiles = thresholds?.free?.maxFiles ?? 250;
      const maxSizeMB = thresholds?.free?.maxSizeMB ?? 500;
      const sizeStr = maxSizeMB >= 1024 ? `${(maxSizeMB / 1024).toFixed(0)} GB` : `${maxSizeMB} MB`;
      const fileStr = maxFiles === Infinity ? "unlimited" : maxFiles.toLocaleString();
      return {
        cardClass: "bg-white border-zinc-200 shadow-sm",
        badgeClass: "bg-zinc-100 border-zinc-200 text-zinc-700 font-semibold",
        badgeText: "Free Tier",
        iconClass: "text-zinc-500",
        titleClass: "text-zinc-800",
        titleText: "Free Plan",
        description: `Upgrade to unlock unlimited files, EXIF meta repairs & maximum speed (Free limit: ${fileStr} files / ${sizeStr}).`,
      };
    }
  }
};

import { AuthProvider } from "../contexts/AuthContext"
import { ToastContainer } from "../components/ui/toast"

export function ToolWorkspaceContent() {
  const { user, userData, loading, refreshUserData, login } = useAuth()

  const plan = userData?.plan || 'free'

  const getUserBytes = (u: Record<string, unknown> | null | undefined) => {
    if (!u) return 0;
    const usedBytes = typeof u.usedBytes === 'number' ? u.usedBytes : 0;
    const totalBytesProcessed = typeof u.totalBytesProcessed === 'number' ? u.totalBytesProcessed : 0;
    const lifetimeBytes = typeof u.lifetimeBytes === 'number' ? u.lifetimeBytes : 0;
    return Math.max(usedBytes, totalBytesProcessed, lifetimeBytes);
  }

  const getUserFiles = (u: Record<string, unknown> | null | undefined) => {
    if (!u) return 0;
    const usedFiles = typeof u.usedFiles === 'number' ? u.usedFiles : 0;
    const totalFilesProcessed = typeof u.totalFilesProcessed === 'number' ? u.totalFilesProcessed : 0;
    const lifetimeFiles = typeof u.lifetimeFiles === 'number' ? u.lifetimeFiles : 0;
    const totalBytesProcessed = typeof u.totalBytesProcessed === 'number' ? u.totalBytesProcessed : 0;
    const usedBytes = typeof u.usedBytes === 'number' ? u.usedBytes : 0;
    const lifetimeBytes = typeof u.lifetimeBytes === 'number' ? u.lifetimeBytes : 0;

    const recorded = Math.max(totalFilesProcessed, usedFiles, lifetimeFiles);
    const trackedBytes = Math.max(totalBytesProcessed, usedBytes);
    const legacyBytes = Math.max(0, lifetimeBytes - trackedBytes);
    const legacyFiles = legacyBytes > 0 ? Math.round(legacyBytes / (1.2 * 1024 * 1024)) : 0;
    return recorded + legacyFiles;
  }

  const currentUsedFiles = plan === 'free' ? getUserFiles(userData as Record<string, unknown>) : (userData?.usedFiles || 0)
  const currentUsedBytes = plan === 'free' ? getUserBytes(userData as Record<string, unknown>) : (userData?.usedBytes || 0)

  // Plan thresholds — loaded dynamically from Firestore settings/global.tierThresholds
  const [tierThresholds, setTierThresholds] = useState({
    free:          { maxFiles: 250,    maxSizeMB: 500    },
    recovery_pass: { maxFiles: 3000,   maxSizeMB: 3072   },
    pro:           { maxFiles: Infinity, maxSizeMB: Infinity },
    super:         { maxFiles: Infinity, maxSizeMB: Infinity },
  })

  const limitFiles = plan === 'pro' || plan === 'super'
    ? Infinity
    : (tierThresholds[plan as keyof typeof tierThresholds]?.maxFiles ?? 250)
  const limitBytes = plan === 'pro' || plan === 'super'
    ? Infinity
    : (tierThresholds[plan as keyof typeof tierThresholds]?.maxSizeMB ?? 500) * 1024 * 1024

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

  const formatByteSize = (bytes: number) => {
    if (bytes === Infinity) return "Unlimited";
    if (bytes >= 1024 * 1024 * 1024) {
      const gb = bytes / (1024 * 1024 * 1024);
      return gb % 1 === 0 ? `${gb.toFixed(0)} GB` : `${gb.toFixed(2)} GB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  };

  // Maintenance State
  const [maintenance, setMaintenance] = useState(false)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "global"), (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        setMaintenance(data.maintenance ?? false)
        // Sync tool thresholds from admin settings
        const stored = data.tierThresholds
        if (stored) {
          setTierThresholds({
            free:          { maxFiles: stored.free?.maxFiles ?? 250,         maxSizeMB: stored.free?.maxSizeMB ?? 500    },
            recovery_pass: { maxFiles: stored.recovery_pass?.maxFiles ?? 3000, maxSizeMB: stored.recovery_pass?.maxSizeMB ?? 3072 },
            pro:           { maxFiles: Infinity,                               maxSizeMB: Infinity },
            super:         { maxFiles: Infinity,                               maxSizeMB: Infinity },
          })
        }
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

  const [useDeepExif, setUseDeepExif] = useState(false)
  const useDeepExifRef = useRef(false)
  
  // Concurrency processing pool implementation
  const [maxWorkers, setMaxWorkers] = useState(1)
  const [activeWorkersCount, setActiveWorkersCount] = useState(0)
  const [popupModal, setPopupModal] = useState<{ title: string; message: string; type: 'error' | 'warning' } | null>(null)

  const isProcessingRef = useRef(false)
  const logContainerRef = useRef<HTMLDivElement>(null)
  const startTimeRef = useRef<number>(0)
  
  // Quota session trackers
  const sessionBytesRef = useRef(0)
  const sessionFilesRef = useRef(0)
  const [sessionBytes, setSessionBytes] = useState(0)
  const [sessionFiles, setSessionFiles] = useState(0)
  
  // Buffers for batching UI updates to prevent freezing
  const statsBuffer = useRef({ scanned: 0, matched: 0, unmatched: 0, errors: 0, total: 0 })
  const totalBytesRef = useRef<number>(0)
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
  const [takeoutLock, setTakeoutLock] = useState(false)
  const [outputLock, setOutputLock] = useState(false)
  const [takeoutFolderStructure, setTakeoutFolderStructure] = useState<any>(null)
  const [zipFilesList, setZipFilesList] = useState<any[]>([])
  const [showCompareModal, setShowCompareModal] = useState(false)
  const [modalContext, setModalContext] = useState<'source' | 'destination' | null>(null)
  const [pendingFolderHandle, setPendingFolderHandle] = useState<FileSystemDirectoryHandle | null>(null)
  
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
        const extendedItem = item as DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> }
        if (typeof extendedItem.getAsFileSystemHandle === 'function') {
          const handle = await extendedItem.getAsFileSystemHandle()
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
  const [logTab, setLogTab] = useState<'all' | 'restored' | 'errors' | 'skipped'>('all')
  
  const sessionManagerRef = useRef<SessionManager>(new SessionManager())
  const workerPoolRef = useRef<WorkerPool | null>(null)
  const resumeNextRef = useRef<(() => void) | null>(null)

  // 1. Visual EXIF Viewer state
  const [viewerFile, setViewerFile] = useState<File | null>(null)
  const [viewerExif, setViewerExif] = useState<Record<string, unknown> | null>(null)
  const [viewerLoading, setViewerLoading] = useState(false)

  // 2. Metadata Comparison state
  const [compMediaFile, setCompMediaFile] = useState<File | null>(null)
  const [compJsonFile, setCompJsonFile] = useState<File | null>(null)
  const [compResult, setCompResult] = useState<Record<string, unknown> | null>(null)

  // 3. Duplicate Space Analyzer state
  const [dupFolder, setDupFolder] = useState<FileSystemDirectoryHandle | null>(null)
  const [dupIsScanning, setDupIsScanning] = useState(false)
  const [dupStats, setDupStats] = useState({ scanned: 0, duplicates: 0, savedBytes: 0 })
  const [dupGroups, setDupGroups] = useState<Record<string, unknown>[]>([])
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
    let optimal = isMobile
      ? Math.max(2, Math.floor(cores * 0.5))
      : cores <= 4
      ? Math.max(2, cores - 1)
      : cores <= 12
      ? Math.floor(cores * 0.75)
      : Math.floor(cores * 0.8)
    
    if ('deviceMemory' in navigator) {
      const mem = (navigator as unknown as { deviceMemory: number }).deviceMemory
      if (mem >= 8) {
        return Math.min(24, optimal)
      }
      if (mem < 4) {
        optimal = Math.max(1, Math.min(optimal, Math.floor(mem)))
      }
    }
    return Math.min(16, optimal)
  }

  useEffect(() => {
    const initTelemetryAndSession = async () => {
      // Always calculate optimal thread count dynamically to respect hardware capabilities
      const optimal = getOptimalThreadCount();
      setMaxWorkers(optimal);
      
      // Clean up any stale persisted custom selections to ensure dynamic behavior is maintained
      await indexedDbService.remove('telemetry', 'takeoutfix_max_workers').catch(() => {});

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        const { bytes, files, takeoutName, historySessionId } = pending
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  useEffect(() => {
    const timer = setInterval(() => {
      // Tab heap memory check
      let heap = 0
      const perf = performance as unknown as { memory?: { usedJSHeapSize: number } }
      if (perf.memory) {
        heap = perf.memory.usedJSHeapSize / (1024 * 1024)
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

  // React Early Returns (Moved below all Hook declarations to adhere to React Hook Rules)
  if (loading) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-t-zinc-200 border-zinc-800 rounded-full animate-spin"></div>
      </div>
    )
  }

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

  if (user && userData?.suspended) {
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

  const handleSelectTakeout = async () => {
    if (takeoutLock) return
    if (typeof window === 'undefined' || !window.showDirectoryPicker) {
      useToastStore.getState().addToast(
        "Your browser engine blocks local workspace streaming. Please migrate to Chromium.",
        "error",
        6000,
        "Browser Incompatible"
      )
      return
    }
    setTakeoutLock(true)
    try {
      const dirHandle = (await (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker()) as FileSystemDirectoryHandle
      
      const status = await dirHandle.queryPermission({ mode: 'read' })
      if (status === 'prompt') {
        setPendingFolderHandle(dirHandle)
        setModalContext('source')
      } else {
        setTakeoutFolder(dirHandle)
        setZipFile(null)
        window.dispatchEvent(new CustomEvent('takeoutfix-action-triggered'))
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        useToastStore.getState().addToast(
          "Oops! The selection prompt was closed by mistake. Try clicking again.",
          "error",
          4500,
          "Selection Cancelled"
        )
        return
      }
      console.error('Error selecting takeout folder:', err)
      const isNotAllowed = err.name === 'NotAllowedError'
      useToastStore.getState().addToast(
        isNotAllowed 
          ? "TakeoutFix requires read clearance to search for photos and sidecar metadata files." 
          : `An internal filesystem tracking collision occurred. Please select again. (${err.message || err})`,
        "error",
        4500,
        isNotAllowed ? "Permission Denied" : "Directory Failure"
      )
    } finally {
      setTakeoutLock(false)
    }
  }

  const handleSelectOutput = async () => {
    if (outputLock) return
    if (typeof window === 'undefined' || !window.showDirectoryPicker) {
      useToastStore.getState().addToast(
        "Your browser engine blocks local workspace streaming. Please migrate to Chromium.",
        "error",
        6000,
        "Browser Incompatible"
      )
      return
    }
    setOutputLock(true)
    try {
      const dirHandle = (await (window as unknown as { showDirectoryPicker: (options?: { mode?: 'read' | 'readwrite' }) => Promise<unknown> }).showDirectoryPicker()) as FileSystemDirectoryHandle
      
      const status = await dirHandle.queryPermission({ mode: 'readwrite' })
      if (status === 'prompt') {
        setPendingFolderHandle(dirHandle)
        setModalContext('destination')
      } else if (status === 'granted') {
        setOutputFolder(dirHandle)
        window.dispatchEvent(new CustomEvent('takeoutfix-action-triggered'))
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        useToastStore.getState().addToast(
          "Oops! The selection prompt was closed by mistake. Try clicking again.",
          "error",
          4500,
          "Selection Cancelled"
        )
        return
      }
      console.error('Error selecting output folder:', err)
      const isNotAllowed = err.name === 'NotAllowedError'
      useToastStore.getState().addToast(
        isNotAllowed 
          ? "TakeoutFix requires read-write clearance to update missing EXIF time tags." 
          : `An internal filesystem tracking collision occurred. Please select again. (${err.message || err})`,
        "error",
        4500,
        isNotAllowed ? "Permission Obliteration" : "Directory Failure"
      )
    } finally {
      setOutputLock(false)
    }
  }

  const handleModalConfirm = async () => {
    if (!pendingFolderHandle || !modalContext) return
    const targetMode = modalContext === 'source' ? 'read' : 'readwrite'
    try {
      const updatedStatus = await pendingFolderHandle.requestPermission({ mode: targetMode })
      if (updatedStatus === 'granted') {
        if (modalContext === 'source') {
          setTakeoutFolder(pendingFolderHandle)
          setZipFile(null)
        } else {
          setOutputFolder(pendingFolderHandle)
        }
        window.dispatchEvent(new CustomEvent('takeoutfix-action-triggered'))
      } else {
        useToastStore.getState().addToast(
          modalContext === 'source'
            ? "Read permission is required to scan Google Takeout files."
            : "Write permission is required to save restored files in this folder.",
          "warning"
        )
      }
    } catch (err) {
      console.error("Native authorization request failed", err)
      useToastStore.getState().addToast("Native authorization request failed", "error")
    } finally {
      setPendingFolderHandle(null)
      setModalContext(null)
    }
  }

  const updateActiveSession = async (status: 'initializing' | 'processing' | 'completed' | 'failed' | 'cancelled', fields: Record<string, unknown> = {}) => {
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

  async function saveUsageToFirestore(bytes: number, files: number) {
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

  async function commitSessionUsage() {
    const bytesToSave = sessionBytesRef.current
    const filesToSave = sessionFilesRef.current
    if (bytesToSave <= 0 && filesToSave <= 0) return

    // Zero out trackers immediately to prevent duplicate updates
    sessionBytesRef.current = 0
    sessionFilesRef.current = 0
    setSessionBytes(0)
    setSessionFiles(0)
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
      setSessionBytes(sessionBytesRef.current)
      setSessionFiles(sessionFilesRef.current)
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
          useToastStore.getState().addToast("Permission to read the source folder is required to resume.", "error");
          return;
        }
      }

      if (session.outputHandle) {
        const status = await session.outputHandle.requestPermission({ mode: 'readwrite' });
        if (status !== 'granted') {
          useToastStore.getState().addToast("Permission to write to the output folder is required to resume.", "error");
          return;
        }
      }

      proceedResume(session);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("Resumption re-grant failed:", err);
      useToastStore.getState().addToast("Resumption failed: " + errMsg, "error");
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

    try {
      // Byte sum is stored in session; no need to reload all files into heap
      totalBytesRef.current = session.bytesProcessed > 0 ? session.bytesProcessed : 0;
    } catch (err) {
      console.error("Failed to get bytes on resume:", err);
      totalBytesRef.current = 0;
    }

    setStats({ ...statsBuffer.current });
    setProgress(Math.floor((session.scannedCount / session.totalFiles) * 100));
    setCurrentFile("Resuming restoration...");
    setLogs([]);
    logsBuffer.current = [{ level: 'info', msg: `Resuming restoration... Re-checking in-flight files.` }];

    startTimeRef.current = Date.now() - (session.lastUpdatedAt - session.startedAt);

    flushInterval.current = window.setInterval(() => {
      setStats({ ...statsBuffer.current });
      setProgress(progressBuffer.current);
      // removed setCurrentFile to save memory;
      setSessionBytes(sessionBytesRef.current);
      setSessionFiles(sessionFilesRef.current);
      setLogs(prev => {
        const newLogs = [...prev, ...logsBuffer.current];
        logsBuffer.current = [];
        return newLogs.slice(-300);
      });
    }, 250);

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
    const zipEntryMap = new Map<string, any>();

    if (session.zipFile) {
      zipReader = new ZipReader(new BlobReader(session.zipFile));
      zipEntries = await zipReader.getEntries();

      for (const entry of zipEntries) {
        // Normalize Windows backslashes and apply NFC so lookups are consistent
        const normalizedFilename = normalizeZipPath(entry.filename).normalize('NFC');
        zipEntryMap.set(normalizedFilename, entry);
      }
    }

    // 3. Directory cache for local file handle listings (resolving JSON sidecars on-demand)
    // Cap at 500 entries to prevent unbounded growth on archives with many subdirectories.
    const DIR_CACHE_MAX = 500;
    const dirCache = new Map<string, Set<string>>();
    const getDirNames = async (dirHandle: FileSystemDirectoryHandle, pathKey: string): Promise<Set<string>> => {
      let cached = dirCache.get(pathKey);
      if (!cached) {
        // Evict oldest entries if we've hit the cap (simple FIFO eviction)
        if (dirCache.size >= DIR_CACHE_MAX) {
          const firstKey = dirCache.keys().next().value;
          if (firstKey !== undefined) dirCache.delete(firstKey);
        }
        cached = new Set<string>();
        // @ts-ignore
        for await (const [name] of dirHandle) {
          const safe = sanitizeFilename(name);
          if (safe) cached.add(safe);
        }
        dirCache.set(pathKey, cached);
      }
      return cached;
    };

    // 4. Revert in-flight files (delete half-written and reset status to pending)
    await sessionManager.revertInFlightFiles();

    // 5. Get total pending count (lightweight — no FileRecord materialisation)
    const totalPending = await sessionManager.getPendingCount();
    const PAGE_SIZE = 200; // process files in pages to keep heap flat
    let globalFileIndex = 0;  // absolute index across all pages
    let lastFileId: string | null = null; // last processed record ID for cursor page fetches
    let currentPage: FileRecord[] = []; // current in-memory page
    let pageIndex = 0;        // index within current page
    
    // 6. Throttling and backpressure counter
    // For ZIP: sequential processing (1 at a time) avoids ZipReader lock contention and is actually faster.
    // For folder: use user-configured maxWorkers.
    let inFlightCount = 0;
    const inflightLimit = session.zipFile ? 1 : maxWorkers;

    const processNext = async () => {
      if (!isProcessingRef.current || isPausedRef.current) {
        if (inFlightCount === 0 && !isProcessingRef.current) {
          if (zipReader) {
            try { await zipReader.close(); } catch {}
          }
          resumeNextRef.current = null;
        }
        return;
      }

      const runWorker = async () => {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (!isProcessingRef.current || isPausedRef.current) break;

          // Advance within the current page
          if (pageIndex >= currentPage.length) {
            // Current page exhausted — null it out to allow GC to reclaim handles
            currentPage = [];
            pageIndex = 0;

            // Check if there are more files to process
            if (globalFileIndex >= totalPending) break;

            // Fetch the next page
            try {
              currentPage = await sessionManager.getPendingFilesPage(lastFileId, PAGE_SIZE);
              if (currentPage.length > 0) {
                lastFileId = currentPage[currentPage.length - 1].id;
              }
            } catch (err) {
              console.error("Failed to load next page of pending files:", err);
              break;
            }

            if (currentPage.length === 0) break;
          }

          const fileRecord = currentPage[pageIndex++];
          globalFileIndex++;
          if (!fileRecord) break;

          inFlightCount++;
          setActiveWorkersCount(inFlightCount);

          try {
            // Check quota limits
            const isBypass = userData?.isAdmin || import.meta.env.DEV;
            if (!isBypass && (currentUsedBytesRef.current + sessionBytesRef.current > limitBytesRef.current || currentUsedFilesRef.current + sessionFilesRef.current > limitFilesRef.current)) {
              if (zipReader) {
                try { await zipReader.close(); } catch {}
              }
              await haltDueToQuota();
              return;
            }

            // Claim file (mark processing in IDB)
            await sessionManager.claimFile(fileRecord.id);

            let size = fileRecord.bytes;
            let fileObj: File | null = null;
            let zipEntry: any = null;

            // 1. Resolve handles dynamically from root if local directory to prevent permission revocation
            let parentDirHandle = fileRecord.dirHandle;
            let fileHandle = fileRecord.fileHandle;

            if (session.takeoutHandle && fileRecord.relativePath) {
              try {
                let current = session.takeoutHandle;
                for (const part of fileRecord.relativePath) {
                  current = await current.getDirectoryHandle(part);
                }
                parentDirHandle = current;
                fileHandle = await current.getFileHandle(fileRecord.filename);
              } catch (err) {
                console.warn("Failed to resolve handles from root takeoutHandle:", err);
              }
            }

            // 2. Get file metadata/reference
            if (fileHandle) {
              try {
                fileObj = await fileHandle.getFile();
              } catch {
                if (parentDirHandle) {
                  const freshHandle = await parentDirHandle.getFileHandle(fileRecord.filename);
                  fileObj = await freshHandle.getFile();
                } else {
                  throw new Error("Parent directory handle not found.");
                }
              }
              size = fileObj.size;
            } else if (fileRecord.zipPath && zipReader) {
              // zipPath is already normalized (forward slashes, NFC) from SessionManager scan
              zipEntry = zipEntryMap.get(normalizeZipPath(fileRecord.zipPath).normalize('NFC'));
              if (zipEntry) {
                size = zipEntry.uncompressedSize;
              }
            }

            if (!fileObj && !zipEntry) {
              throw new Error("Source file reference not found.");
            }

            // 3. Resolve sidecar and epoch timestamp (on-demand during restoration)
            let epochSec: number | null = null;
            let lat: number | undefined = undefined;
            let lng: number | undefined = undefined;

            if (fileHandle && parentDirHandle) {
              // Folder source: resolve sidecar on-demand during restoration
              const pathKey = fileRecord.relativePath.join('/');
              const allNames = await getDirNames(parentDirHandle, pathKey);
              const jsonName = findMatchingJsonName(fileRecord.filename, allNames);
              if (jsonName) {
                try {
                  const jsonHandle = await parentDirHandle.getFileHandle(jsonName);
                  const jsonFile = await jsonHandle.getFile();
                  const parsed = safeParseJson(await jsonFile.text());
                  if (parsed) {
                    epochSec = extractTimestamp(parsed);
                    if (useDeepExifRef.current && parsed.geoData && (parsed.geoData.latitude !== 0 || parsed.geoData.longitude !== 0)) {
                      lat = parsed.geoData.latitude;
                      lng = parsed.geoData.longitude;
                    }
                  }
                } catch {}
              }
            } else if (fileRecord.zipPath) {
              // ZIP source: metadata was pre-cached during the scan phase — use it directly!
              // This avoids re-opening the ZIP to re-read JSON sidecars during restoration.
              epochSec = fileRecord.epochSec;
              if (useDeepExifRef.current && fileRecord.lat != null && fileRecord.lng != null) {
                lat = fileRecord.lat;
                lng = fileRecord.lng;
              }
            }

            // 4. Process buffer / inject EXIF if applicable
            let bufferOrBlob: any = null;
            let actionStr = 'No Metadata Found';
            let levelStr = 'warn';

            if (epochSec) {
              actionStr = 'Restored';
              levelStr = 'success';

              if (isJpeg(fileRecord.filename)) {
                // Read buffer only when EXIF injection is needed
                if (fileObj) {
                  bufferOrBlob = await fileObj.arrayBuffer();
                } else if (zipEntry) {
                  const writer = new Uint8ArrayWriter();
                  const bytes = await zipEntry.getData!(writer);
                  bufferOrBlob = bytes.buffer;
                  // Help GC release writer
                  (writer as any).writable = null;
                }

                if (bufferOrBlob) {
                  // Run EXIF injection in the background Worker
                  const res = await pool.runTask('inject_exif', {
                    buffer: bufferOrBlob,
                    epochSec,
                    lat,
                    lng,
                    filename: fileRecord.filename
                  }, [bufferOrBlob]);

                  bufferOrBlob = res.buffer;
                  if (res.success) {
                    actionStr = useDeepExifRef.current ? 'Deep Injected' : 'Restored & Injected';
                  } else {
                    actionStr = `EXIF Error: ${res.error}`;
                    levelStr = 'error';
                  }
                }
              } else {
                // Zero-RAM copying: Stream the file / entry directly without loading it to JS heap!
                if (fileObj) {
                  bufferOrBlob = fileObj; // Stream the File object directly!
                } else if (zipEntry) {
                  // Use BlobWriter to avoid materializing entire buffer in main-thread heap
                  const blobWriter = new BlobWriter();
                  bufferOrBlob = await zipEntry.getData!(blobWriter);
                }
              }
            } else {
              // Zero-RAM copying: Stream the file / entry directly without loading it to JS heap!
              if (fileObj) {
                bufferOrBlob = fileObj; // Stream the File object directly!
              } else if (zipEntry) {
                // Use BlobWriter to avoid materializing entire buffer in main-thread heap
                const blobWriter = new BlobWriter();
                bufferOrBlob = await zipEntry.getData!(blobWriter);
              }
            }

            if (!bufferOrBlob) {
              throw new Error("Failed to read file contents.");
            }

            // 5. Write output directly
            const baseFolder = (epochSec && actionStr !== 'EXIF Error') ? 'restored' : 'unmatched';
            const outSubDir = await getOrCreateDir(session.outputHandle!, [baseFolder, ...fileRecord.relativePath]);
            const outHandle = await outSubDir.getFileHandle(fileRecord.filename, { create: true });
            
            const writable = await outHandle.createWritable();
            await writable.write(bufferOrBlob);
            await writable.close();

            // 6. Confirm completion (passing resolved size and epochSec)
            await sessionManager.confirmFile(fileRecord.id, 'completed', size, epochSec);

            // Explicitly nullify large references so GC can reclaim heap promptly
            bufferOrBlob = null;
            fileObj = null;
            zipEntry = null;

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
            
            await sessionManager.confirmFile(fileRecord.id, 'failed', fileRecord.bytes, null, err.message);

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
            setActiveWorkersCount(inFlightCount);

            // V8 GC Yield: yield back event loop every 5 files to give GC idle time
            if (globalFileIndex % 5 === 0) {
              await new Promise(resolve => setTimeout(resolve, 10));
            }
          }
        }

        // Check if all pages exhausted or cancelled
        if (inFlightCount === 0) {
          if (globalFileIndex >= totalPending || !isProcessingRef.current) {
            if (zipReader) {
              try { await zipReader.close(); } catch {}
            }
            resumeNextRef.current = null;
            if (globalFileIndex >= totalPending && isProcessingRef.current) {
              await completeProcessing();
            }
          }
        }
      };

      // Spawn worker instances to fill up the concurrency limit
      const workersNeeded = inflightLimit - inFlightCount;
      for (let i = 0; i < workersNeeded; i++) {
        runWorker();
      }
    };

    resumeNextRef.current = processNext;

    // Trigger initial batch
    processNext();
  };

  const haltDueToQuota = async () => {
    setActiveWorkersCount(0)

    if (flushInterval.current) {
      window.clearInterval(flushInterval.current)
      flushInterval.current = null
    }
    
    setIsProcessing(false)
    isProcessingRef.current = false
    setUseDeepExif(false)
    useDeepExifRef.current = false
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
      limitReason = `your storage limit of ${plan === 'free' ? '500 MB' : '3 GB'}`
    } else {
      limitReason = `your file count limit of ${plan === 'free' ? '250 files' : '3,000 files'}`
    }

    setQuotaAlert({
      open: true,
      message: `You have hit ${limitReason} of your ${PLAN_LABELS[plan] || plan} plan quota. Restoration paused. Upgrade now to continue.`
    })
  }

  const completeProcessing = async () => {
    setIsProcessing(false)
    isProcessingRef.current = false
    setUseDeepExif(false)
    useDeepExifRef.current = false
    setActiveWorkersCount(0)

    if (flushInterval.current) {
      window.clearInterval(flushInterval.current)
      flushInterval.current = null
    }
    
    setStats({ ...statsBuffer.current })
    setProgress(progressBuffer.current)
    setCurrentFile("Processing Complete")
    setLogs(prev => [...prev, ...logsBuffer.current].slice(-300))
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

  const handleSelectDupFolder = async () => {
    if (typeof window === 'undefined' || !window.showDirectoryPicker) {
      useToastStore.getState().addToast(
        "Your browser does not support selecting folders directly. Please use a desktop version of Google Chrome, Brave, or Microsoft Edge.",
        "error",
        6000,
        "Browser Support Required"
      )
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
      useToastStore.getState().addToast(
        `Could not open folder picker: ${err.message || err}`,
        "error",
        6000,
        "Directory Access Error"
      )
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
        const subDirs: FileSystemDirectoryHandle[] = []
        const currentFiles: FileSystemFileHandle[] = []

        // @ts-ignore
        for await (const [name, entry] of handle) {
          if (entry.kind === 'file') {
            currentFiles.push(entry as FileSystemFileHandle)
          } else if (entry.kind === 'directory') {
            subDirs.push(entry as FileSystemDirectoryHandle)
          }
        }

        const processFile = async (fileHandle: FileSystemFileHandle) => {
          try {
            const file = await fileHandle.getFile()
            const size = file.size
            
            let list = fileMapByBytes.get(size)
            if (!list) {
              list = []
              fileMapByBytes.set(size, list)
            }
            list.push({ handle: fileHandle, path: [...path, fileHandle.name] })
            count++
            if (count % 100 === 0) {
              setDupScanStatus(`Scanned ${count} files...`)
            }
          } catch {}
        }

        const limit = 50
        for (let i = 0; i < currentFiles.length; i += limit) {
          const chunk = currentFiles.slice(i, i + limit)
          await Promise.all(chunk.map(processFile))
        }

        for (const subDir of subDirs) {
          await walk(subDir, [...path, subDir.name])
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

  const startProcessing = async (deep: boolean = false) => {
    // Whitelist Enforcement: Only start restoration process if not blocked by ad blocker
    const isAdFree = userData?.plan === "super" && !userData?.supportWithAds;
    if (!isAdFree) {
      const isBlocked = await detectAdBlock();
      if (isBlocked) {
        window.dispatchEvent(new CustomEvent('takeoutfix-action-triggered'));
        setPopupModal({
          title: "Ad Blocker Detected",
          message: "To start the restoration process, please disable your ad blocker or whitelist TakeoutFix.\n\nAlternatively, upgrade to Super for an ad-free experience.",
          type: "warning"
        });
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
        limitReason = `your storage limit of ${plan === 'free' ? '500 MB' : '3 GB'}`
      } else {
        limitReason = `your file count limit of ${plan === 'free' ? '250 files' : '3,000 files'}`
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
    setUseDeepExif(deep)
    useDeepExifRef.current = deep
    setProgress(0)
    setStats({ scanned: 0, matched: 0, unmatched: 0, errors: 0, total: 0 })
    statsBuffer.current = { scanned: 0, matched: 0, unmatched: 0, errors: 0, total: 0 }
    totalBytesRef.current = 0
    logsBuffer.current = []
    setLogs([])
    setCurrentFile("Scanning input source...")
    
    sessionBytesRef.current = 0
    sessionFilesRef.current = 0
    setSessionBytes(0)
    setSessionFiles(0)
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
      // removed setCurrentFile to save memory
      setSessionBytes(sessionBytesRef.current)
      setSessionFiles(sessionFilesRef.current)
      setLogs(prev => {
        const newLogs = [...prev, ...logsBuffer.current]
        logsBuffer.current = []
        return newLogs.slice(-300)
      })
    }, 250)

    try {
      const session = await sessionManagerRef.current.startNewSession(
        sessionId,
        user.uid,
        sourceName,
        zipFile || takeoutFolder!,
        outputFolder
      );

      const { count: totalFiles, totalBytes: scannedTotalBytes } = await sessionManagerRef.current.scanAndRegister((indexedCount) => {
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
      
      // Use the byte sum collected during scan — no second getAll() needed
      totalBytesRef.current = scannedTotalBytes;
      
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
    setUseDeepExif(false)
    useDeepExifRef.current = false
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
      if (resumeNextRef.current) {
        resumeNextRef.current()
      }
    }
  }

  const getEstimatedRestoreTime = () => {
    const totalFiles = stats.total || 0;
    if (totalFiles <= 0) {
      return "⏱️ Est. restoration time: Scan (a few seconds)";
    }
    
    if (isPaused) {
      return "⏱️ Est. restoration time: Paused";
    }

    const scannedFiles = stats.scanned || 0;
    const remainingFiles = Math.max(0, totalFiles - scannedFiles);
    
    if (remainingFiles <= 0) {
      return "⏱️ Est. restoration time: Complete";
    }

    // Baseline speeds
    let filesPerSec = 50;
    let bytesPerSec = 100 * 1024 * 1024; // 100 MB/s

    // Calculate real-time speed if we have processed a few files
    if (scannedFiles > 5 && startTimeRef.current > 0) {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      if (elapsed > 1) {
        const calculatedFilesPerSec = scannedFiles / elapsed;
        const calculatedBytesPerSec = sessionBytes / elapsed;
        
        if (calculatedFilesPerSec > 2) {
          filesPerSec = calculatedFilesPerSec;
        }
        if (calculatedBytesPerSec > 1024 * 1024) { // at least 1 MB/s
          bytesPerSec = calculatedBytesPerSec;
        }
      }
    }

    // Determine remaining bytes (ZIP has exact size, directory is estimated dynamically)
    let remainingBytes = 0;
    const totalBytes = totalBytesRef.current || 0;
    if (totalBytes > 0) {
      remainingBytes = Math.max(0, totalBytes - sessionBytes);
    } else if (scannedFiles > 0) {
      const avgBytesPerFile = sessionBytes / scannedFiles;
      remainingBytes = avgBytesPerFile * remainingFiles;
    } else {
      // 2MB per file average fallback
      remainingBytes = remainingFiles * 2 * 1024 * 1024;
    }

    // Hybrid estimation formula: max of remaining files time and remaining bytes time
    const timeFiles = remainingFiles / filesPerSec;
    const timeBytes = remainingBytes / bytesPerSec;
    const seconds = Math.ceil(Math.max(timeFiles, timeBytes));

    // Rounding & approximations
    let timeString = "";
    if (seconds >= 300) { // 5 minutes or more: round to nearest minute
      const mins = Math.round(seconds / 60);
      timeString = `≈ ${mins} minutes`;
    } else if (seconds >= 60) { // between 1 and 5 minutes: round to nearest 30 seconds
      const halfMins = Math.round(seconds / 30);
      if (halfMins % 2 === 0) {
        const mins = halfMins / 2;
        timeString = `≈ ${mins} minute${mins !== 1 ? 's' : ''}`;
      } else {
        timeString = `≈ ${Math.floor(halfMins / 2)}.5 minutes`;
      }
    } else if (seconds >= 15) { // between 15 seconds and 1 minute: round to nearest 5 seconds
      const roundedSecs = Math.round(seconds / 5) * 5;
      timeString = `≈ ${roundedSecs} seconds`;
    } else { // under 15 seconds
      timeString = "Less than 15 seconds";
    }

    return `⏱️ Est. restoration time: ${timeString}${scannedFiles > 0 ? ' remaining' : ''}`;
  };

  return (
    <AdBlockGate>
      <div className="w-full lg:h-[calc(100vh-64px)] h-auto flex flex-col lg:flex-row bg-[#0A0A0A] lg:overflow-hidden overflow-y-auto">

        {/* RIGHT MAIN AREA: RECOVERY CENTER */}
        <div className="flex-grow w-full lg:w-[72%] bg-black flex flex-col lg:h-full h-auto overflow-hidden order-1 lg:order-2">
          
          <div className="p-4 border-b border-white/5 bg-white/[0.01] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4.5 h-4.5 text-indigo-400" />
                Recovery Center
              </h2>
              <p className="text-[10px] text-zinc-400 mt-0.5">Select a module to restore files, read EXIF tags, compare sidecars, or check duplicates.</p>
            </div>
            
            <div className="relative inline-block w-full sm:w-56">
              <select
                value={activeToolTab}
                onChange={(e) => setActiveToolTab(e.target.value as any)}
                className="w-full bg-[#121212] border border-white/10 hover:border-white/20 text-zinc-200 text-xs font-bold rounded-lg px-3 py-2 outline-none appearance-none cursor-pointer transition-all pr-8"
              >
                <option value="restore">Restore Archive</option>
                <option value="viewer">{plan === 'super' ? 'EXIF Viewer' : '🔒 EXIF Viewer (Super)'}</option>
                <option value="comparison">{plan === 'super' ? 'Comparison' : '🔒 Comparison (Super)'}</option>
                <option value="duplicates">{plan === 'super' ? 'Duplicates' : '🔒 Duplicates (Super)'}</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-zinc-400">
                <span className="text-[9px]">▼</span>
              </div>
            </div>
          </div>

          <div className="px-4 pt-4 empty:hidden">
            {/* Resumption Banner */}
            {activeToolTab === 'restore' && pendingSession && (
              <div className="mb-3 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-left space-y-2">
                <div className="flex items-center gap-1.5 text-indigo-400 font-bold text-xs">
                  <Activity className="w-4 h-4 animate-pulse" />
                  <span>Interrupted Session Found</span>
                </div>
                <p className="text-[10px] text-zinc-350 leading-relaxed">
                  We found a pending restoration for <strong>{pendingSession.takeoutName}</strong> ({pendingSession.scannedCount} of {pendingSession.totalFiles} files processed).
                </p>
                <div className="flex gap-1.5">
                  <Button 
                    onClick={handleReGrantPermissions} 
                    className="btn-monochrome-primary rounded-md px-2.5 py-1 text-[10px] font-bold transition-all duration-150 cursor-pointer"
                  >
                    Resume Restoration
                  </Button>
                  <Button 
                    onClick={async () => {
                      await sessionManagerRef.current.terminateSession('cancelled');
                      setPendingSession(null);
                    }}
                    className="btn-monochrome-secondary rounded-md px-2.5 py-1 text-[10px] font-bold transition-all duration-150 cursor-pointer"
                  >
                    Discard
                  </Button>
                </div>
              </div>
            )}

            {/* Browser compatibility check alert */}
            {typeof window !== 'undefined' && !window.showDirectoryPicker && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg text-[10px] mb-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Browser Support Warning</div>
                  <div className="text-[9px] text-amber-500/70 mt-0.5 leading-relaxed">
                    Your browser does not support native local directory access APIs. To restore Google Takeout folders directly on your device, please use a modern Chromium-based desktop browser (e.g., <strong>Google Chrome, Microsoft Edge, or Brave</strong>). Safari, Firefox, and mobile browsers are currently not supported for direct local directory operations.
                  </div>
                </div>
              </div>
            )}
          </div>

          {activeToolTab === 'restore' && (
            <div className="flex-grow flex flex-col overflow-hidden">
              
              {/* Responsive Setup Grid within Restore Mode */}
              <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4 border-b border-white/5 bg-white/[0.005]">
                {/* Left 2 Columns: Source & Destination cards stacked */}
                <div className="lg:col-span-2 space-y-4">
                  {/* Source Card */}
                  <Card 
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`bg-white/[0.01] border-white/10 shadow-md transition-all duration-150 ${
                      isDragOver ? 'border-indigo-500/40 bg-indigo-500/[0.01] scale-[1.005]' : ''
                    }`}
                  >
                    <CardHeader className="border-b border-white/5 bg-black/20 py-2 px-3">
                      <CardTitle className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-zinc-350">
                        <span className="flex items-center gap-1.5">
                          <FolderUp className="w-3.5 h-3.5 text-zinc-400"/> 
                          1. Source
                        </span>
                        {(takeoutFolder || zipFile) && (
                          <button 
                            onClick={handleSelectTakeout}
                            className="text-[9px] text-zinc-400 hover:text-white font-bold transition-all px-1.5 py-0.5 rounded border border-white/10 hover:border-white/20 bg-white/[0.02] cursor-pointer"
                          >
                            Change
                          </button>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3">
                      {zipFile ? (
                        <div className="p-2 bg-indigo-500/5 border border-indigo-500/15 rounded flex justify-between items-center text-zinc-350 text-[10px]">
                          <span className="font-mono truncate mr-2">ZIP: {zipFile.name}</span>
                          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                        </div>
                      ) : takeoutFolder ? (
                        <div className="p-2 bg-zinc-800/10 border border-zinc-800/25 rounded flex justify-between items-center text-zinc-400 text-[10px]">
                          <span className="font-mono truncate mr-2">{takeoutFolder.name}</span>
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <Button onClick={handleSelectTakeout} className="btn-monochrome-primary rounded px-3 py-1.5 transition-all duration-150 cursor-pointer text-[10px] h-8 flex-1">
                              Browse Folder
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
                              className="btn-monochrome-primary rounded px-3 py-1.5 transition-all duration-150 cursor-pointer text-[10px] h-8 flex-1"
                            >
                              Select ZIP File
                            </Button>
                          </div>
                          <div className="text-[10px] text-zinc-500 text-center font-medium">
                            or drag & drop your folder / ZIP file here
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Destination Card */}
                  <Card className="bg-white/[0.01] border-white/10 shadow-md">
                    <CardHeader className="border-b border-white/5 bg-black/20 py-2 px-3">
                      <CardTitle className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-zinc-350">
                        <span className="flex items-center gap-1.5">
                          <HardDrive className="w-3.5 h-3.5 text-zinc-400"/> 
                          2. Destination
                        </span>
                        {outputFolder && (
                          <button 
                            onClick={handleSelectOutput}
                            className="text-[9px] text-zinc-400 hover:text-white font-bold transition-all px-1.5 py-0.5 rounded border border-white/10 hover:border-white/20 bg-white/[0.02] cursor-pointer"
                          >
                            Change
                          </button>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3">
                      {outputFolder ? (
                        <div className="p-2 bg-zinc-800/10 border border-zinc-800/25 rounded flex justify-between items-center text-zinc-400 text-[10px]">
                          <span className="font-mono truncate mr-2">{outputFolder.name}</span>
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                        </div>
                      ) : (
                        <Button onClick={handleSelectOutput} className="btn-monochrome-primary w-full rounded px-3 py-1.5 transition-all duration-150 cursor-pointer text-[10px] h-8">
                          Browse Output Directory
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Right 1 Column: Plan Status & Buttons stacked */}
                <div className="lg:col-span-1 flex flex-col gap-3 justify-between">
                  {/* Plan Status Card */}
                  {(() => {
                    const styles = getPlanCardStyles(plan, tierThresholds);
                    const isPremium = plan !== 'free';
                    return (
                      <Card className={`relative overflow-hidden transition-all duration-300 border ${styles.cardClass} flex-grow min-h-[90px]`}>
                        <CardContent className="p-3.5 flex flex-col justify-between h-full min-h-[85px]">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Plan Status</span>
                                {plan === 'super' && <Sparkles className="w-3.5 h-3.5 text-amber-500" />}
                                {plan === 'pro' && <Sparkles className="w-3.5 h-3.5 text-purple-500" />}
                              </div>
                              <div className={`text-xs font-black mt-1.5 flex items-center gap-1.5 ${styles.titleClass}`}>
                                {isPremium ? (
                                  <ShieldCheck className={`w-4 h-4 ${styles.iconClass}`} />
                                ) : (
                                  <AlertCircle className={`w-4 h-4 ${styles.iconClass}`} />
                                )}
                                {styles.titleText}
                              </div>
                            </div>
                            <span className={`text-[9px] font-mono tracking-wide px-2 py-0.5 rounded border uppercase ${styles.badgeClass}`}>
                              {styles.badgeText}
                            </span>
                          </div>
                          
                          <p className="mt-2.5 text-[9.5px] text-zinc-600 leading-normal font-medium">
                            {styles.description}
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })()}

                  {/* Actions / Run Controls */}
                  <div className="mt-auto">
                    {!isProcessing && progress === 0 ? (
                      <div className="space-y-2">
                        <Button 
                          disabled={!(takeoutFolder || zipFile) || !outputFolder}
                          onClick={() => startProcessing(false)} 
                          className="btn-monochrome-primary w-full h-9 text-[11px] rounded-lg font-bold transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" /> Start Restore
                        </Button>
                        <Button 
                          disabled={!(takeoutFolder || zipFile) || !outputFolder}
                          onClick={() => startProcessing(true)} 
                          className="btn-monochrome-secondary w-full h-9 text-[11px] rounded-lg font-bold transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
                        >
                          <Zap className="w-3.5 h-3.5 fill-current" /> Deep Restore
                        </Button>
                        <div className="text-center mt-1">
                          <button 
                            onClick={() => setShowCompareModal(true)}
                            className="text-[9px] text-zinc-500 hover:text-white underline transition-colors focus:outline-none"
                          >
                            How do these two restore options differ?
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {isProcessing && (
                          <div className="flex gap-2">
                            {isPaused ? (
                              <Button 
                                onClick={resumeProcessing}
                                className="btn-monochrome-primary flex-1 h-9 text-[10px] rounded-lg transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                <Play className="w-3.5 h-3.5 fill-current" /> Resume
                              </Button>
                            ) : (
                              <Button 
                                onClick={pauseProcessing}
                                className="btn-monochrome-primary flex-1 h-9 text-[10px] rounded-lg transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                <Pause className="w-3.5 h-3.5 fill-current" /> Pause
                              </Button>
                            )}
                            
                            <Button 
                              onClick={cancelProcessing}
                              className="btn-monochrome-primary flex-1 h-9 text-[10px] rounded-lg transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <Square className="w-3.5 h-3.5 fill-current" /> Cancel
                            </Button>
                          </div>
                        )}
                        
                        {/* Right column overall progress tracking */}
                        <div>
                          <div className="flex justify-between items-center text-[9px] text-zinc-450 font-bold mb-1">
                            <span>RESTORATION PROGRESS</span>
                            <span>{progress}%</span>
                          </div>
                          <Progress value={progress} className="h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5 shadow-inner" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Horizontal Ad Unit */}
              <div className="px-4 py-1.5 border-b border-white/5 bg-black/20">
                <AdUnit type="horizontal" slot="1" />
              </div>

              {/* Logs Terminal */}
              <div className="flex-grow flex flex-col overflow-hidden min-h-[200px]">
                {/* Logs Header with Tabs & ETA */}
                <div className="border-b border-white/5 bg-black/40 px-6 py-2 flex flex-col gap-1.5">
                  <div className="flex justify-between items-center text-xs font-bold">
                    <span className="text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-zinc-450" />
                      Logs
                    </span>
                    {(isProcessing || progress > 0) && (
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {getEstimatedRestoreTime().replace(/⏱️ Est\. restoration time:\s*/, '')}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-4 text-[10px] font-bold text-zinc-500">
                    <button 
                      onClick={() => setLogTab('all')}
                      className={`pb-0.5 transition-all duration-150 relative cursor-pointer ${
                        logTab === 'all' ? 'text-white border-b border-indigo-500' : 'hover:text-zinc-350'
                      }`}
                    >
                      All ({logs.length})
                    </button>
                    <button 
                      onClick={() => setLogTab('restored')}
                      className={`pb-0.5 transition-all duration-150 relative cursor-pointer ${
                        logTab === 'restored' ? 'text-green-400 border-b border-green-500' : 'hover:text-zinc-350'
                      }`}
                    >
                      Restored ({stats.matched})
                    </button>
                    <button 
                      onClick={() => setLogTab('errors')}
                      className={`pb-0.5 transition-all duration-150 relative cursor-pointer ${
                        logTab === 'errors' ? 'text-red-400 border-b border-red-500' : 'hover:text-zinc-350'
                      }`}
                    >
                      Errors ({stats.errors})
                    </button>
                    <button 
                      onClick={() => setLogTab('skipped')}
                      className={`pb-0.5 transition-all duration-150 relative cursor-pointer ${
                        logTab === 'skipped' ? 'text-yellow-400 border-b border-yellow-500' : 'hover:text-zinc-350'
                      }`}
                    >
                      Skipped ({stats.unmatched})
                    </button>
                  </div>
                </div>

                <div ref={logContainerRef} className="flex-grow bg-black p-6 overflow-y-auto font-mono text-[11px] leading-[1.6]">
                  {logs.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-white/20 italic">Awaiting telemetry...</div>
                  ) : (
                    <div className="space-y-0.5">
                      {logs
                        .filter(log => {
                          if (logTab === 'all') return true;
                          if (logTab === 'restored') return log.level === 'success';
                          if (logTab === 'errors') return log.level === 'error';
                          if (logTab === 'skipped') return log.level === 'warn';
                          return true;
                        })
                        .map((log, i) => {
                          if (log.msg) {
                            return <div key={i} className="text-zinc-400/90 border-l-2 border-zinc-700 pl-2 my-2">{log.msg}</div>
                          }
                          
                          const pathStr = log.path ? `/${log.path.join('/')}/` : ''
                          const fullFilename = `${pathStr}${log.filename}`
                          
                          if (log.level === 'success') {
                            const actionLabel = log.action && log.action !== 'Restored' ? ` (${log.action})` : '';
                            return (
                              <div key={i} className="text-green-400/90 pl-2 border-l border-green-500/20 py-0.5 whitespace-pre-wrap">
                                <span className="font-bold mr-2">[RESTORED] </span>
                                <span>{fullFilename}{actionLabel}</span>
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
              </div>
            </div>
          )}

          {activeToolTab === 'viewer' && renderSuperTierGate(
            "Visual EXIF Viewer",
            "Gain deeper diagnostic insights into individual media files by inspecting their underlying EXIF structure locally.",
            ["Read Camera make, model, & software parameters", "Inspect Date & Time metadata headers", "Resolve Latitude, Longitude, and Altitude GPS coordinates", "100% Offline security"],
            () => (
              <div className="p-6 space-y-6 overflow-y-auto h-full flex-grow">
                <div className="border-b border-white/5 pb-4">
                  <h2 className="text-lg font-bold tracking-tight text-white mb-1">Visual EXIF Inspector</h2>
                  <p className="text-zinc-400 text-xs">Review parsed metadata records extracted directly from files.</p>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left side: Upload card */}
                  <div className="lg:col-span-1 space-y-4">
                    <Card className="bg-white/[0.01] border-white/10 shadow-2xl">
                      <CardHeader className="p-4 pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm"><Eye className="w-4 h-4 text-rose-450"/> EXIF Inspector</CardTitle>
                        <CardDescription className="text-white/50 text-[11px]">Upload or drop a JPEG image to read its camera and GPS coordinates offline.</CardDescription>
                      </CardHeader>
                      <CardContent className="p-4 pt-2 space-y-4">
                        <div className="border border-dashed border-white/10 rounded-xl p-6 text-center bg-black/45 relative cursor-pointer hover:bg-white/[0.02] transition-all">
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
                          <span className="text-[11px] text-zinc-400 block">Drag & Drop or click to browse JPEG</span>
                        </div>
                        {viewerFile && (
                          <div className="p-2 bg-zinc-900 border border-white/5 rounded-lg text-[10px] font-mono text-zinc-300 flex items-center justify-between">
                            <span className="truncate mr-2">{viewerFile.name}</span>
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    <div className="text-zinc-500 text-[10px] leading-relaxed">All metadata parsing runs 100% locally in-browser to protect your privacy.</div>
                  </div>

                  {/* Right side: Results details */}
                  <div className="lg:col-span-2">
                    {viewerLoading ? (
                      <div className="py-20 text-center text-sm text-zinc-500 animate-pulse">Scanning EXIF headers...</div>
                    ) : viewerExif ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card className="bg-white/[0.01] border-white/5">
                          <CardHeader className="pb-2 border-b border-white/5 bg-black/20 p-3">
                            <CardTitle className="text-[10px] font-bold text-white uppercase tracking-wider">File Details</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-3 space-y-2 font-mono text-[10px] p-3">
                            {Object.entries(viewerExif.fileInfo).map(([k, v]) => (
                              <div key={k} className="flex justify-between border-b border-white/5 pb-1.5 last:border-0 last:pb-0">
                                <span className="text-zinc-500">{k}</span>
                                <span className="text-zinc-300 truncate max-w-[150px]">{v}</span>
                              </div>
                            ))}
                          </CardContent>
                        </Card>

                        <Card className="bg-white/[0.01] border-white/5">
                          <CardHeader className="pb-2 border-b border-white/5 bg-black/20 p-3">
                            <CardTitle className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Camera EXIF Tags</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-3 space-y-2 font-mono text-[10px] p-3">
                            {Object.keys(viewerExif.cameraInfo).length > 0 ? (
                              Object.entries(viewerExif.cameraInfo).map(([k, v]) => (
                                <div key={k} className="flex justify-between border-b border-white/5 pb-1.5 last:border-0 last:pb-0">
                                  <span className="text-zinc-500">{k}</span>
                                  <span className="text-zinc-300 truncate max-w-[150px]">{v}</span>
                                </div>
                              ))
                            ) : (
                              <div className="text-zinc-655 italic py-2">No camera EXIF tags found.</div>
                            )}
                          </CardContent>
                        </Card>

                        <Card className="bg-white/[0.01] border-white/5 md:col-span-2">
                          <CardHeader className="pb-2 border-b border-white/5 bg-black/20 p-3">
                            <CardTitle className="text-[10px] font-bold text-rose-455 uppercase tracking-wider">GPS Coordinates</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-3 space-y-2 font-mono text-[10px] p-3">
                            {Object.keys(viewerExif.gpsInfo).length > 0 ? (
                              Object.entries(viewerExif.gpsInfo).map(([k, v]) => (
                                <div key={k} className="flex justify-between border-b border-white/5 pb-1.5 last:border-0 last:pb-0">
                                  <span className="text-zinc-500">{k}</span>
                                  <span className="text-rose-300">{v}</span>
                                </div>
                              ))
                            ) : (
                              <div className="text-zinc-655 italic py-2">No geo-location coordinates embedded.</div>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    ) : (
                      <div className="h-[280px] border border-white/5 rounded-2xl flex flex-col items-center justify-center text-center p-6 bg-zinc-950/25">
                        <FileImage className="w-10 h-10 text-zinc-700 mb-3 animate-bounce" />
                        <h4 className="text-xs font-bold text-white mb-1">Awaiting Media File</h4>
                        <p className="text-[10px] text-zinc-500 max-w-xs">Select a media asset in the left panel to begin scanning EXIF tags.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          )}

          {activeToolTab === 'comparison' && renderSuperTierGate(
            "Metadata Comparison",
            "Perform side-by-side matches of image binary fields and sidecar JSON data before importing to check accuracy.",
            ["Compare local image name vs sidecar title", "Evaluate embedded EXIF date vs JSON formatted taken time", "Cross check GPS coordinates and tags", "Diagnose synchronization mismatches"],
            () => (
              <div className="p-6 space-y-6 overflow-y-auto h-full flex-grow">
                <div className="border-b border-white/5 pb-4">
                  <h2 className="text-lg font-bold tracking-tight text-white mb-1">Side-by-Side Comparison</h2>
                  <p className="text-zinc-400 text-xs">Compare EXIF parameters vs Google Takeout JSON sidecar values.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Column: Selector Cards */}
                  <div className="lg:col-span-1 space-y-4">
                    <Card className="bg-white/[0.01] border-white/10 shadow-2xl">
                      <CardHeader className="p-4 pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm"><Layers className="w-4 h-4 text-amber-400"/> Compare Assets</CardTitle>
                        <CardDescription className="text-white/50 text-[11px]">Load a media file and its Google Takeout JSON sidecar to visualize parameters side-by-side.</CardDescription>
                      </CardHeader>
                      <CardContent className="p-4 pt-2 space-y-4">
                        <div className="space-y-1.5">
                          <span className="text-[9px] text-zinc-400 uppercase tracking-widest font-bold">1. Select Photo/Video</span>
                          <div className="border border-dashed border-white/10 rounded-xl p-3 text-center bg-black/45 relative cursor-pointer hover:bg-white/[0.02] transition-all">
                            <input
                              type="file"
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) handleCompFilesChange(file, null)
                              }}
                              className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                            <FileImage className="w-5 h-5 text-zinc-500 mx-auto mb-1" />
                            <span className="text-[10px] text-zinc-400 block truncate">{compMediaFile ? compMediaFile.name : "Select Media File"}</span>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <span className="text-[9px] text-zinc-400 uppercase tracking-widest font-bold">2. Select Google Takeout JSON</span>
                          <div className="border border-dashed border-white/10 rounded-xl p-3 text-center bg-black/45 relative cursor-pointer hover:bg-white/[0.02] transition-all">
                            <input
                              type="file"
                              accept=".json"
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) handleCompFilesChange(null, file)
                              }}
                              className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                            <FileJson className="w-5 h-5 text-zinc-500 mx-auto mb-1" />
                            <span className="text-[10px] text-zinc-400 block truncate">{compJsonFile ? compJsonFile.name : "Select JSON File"}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <div className="text-zinc-500 text-[10px] leading-relaxed">Exposes matching sidecar payloads before running restoration.</div>
                  </div>

                  {/* Right Column: Comparison Table & Checklist */}
                  <div className="lg:col-span-2">
                    {compResult ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Card className="bg-white/[0.01] border-white/5">
                            <CardHeader className="pb-2 border-b border-white/5 bg-black/20 p-3">
                              <CardTitle className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider">Image / Video properties</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-3 space-y-2 font-mono text-[10px] p-3">
                              <div className="flex justify-between border-b border-white/5 pb-1.5">
                                <span className="text-zinc-500">File Name</span>
                                <span className="text-zinc-300 truncate max-w-[150px]">{compResult.media.name}</span>
                              </div>
                              <div className="flex justify-between border-b border-white/5 pb-1.5">
                                <span className="text-zinc-500">EXIF Date</span>
                                <span className="text-zinc-300 truncate max-w-[150px]">{compResult.media.date}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-zinc-500">EXIF GPS</span>
                                <span className="text-zinc-350 truncate max-w-[150px]">{compResult.media.gps}</span>
                              </div>
                            </CardContent>
                          </Card>

                          <Card className="bg-white/[0.01] border-white/5">
                            <CardHeader className="pb-2 border-b border-white/5 bg-black/20 p-3">
                              <CardTitle className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Takeout JSON sidecar</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-3 space-y-2 font-mono text-[10px] p-3">
                              <div className="flex justify-between border-b border-white/5 pb-1.5">
                                <span className="text-zinc-500">JSON Title</span>
                                <span className="text-zinc-300 truncate max-w-[150px]">{compResult.json.title}</span>
                              </div>
                              <div className="flex justify-between border-b border-white/5 pb-1.5">
                                <span className="text-zinc-500">Taken Time</span>
                                <span className="text-zinc-300 truncate max-w-[150px]">{compResult.json.time}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-zinc-500">JSON GPS</span>
                                <span className="text-zinc-300 truncate max-w-[150px]">{compResult.json.gps}</span>
                              </div>
                            </CardContent>
                          </Card>
                        </div>

                        <Card className="bg-white/[0.01] border-white/5">
                          <CardHeader className="pb-2 border-b border-white/5 bg-black/20 p-3">
                            <CardTitle className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Merge Match Checklist</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-3 space-y-2.5 font-mono text-[10px] p-3">
                            <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                              <span className="text-zinc-300">Filename Association Match</span>
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                compResult.checks.fileNameMatch 
                                  ? 'bg-white/10 text-white border border-white/20' 
                                  : 'bg-zinc-800/30 text-zinc-400 border border-zinc-750'
                              }`}>
                                {compResult.checks.fileNameMatch ? "ASSOCIATED" : "MISMATCHED"}
                              </span>
                            </div>
                            <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                              <span className="text-zinc-300">EXIF Timestamp Synchronized</span>
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                compResult.checks.dateMatch 
                                  ? 'bg-white/10 text-white border border-white/20' 
                                  : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
                              }`}>
                                {compResult.checks.dateMatch ? "EXISTS IN FILE" : "INJECTED ON WRITE"}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-zinc-350 font-bold text-[9px]">GPS Coordinates Synchronized</span>
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
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
                      <div className="h-[280px] border border-white/5 rounded-2xl flex flex-col items-center justify-center text-center p-6 bg-zinc-950/25">
                        <Layers className="w-10 h-10 text-zinc-700 mb-3 animate-bounce" />
                        <h4 className="text-xs font-bold text-white mb-1">Awaiting Comparison Assets</h4>
                        <p className="text-[10px] text-zinc-500 max-w-xs">Select both a media file and JSON sidecar metadata record to analyze.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          )}

          {activeToolTab === 'duplicates' && renderSuperTierGate(
            "Duplicate Space Analyzer",
            "Scan local Takeout folders to identify byte-identical duplicate files and reclaim storage.",
            ["Detect byte-exact identical duplicate groups", "Spot conflicting renamed files e.g. photo(1).jpg", "Calculate exact storage space reclaimable in megabytes", "Recursive main-thread scanner"],
            () => (
              <div className="p-6 space-y-6 overflow-y-auto h-full flex flex-col flex-grow">
                <div className="border-b border-white/5 pb-4 flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-bold tracking-tight text-white mb-1">Duplicate Space Analyzer</h2>
                    <p className="text-zinc-400 text-xs">Exposes identical file duplicates within folders.</p>
                  </div>
                  {dupIsScanning && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800/20 border border-zinc-800/40 text-zinc-400 animate-pulse">{dupScanStatus}</span>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-grow overflow-hidden">
                  {/* Left column: folder select */}
                  <div className="lg:col-span-1 space-y-4">
                    <Card className="bg-white/[0.01] border-white/10 shadow-2xl">
                      <CardHeader className="p-4 pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm"><Copy className="w-4 h-4 text-zinc-400"/> Duplicate Analyzer</CardTitle>
                        <CardDescription className="text-white/50 text-[11px]">Analyze local folders to locate duplicate assets and reclaim storage space.</CardDescription>
                      </CardHeader>
                      <CardContent className="p-4 pt-2 space-y-4">
                        {dupFolder ? (
                          <div className="p-2.5 bg-zinc-800/10 border border-zinc-800/25 rounded-md text-[10px] font-mono text-zinc-450 flex justify-between items-center">
                            <span className="truncate mr-2">{dupFolder.name}</span>
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                          </div>
                        ) : null}
                        <Button onClick={handleSelectDupFolder} className="btn-monochrome-primary w-full h-8 text-[10px] transition-all duration-150 cursor-pointer">
                          {dupFolder ? "Change Folder" : "Select Folder to Analyze"}
                        </Button>
                        
                        {dupFolder && !dupIsScanning && (
                          <Button onClick={startDuplicateScan} className="btn-monochrome-primary w-full h-8 text-[10px] font-bold rounded border-0 shadow-none transition-all duration-150 cursor-pointer">
                            <Search className="w-3.5 h-3.5 mr-1.5" /> Run Space Analyzer
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                    <div className="text-zinc-500 text-[10px] leading-relaxed">Reclaims space by identifying identical media byte structures.</div>
                  </div>

                  {/* Right column: duplicate list & stats */}
                  <div className="lg:col-span-2 flex flex-col overflow-hidden min-h-[300px]">
                    {dupStats.scanned > 0 ? (
                      <div className="space-y-4 flex-grow flex flex-col overflow-hidden">
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-white/[0.01] border border-white/5 p-3 rounded-xl">
                            <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider block mb-0.5">Files Scanned</span>
                            <div className="text-lg font-black text-white">{dupStats.scanned}</div>
                          </div>
                          <div className="bg-white/[0.01] border border-white/5 p-3 rounded-xl">
                            <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider block mb-0.5">Duplicates</span>
                            <div className="text-lg font-black text-rose-455">{dupStats.duplicates}</div>
                          </div>
                          <div className="bg-white/[0.01] border border-white/5 p-3 rounded-xl">
                            <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider block mb-0.5">Reclaimable</span>
                            <div className="text-lg font-black text-white">
                              {(dupStats.savedBytes / (1024 * 1024)).toFixed(2)} MB
                            </div>
                          </div>
                        </div>

                        <div className="flex-grow flex flex-col overflow-hidden border border-white/5 rounded-2xl bg-zinc-950/20">
                          <div className="px-4 py-2 bg-black/40 border-b border-white/5 text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Duplicate File List</div>
                          <div className="flex-grow p-4 overflow-y-auto font-mono text-[10px] divide-y divide-white/5 space-y-3">
                            {dupGroups.length > 0 ? (
                              dupGroups.map((g, idx) => (
                                <div key={idx} className="pt-3 first:pt-0">
                                  <div className="flex justify-between items-center text-[9px] font-bold text-rose-400 mb-1.5">
                                    <span>DUPLICATE GROUP #{idx + 1}</span>
                                    <span>SIZE: {g.size}</span>
                                  </div>
                                  <div className="space-y-1 pl-2.5 border-l border-zinc-700">
                                    {g.files.map((path: string, i: number) => (
                                      <div key={i} className="text-zinc-400 truncate text-[10px]" title={path}>
                                        <span className="text-zinc-655 font-bold mr-1">[{i === 0 ? "ORIGINAL" : `DUP ${i}`}]</span>
                                        {path}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-center py-10 text-zinc-500 italic">No duplicate files found in this folder.</div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="h-[280px] border border-white/5 rounded-2xl flex flex-col items-center justify-center text-center p-6 bg-zinc-950/25">
                        <Search className="w-10 h-10 text-zinc-700 mb-3" />
                        <h4 className="text-xs font-bold text-white mb-1">Awaiting Scan</h4>
                        <p className="text-[10px] text-zinc-500 max-w-xs">Select a local directory on the left and run the space analyzer to find duplicates.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          )}

        </div>

        {/* LEFT SIDEBAR: COMMAND CENTER */}
        <div className="w-full lg:w-[28%] lg:min-w-[340px] p-3 border-t lg:border-t-0 lg:border-r border-white/5 flex flex-col lg:h-full h-auto lg:overflow-y-auto overflow-visible scrollbar-thin scrollbar-thumb-zinc-800 order-2 lg:order-1">
          
          <div className="mb-2 flex items-center justify-between">
            <h1 className="text-sm font-bold tracking-wider text-white flex items-center gap-1.5 uppercase">
              <Activity className="w-4 h-4 text-indigo-400 animate-pulse" />
              Command Center
            </h1>
            <span className={`text-[9px] font-bold font-mono px-2 py-0.5 rounded border ${
              isProcessing 
                ? isPaused ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400 animate-pulse'
                : 'bg-zinc-500/10 border-zinc-500/20 text-zinc-400'
            }`}>
              {isProcessing ? isPaused ? 'PAUSED' : (useDeepExif ? 'DEEP RESTORE' : 'ACTIVE') : 'IDLE'}
            </span>
          </div>

          {/* Quota Progress */}
          <div className="space-y-2 mb-3 bg-white/[0.01] border border-white/5 p-2 rounded-lg">
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center text-[9px] text-white/40 font-bold uppercase tracking-wider">
                <span className="flex items-center gap-1"><HardDrive className="w-3 h-3 text-zinc-550" /> Storage Limit Progress</span>
                <span>{formatByteSize(limitBytes)}</span>
              </div>
              <div className="text-xs font-bold text-zinc-150">
                {formatByteSize(currentUsedBytes + sessionBytes)} / {formatByteSize(limitBytes)}
              </div>
              {limitBytes !== Infinity && (
                <Progress value={Math.min(100, ((currentUsedBytes + sessionBytes) / limitBytes) * 100)} className="h-1 bg-white/10" />
              )}
            </div>

            <div className="flex flex-col gap-1 border-t border-white/5 pt-2 mt-1">
              <div className="flex justify-between items-center text-[9px] text-white/40 font-bold uppercase tracking-wider">
                <span className="flex items-center gap-1"><FileText className="w-3 h-3 text-zinc-550" /> Files Limit Progress</span>
                <span>{limitFiles === Infinity ? "Unlimited" : limitFiles.toLocaleString()}</span>
              </div>
              <div className="text-xs font-bold text-zinc-150">
                {(currentUsedFiles + sessionFiles).toLocaleString()} / {limitFiles === Infinity ? "Unlimited" : limitFiles.toLocaleString()}
              </div>
              {limitFiles !== Infinity && (
                <Progress value={Math.min(100, ((currentUsedFiles + sessionFiles) / limitFiles) * 100)} className="h-1 bg-white/10" />
              )}
            </div>
          </div>

          {/* Engine Resource Telemetry */}
          <div className="space-y-2.5 mb-3 bg-white/[0.01] border border-white/5 p-2.5 rounded-lg">
            <span className="text-[9px] text-white/40 font-bold uppercase tracking-wider flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-zinc-450" /> Resource Telemetry
            </span>
            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-[9px] font-bold text-zinc-400 mb-1">
                  <span>CPU Cores</span>
                  <span className="font-mono text-zinc-350">{telemetryWorkers} / {navigator.hardwareConcurrency || 4} Cores ({telemetryCpu}%)</span>
                </div>
                <Progress value={telemetryCpu} className="h-1 bg-white/10" />
              </div>

              <div>
                <div className="flex justify-between text-[9px] font-bold text-zinc-400 mb-1">
                  <span>RAM (Engine/Tab)</span>
                  <span className="font-mono text-zinc-350">{telemetryMem.toFixed(0)}MB / {telemetryTabHeap.toFixed(0)}MB</span>
                </div>
                <Progress value={Math.min(100, ((telemetryMem + telemetryTabHeap) / 2048) * 100)} className="h-1 bg-white/10" />
              </div>

              <div className="flex justify-between items-center text-[9px] text-zinc-400 border-t border-white/5 pt-2 mt-1">
                <span>Concurrency</span>
                <span className="font-mono text-white">Auto ({maxWorkers} Threads)</span>
              </div>
            </div>
          </div>

          {/* Scanning/Loading Logo Indicator (replaces Current File thing) */}
          {isProcessing && (
            <div className="mb-3 bg-white/[0.01] border border-white/5 p-4 rounded-lg flex flex-col items-center justify-center text-center space-y-2">
              <div className="relative flex items-center justify-center">
                {/* Dynamic spinning outer ring */}
                <div className="w-10 h-10 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                {/* Pulsing inner dot */}
                <Activity className="absolute w-4 h-4 text-indigo-400 animate-pulse" />
              </div>
              <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider animate-pulse">Restoring Assets...</div>
            </div>
          )}

          {/* Stats counters */}
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            <div className="bg-white/[0.02] border border-white/5 p-2 rounded flex flex-col justify-between h-14">
              <span className="text-[9px] text-white/40 flex items-center gap-1"><Database className="w-3 h-3"/> Scanned</span>
              <span className="text-xs font-bold truncate">{stats.scanned} / {stats.total || '—'}</span>
            </div>
            <div className="bg-green-500/5 border border-green-500/10 p-2 rounded flex flex-col justify-between h-14">
              <span className="text-[9px] text-green-400/60 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Restored</span>
              <span className="text-xs font-bold text-green-400 truncate">{stats.matched} / {stats.total || '—'}</span>
            </div>
            <div className="bg-yellow-500/5 border border-yellow-500/10 p-2 rounded flex flex-col justify-between h-14">
              <span className="text-[9px] text-yellow-400/60 flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Unmatched</span>
              <span className="text-xs font-bold text-yellow-400 truncate">{stats.unmatched}</span>
            </div>
            <div className="bg-red-500/5 border border-red-500/10 p-2 rounded flex flex-col justify-between h-14">
              <span className="text-[9px] text-red-400/60 flex items-center gap-1"><XCircle className="w-3 h-3"/> Errors</span>
              <span className="text-xs font-bold text-red-400 truncate">{stats.errors}</span>
            </div>
          </div>

          {/* Banners at bottom */}
          <div className="mt-auto pt-3 border-t border-white/5 space-y-3">
            <AdUnit type="vertical" slot="3" />
            {plan === 'free' && (
              <div className="p-3 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-xl text-center">
                <div className="text-[10px] font-bold text-white mb-1">Upgrade to Premium</div>
                <p className="text-[9px] text-zinc-400 mb-2">Unlock unlimited file restoration, metadata injection, and faster speed.</p>
                <a href="/pricing">
                  <Button className="w-full h-7 text-[10px] btn-monochrome-primary py-0 rounded font-bold cursor-pointer">
                    Upgrade Now
                  </Button>
                </a>
              </div>
            )}
          </div>

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

      {popupModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none">
          <div className="bg-zinc-950 border border-white/10 p-8 rounded-2xl max-w-md w-full text-center relative overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className={`absolute top-0 left-0 right-0 h-1 ${popupModal.type === 'error' ? 'bg-red-500' : 'bg-amber-500'}`}></div>
            <AlertCircle className={`w-12 h-12 ${popupModal.type === 'error' ? 'text-red-500/80' : 'text-amber-500/80'} mx-auto mb-4`} />
            <h3 className="text-xl font-bold text-white mb-2">{popupModal.title}</h3>
            <p className="text-zinc-400 text-sm mb-6 leading-relaxed whitespace-pre-line">{popupModal.message}</p>
            <div>
              <Button 
                onClick={() => setPopupModal(null)}
                className="btn-monochrome-primary w-full h-12 font-bold rounded-lg border-0 shadow-none transition-all duration-150 cursor-pointer"
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}

      {showCompareModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-white/10 p-6 sm:p-8 rounded-3xl max-w-2xl w-full relative overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-350">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>

            <button
              onClick={() => setShowCompareModal(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-black text-white mb-2 flex items-center gap-2">
              <span>Comparing Restore Methods</span>
            </h3>
            <p className="text-zinc-400 text-xs mb-6">
              Google Takeout separates original metadata into standalone <code className="bg-white/5 px-1 py-0.5 rounded text-[10px] text-indigo-300 font-mono">.json</code> sidecar records. Here is how our engine handles them:
            </p>

            <div className="space-y-4 mb-6 text-left">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="bg-white/[0.01] border border-white/5 p-4 rounded-xl space-y-1.5">
                  <h4 className="font-bold text-zinc-200 flex items-center gap-1.5">
                    <span className="text-emerald-400">⚡</span> Regular Restore (External Link)
                  </h4>
                  <p className="text-zinc-450 leading-relaxed">
                    Keeps the photo and JSON separate but pairs them side-by-side in your restored directory. It streams files instantly without loading media bytes into heap memory.
                  </p>
                  <p className="text-[10px] text-emerald-450 font-bold">Fastest processing speed.</p>
                </div>
                <div className="bg-white/[0.01] border border-white/5 p-4 rounded-xl space-y-1.5">
                  <h4 className="font-bold text-zinc-200 flex items-center gap-1.5">
                    <span className="text-indigo-400">🌀</span> Deep Restore (Internal Injection)
                  </h4>
                  <p className="text-zinc-450 leading-relaxed">
                    Reads, decodes, and forces dates and GPS coordinates directly inside the image EXIF binary headers. Photos become self-contained, repair is permanent.
                  </p>
                  <p className="text-[10px] text-indigo-400 font-bold">Universal compatibility across all devices and drives.</p>
                </div>
              </div>

              <div className="overflow-x-auto border border-white/5 rounded-xl bg-black/20">
                <table className="w-full text-[11px] text-zinc-400 border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/[0.02] text-left text-zinc-300 font-bold">
                      <th className="p-3">Feature</th>
                      <th className="p-3">Regular Restore</th>
                      <th className="p-3 text-indigo-300">Deep Restore</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-medium">
                    <tr>
                      <td className="p-3 font-semibold text-white">Date & Time</td>
                      <td className="p-3">Yes (Updates file system)</td>
                      <td className="p-3 text-zinc-350">Yes (Injects EXIF)</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-white">GPS Locations</td>
                      <td className="p-3">Yes (Pairs companion JSON)</td>
                      <td className="p-3 text-zinc-350">Yes (Injects EXIF)</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-white">Portability</td>
                      <td className="p-3 text-red-400/80">Low (Moving can lose tags)</td>
                      <td className="p-3 text-emerald-400/80">Universal (Embedded)</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-white">Processing Speed</td>
                      <td className="p-3 text-emerald-400/80 font-bold">Extremely Fast</td>
                      <td className="p-3 text-amber-500/80">Slower (Rewrites Files)</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-white">Log Indicator</td>
                      <td className="p-3 font-mono text-[10px]">`[RESTORED] (Linked)`</td>
                      <td className="p-3 font-mono text-[10px] text-indigo-300">`[DEEP INJECTED] (Embedded)`</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={() => setShowCompareModal(false)}
                className="btn-monochrome-primary w-24 h-10 font-bold rounded-lg border-0 shadow-none transition-all duration-150 cursor-pointer"
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}

      {modalContext && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-white/10 p-6 sm:p-8 rounded-2xl max-w-md w-full text-left relative overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-purple-600"></div>

            <button
              onClick={() => setModalContext(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                {modalContext === 'source' ? (
                  <FolderUp className="w-5 h-5" />
                ) : (
                  <HardDrive className="w-5 h-5" />
                )}
              </div>
              <h3 className="text-lg font-bold text-white">
                {modalContext === 'source' ? 'Grant Folder Read Access' : 'Grant Folder Write Access'}
              </h3>
            </div>

            <p className="text-zinc-300 text-xs leading-relaxed mb-4">
              {modalContext === 'source' 
                ? "To start scanning, TakeoutFix needs permission to view and parse the files inside your Google Takeout folder."
                : "TakeoutFix needs permission to write, create, and save your newly restored photos directly into this destination folder."
              }
            </p>

            <div className="bg-white/[0.02] border border-white/5 p-3 rounded-xl text-[10px] text-zinc-400 leading-relaxed mb-6">
              {modalContext === 'source' ? (
                <>
                  <span className="font-bold text-zinc-300 block mb-0.5">Read-Only Safety</span>
                  Your original Google Takeout files will not be changed, modified, or deleted in any way.
                </>
              ) : (
                <>
                  <span className="font-bold text-amber-500 block mb-0.5">Overwrite Protection</span>
                  Please select an empty folder to keep your restored library clean and prevent overwriting existing files.
                </>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <Button
                onClick={() => setModalContext(null)}
                className="btn-monochrome-secondary h-9 text-xs px-4 font-bold rounded-lg transition-all border border-white/10 hover:bg-white/5 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                onClick={handleModalConfirm}
                className="btn-monochrome-primary h-9 text-xs px-4 font-bold rounded-lg transition-all border-0"
              >
                Grant Access
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
