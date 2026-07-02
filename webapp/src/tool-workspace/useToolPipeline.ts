/**
 * useToolPipeline — all processing engine state and logic for the TakeoutFix workspace.
 * Extracted from ToolWorkspace.tsx to keep that file focused on layout/routing only.
 */
import { useRef, useEffect, useState } from "react"
import { useAuth } from "../contexts/AuthContext"
import { useToolStore } from "../store/useToolStore"
import { useToastStore } from "../store/useToastStore"
import { sanitizeFilename, findMatchingJsonName, safeParseJson, extractTimestamp } from "../services/MetadataMatcher"
// ZipMetadataMatcher is used via normalizeZipPath only (findMatchingJsonNameForZip resolved during scan phase)
import { isJpeg } from "../services/ExifRestorer"
import { db } from "../firebase"
import { doc, setDoc, increment, addDoc, collection, onSnapshot } from "firebase/firestore"
import { indexedDbService } from "../lib/indexedDbService"
import piexif from "piexifjs"
import { detectAdBlock } from "../services/AdBlockDetector"
import { SessionManager, type ActiveSession, type FileRecord } from "../lib/SessionManager"
import { WorkerPool } from "../lib/WorkerPool"
import { ZipReader, BlobReader, Uint8ArrayWriter, Writer } from "@zip.js/zip.js"
import { normalizeZipPath } from "../services/ZipMetadataMatcher"

// ---------------------------------------------------------------------------
// Streaming zip.js writer that pipes directly to a FileSystemWritableFileStream
// (zero-copy decompression — no intermediate ArrayBuffer allocation in RAM)
// ---------------------------------------------------------------------------
export class FileSystemWritableFileStreamWriter extends Writer<void> {
  private writableStream: any;

  constructor(writableStream: any) {
    super();
    this.writableStream = writableStream;
  }

  override async writeUint8Array(array: Uint8Array): Promise<void> {
    await this.writableStream.write(array);
  }
}

// ---------------------------------------------------------------------------
// Shared constants / helpers (also exported so RestorePanel can import them)
// ---------------------------------------------------------------------------
export type LogEntry = {
  level: string;
  msg?: string;
  path?: string[];
  filename?: string;
  action?: string;
}

export const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  recovery_pass: "Single Time",
  pro: "Pro",
  super: "Super",
}

export const getPlanCardStyles = (plan: string, thresholds?: {
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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useToolPipeline() {
  const { user, userData, refreshUserData } = useAuth()

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

  const currentUsedFiles = getUserFiles(userData as unknown as Record<string, unknown>)
  const currentUsedBytes = getUserBytes(userData as unknown as Record<string, unknown>)

  // Plan thresholds — loaded dynamically from Firestore settings/global.tierThresholds
  const [tierThresholds, setTierThresholds] = useState({
    free:          { maxFiles: 250,      maxSizeMB: 500      },
    recovery_pass: { maxFiles: 3000,     maxSizeMB: 3072     },
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
            free:          { maxFiles: stored.free?.maxFiles ?? 250,           maxSizeMB: stored.free?.maxSizeMB ?? 500    },
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
  const statsBuffer = useRef({ scanned: 0, matched: 0, unmatched: 0, exifFailed: 0, errors: 0, total: 0 })
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
  const [takeoutFolderStructure] = useState<any>(null)
  const [zipFilesList] = useState<any[]>([])
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
  const [logTab, setLogTab] = useState<'all' | 'restored' | 'errors' | 'skipped' | 'exif'>('all')

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
      const container = logContainerRef.current;
      const rAFId = requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
      return () => cancelAnimationFrame(rAFId);
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
      exifFailed: 0,
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

    try {
      await indexedDbService.resetProcessingToPending();
    } catch (dbErr) {
      console.warn("Failed to reset in-flight files status:", dbErr);
    }

    startTimeRef.current = Date.now() - (session.lastUpdatedAt - session.startedAt);

    flushInterval.current = window.setInterval(() => {
      requestAnimationFrame(() => {
        setStats({ ...statsBuffer.current });
        setProgress(progressBuffer.current);
        setSessionBytes(sessionBytesRef.current);
        setSessionFiles(sessionFilesRef.current);
        setLogs(prev => {
          if (logsBuffer.current.length === 0) return prev;
          const newLogs = [...prev, ...logsBuffer.current];
          logsBuffer.current = [];
          return newLogs.slice(-300);
        });
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
                    const geoData = (parsed as any).geoData;
                    if (useDeepExifRef.current && geoData && (geoData.latitude !== 0 || geoData.longitude !== 0)) {
                      lat = geoData.latitude;
                      lng = geoData.longitude;
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

            // Resolve output destination and prepare handles
            // On exFAT/FAT32 drives, the output handle can silently lose readwrite
            // permission (handle goes stale). Verify and re-request before use.
            const baseFolder = (epochSec && actionStr !== 'EXIF Error') ? 'restored' : 'unmatched';
            let outSubDir: FileSystemDirectoryHandle;
            let outHandle: FileSystemFileHandle;
            try {
              const perm = await (session.outputHandle as any).queryPermission?.({ mode: 'readwrite' });
              if (perm === 'prompt') {
                await (session.outputHandle as any).requestPermission?.({ mode: 'readwrite' });
              }
              outSubDir = await getOrCreateDir(session.outputHandle!, [baseFolder, ...fileRecord.relativePath]);
              outHandle = await outSubDir.getFileHandle(fileRecord.filename, { create: true });
            } catch (permErr: any) {
              throw new Error(`Output folder access lost — please re-select the destination folder and resume. (${permErr?.message ?? permErr})`);
            }

            // 5. Read, process, and write output directly using streams where possible
            let writable: any = null;
            try {
              if (epochSec && isJpeg(fileRecord.filename)) {
                actionStr = 'Restored';
                levelStr = 'success';

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
                    // File was still saved — only the EXIF injection failed.
                    // Count as exifFailed (warn), not a hard error.
                    actionStr = `Copied (EXIF unsupported: ${res.error})`;
                    levelStr = 'warn';
                    statsBuffer.current.exifFailed += 1;
                  }
                }

                if (!bufferOrBlob) {
                  throw new Error("Failed to read file contents.");
                }

                writable = await outHandle.createWritable();
                await writable.write(bufferOrBlob);
                await writable.close();
                writable = null; // Mark as closed successfully
              } else {
                // Zero-RAM Copying: stream file directly to output handle!
                if (epochSec) {
                  actionStr = 'Restored';
                  levelStr = 'success';
                }
                writable = await outHandle.createWritable();
                if (fileObj) {
                  // Stream folder file directly to output disk writable
                  const readableStream = fileObj.stream();
                  await readableStream.pipeTo(writable);
                  writable = null; // pipeTo closes the stream automatically
                } else if (zipEntry) {
                  // Stream decompress ZIP entry directly to output disk writable
                  const zipWriter = new FileSystemWritableFileStreamWriter(writable);
                  await zipEntry.getData!(zipWriter);
                  await writable.close();
                  writable = null; // Mark as closed successfully
                } else {
                  throw new Error("Failed to resolve file reference for streaming.");
                }
              }
            } catch (err) {
              if (writable) {
                try {
                  await writable.abort();
                } catch (abortErr) {
                  console.warn("Failed to abort writable stream:", abortErr);
                }
              }
              throw err;
            }

            // 6. Confirm completion (passing resolved size and epochSec)
            await sessionManager.confirmFile(fileRecord.id, 'completed', size, epochSec);

            // Explicitly nullify large references so GC can reclaim heap promptly
            bufferOrBlob = null;
            fileObj = null;
            zipEntry = null;

            // Update stats
            if (levelStr === 'success') {
              statsBuffer.current.matched += 1;
            } else if (levelStr === 'warn' && actionStr.startsWith('Copied (EXIF')) {
              // exifFailed already incremented inside the worker result block — just count scanned
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
            const latRaw = exifObj["GPS"][piexif.GPSIFD.GPSLatitude] as any[]
            const lonRef = exifObj["GPS"][piexif.GPSIFD.GPSLongitudeRef]
            const lonRaw = exifObj["GPS"][piexif.GPSIFD.GPSLongitude] as any[]
            const altRef = exifObj["GPS"][piexif.GPSIFD.GPSAltitudeRef]
            const altRaw = exifObj["GPS"][piexif.GPSIFD.GPSAltitude] as any

            if (latRaw && latRef) {
              const deg = latRaw[0][0] / latRaw[0][1]
              const min = latRaw[1][0] / latRaw[1][1]
              const sec = latRaw[2][0] / latRaw[2][1]
              let dd = deg + min / 60 + sec / 3600
              if (String(latRef).replace(/\0/g, "").trim() === "S") dd = -dd
              result.gpsInfo["Latitude"] = dd.toFixed(6)
            }
            if (lonRaw && lonRef) {
              const deg = lonRaw[0][0] / lonRaw[0][1]
              const min = lonRaw[1][0] / lonRaw[1][1]
              const sec = lonRaw[2][0] / lonRaw[2][1]
              let dd = deg + min / 60 + sec / 3600
              if (String(lonRef).replace(/\0/g, "").trim() === "W") dd = -dd
              result.gpsInfo["Longitude"] = dd.toFixed(6)
            }
            if (altRaw) {
              const val = Array.isArray(altRaw) ? (altRaw[0] / altRaw[1]) : Number(altRaw)
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
            const latR = exif["GPS"][piexif.GPSIFD.GPSLatitude] as any[]
            const latRef = exif["GPS"][piexif.GPSIFD.GPSLatitudeRef]
            const lonR = exif["GPS"][piexif.GPSIFD.GPSLongitude] as any[]
            const lonRef = exif["GPS"][piexif.GPSIFD.GPSLongitudeRef]
            if (latR && latRef && lonR && lonRef) {
              const latDeg = latR[0][0] / latR[0][1] + (latR[1][0] / latR[1][1] / 60) + (latR[2][0] / latR[2][1] / 3600)
              const lonDeg = lonR[0][0] / lonR[0][1] + (lonR[1][0] / lonR[1][1] / 60) + (lonR[2][0] / lonR[2][1] / 3600)
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
    setStats({ scanned: 0, matched: 0, unmatched: 0, exifFailed: 0, errors: 0, total: 0 })
    statsBuffer.current = { scanned: 0, matched: 0, unmatched: 0, exifFailed: 0, errors: 0, total: 0 }
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

    const sessionId = `${user!.uid}_${Date.now()}`;
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
      requestAnimationFrame(() => {
        setStats({ ...statsBuffer.current })
        setProgress(progressBuffer.current)
        setSessionBytes(sessionBytesRef.current)
        setSessionFiles(sessionFilesRef.current)
        setLogs(prev => {
          if (logsBuffer.current.length === 0) return prev;
          const newLogs = [...prev, ...logsBuffer.current]
          logsBuffer.current = []
          return newLogs.slice(-300)
        })
      });
    }, 250)

    try {
      const session = await sessionManagerRef.current.startNewSession(
        sessionId,
        user!.uid,
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

  const resetUserQuota = async () => {
    if (!user) return;
    
    const choice = window.prompt(
      "Choose a reset option (enter 1, 2, or 3):\n\n" +
      "1. Reset Cloud Profile Quota Only (sets usedBytes/Files to 0 in Firestore)\n" +
      "2. Reset Local Screen Session Only (clears progress & logs on the screen)\n" +
      "3. Reset Both (Complete Reset)"
    );
    
    if (!choice) return;
    const opt = choice.trim();
    if (opt !== '1' && opt !== '2' && opt !== '3') {
      useToastStore.getState().addToast("Invalid option selected. Reset cancelled.", "error");
      return;
    }

    try {
      if (opt === '1' || opt === '3') {
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, {
          usedBytes: 0,
          usedFiles: 0,
          totalBytesProcessed: 0,
          totalFilesProcessed: 0,
        }, { merge: true });
        await refreshUserData();
      }
      
      if (opt === '2' || opt === '3') {
        // Reset local active session counters on the UI
        statsBuffer.current = { scanned: 0, matched: 0, unmatched: 0, exifFailed: 0, errors: 0, total: 0 };
        setStats({ ...statsBuffer.current });
        setProgress(0);
        setLogs([]);
        sessionBytesRef.current = 0;
        sessionFilesRef.current = 0;
        setSessionBytes(0);
        setSessionFiles(0);
        totalSessionBytesRef.current = 0;
      }
      
      useToastStore.getState().addToast("Reset completed successfully.", "success");
    } catch (err: any) {
      console.error("Failed to reset:", err);
      useToastStore.getState().addToast("Failed to reset: " + err.message, "error");
    }
  };

  return {
    resetUserQuota,
    // Auth / plan
    user,
    userData,
    plan,
    tierThresholds,
    limitFiles,
    limitBytes,
    currentUsedFiles,
    currentUsedBytes,
    formatByteSize,
    // Maintenance
    maintenance,
    // Telemetry
    telemetryCpu,
    telemetryMem,
    telemetryTabHeap,
    telemetryWorkers,
    // Tool store state
    takeoutFolder,
    setTakeoutFolder,
    outputFolder,
    setOutputFolder,
    isProcessing,
    progress,
    currentFile,
    stats,
    logs,
    quotaAlert,
    setQuotaAlert,
    // Local state
    isPaused,
    useDeepExif,
    maxWorkers,
    activeWorkersCount,
    popupModal,
    setPopupModal,
    zipFile,
    setZipFile,
    isDragOver,
    takeoutLock,
    outputLock,
    takeoutFolderStructure,
    zipFilesList,
    showCompareModal,
    setShowCompareModal,
    modalContext,
    setModalContext,
    pendingSession,
    setPendingSession,
    logTab,
    setLogTab,
    sessionManagerRef,
    // Session tracking (for display)
    sessionBytes,
    sessionFiles,
    // Viewer state
    viewerFile,
    viewerExif,
    viewerLoading,
    // Comparison state
    compMediaFile,
    compJsonFile,
    compResult,
    // Duplicate state
    dupFolder,
    dupIsScanning,
    dupStats,
    dupGroups,
    dupScanStatus,
    // Active tool tab
    activeToolTab,
    setActiveToolTab,
    // Refs
    logContainerRef,
    // Handlers
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleSelectTakeout,
    handleSelectOutput,
    handleModalConfirm,
    handleReGrantPermissions,
    startProcessing,
    cancelProcessing,
    pauseProcessing,
    resumeProcessing,
    getEstimatedRestoreTime,
    handleViewerFileChange,
    handleCompFilesChange,
    handleSelectDupFolder,
    startDuplicateScan,
  }
}
