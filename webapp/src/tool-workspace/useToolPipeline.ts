/**
 * useToolPipeline — all processing engine state and logic for the TakeoutFix workspace.
 * Extracted from ToolWorkspace.tsx to keep that file focused on layout/routing only.
 */
// Tool pipeline hook for TakeoutFix workspace
import React, { useRef, useEffect, useState } from "react"
import { useAuth } from "../contexts/AuthContext"
import { useToolStore } from "../store/useToolStore"
import { useToastStore } from "../store/useToastStore"
import { sanitizeFilename, findMatchingJsonName, safeParseJson, extractTimestamp, extractCoordinates, MAX_RESTORE_SIDECAR_BYTES } from "../services/restoration/MetadataMatcher"
// ZipMetadataMatcher is used via normalizeZipPath only (findMatchingJsonNameForZip resolved during scan phase)
import { isSupportedImageFormat, parseImageMetadata, isJpeg } from "../services/restoration/DeepExifRestorer"
import { isVideoFilename } from "../services/restoration/VideoMetadataRestorer"
import { getUniqueFileHandle } from "../services/restoration/outputFile"
import { reserveZipPath } from "../services/restoration/zipPathSafety"
import { db } from "../firebase"
import { doc, setDoc, increment, addDoc, collection, onSnapshot } from "firebase/firestore"
import { indexedDbService } from "../lib/indexedDbService"
import { acquireRestoreLock, withRestoreLock } from "../lib/restoreLock"
// piexifjs eliminated in favor of 100% WebAssembly ExifTool
import { SessionManager, canManageSession, hasCompleteSessionScan, type ActiveSession, type FileRecord } from "../lib/SessionManager"
import { WorkerPool } from "../lib/WorkerPool"
import type { ZipReader as ZipSourceReader } from "@zip.js/zip.js"
import { useSettingsStore } from "../store/useSettingsStore";
import { normalizeZipPath } from "../services/restoration/ZipMetadataMatcher"
import { generateSyncBatContent, generateSyncShContent } from "../services/restoration/WindowsDateSyncScript"
import { getGuestUsage, ensureGuestUsageLoaded, recordGuestUsage, guestQuotaDecision, GUEST_MAX_BYTES } from "./guestQuota"
import { pendingUsageKey, flushUnstoredUsage, recoverAccountBatches, UsageCheckpoints, PendingZipUsage, type UnstoredUsage } from "./pendingUsage"
import { applyUsageBatch } from "./usageBatch"
import { restoreFileReservation, restoreMemoryBudget } from "./restoreMemoryBudget"
import { saveHandles } from "../lib/handleStore"

// ---------------------------------------------------------------------------
// Shared constants / helpers (also exported so RestorePanel can import them)
// ---------------------------------------------------------------------------
export type LogEntry = {
  level: string;
  msg?: string;
  path?: string[];
  filename?: string;
  action?: string;
  output?: string;
}

export type ToolTab = 'restore' | 'photovault' | 'folderflow' | 'viewer' | 'comparison' | 'duplicates' | 'studio';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useToolPipeline() {
  const wakeLockSentinelRef = useRef<any>(null);
  const auditLogLinesRef = useRef<string[]>([]);
  const issuesLogLinesRef = useRef<string[]>([]);
  const latestAuditLogRef = useRef<string>("");
  const latestIssuesLogRef = useRef<string>("");

  const resetReports = (resumed: boolean) => {
    const notice = 'Earlier file details are unavailable after resuming; check the original output and any earlier reports.';
    auditLogLinesRef.current = resumed ? [notice] : [];
    issuesLogLinesRef.current = resumed ? [notice] : [];
    latestAuditLogRef.current = '';
    latestIssuesLogRef.current = '';
  };

  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [speedMBs, setSpeedMBs] = useState<string>("0.0");

  const requestWakeLock = async () => {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        wakeLockSentinelRef.current = await (navigator as any).wakeLock.request('screen');
      } catch {}
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockSentinelRef.current) {
      try {
        wakeLockSentinelRef.current.release();
      } catch {}
      wakeLockSentinelRef.current = null;
    }
  };

  const downloadAuditLog = () => {
    let text = latestAuditLogRef.current || auditLogLinesRef.current.join('\r\n') || "No logs recorded.";
    if (!latestAuditLogRef.current && currentSessionRef.current?.outputMode === 'zip') {
      text = "This ZIP restore has not produced a final report. Entries may belong to an archive that was not saved; check your downloads.\r\n\r\n" + text;
    }
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'restoration_log.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadIssuesLog = () => {
    let text = latestIssuesLogRef.current || issuesLogLinesRef.current.join('\r\n') || "No issues recorded.";
    if (!latestIssuesLogRef.current && currentSessionRef.current?.outputMode === 'zip') {
      text = "This ZIP restore has not produced a final report. Entries may belong to an archive that was not saved; check your downloads.\r\n\r\n" + text;
    }
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'restoration_issues.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const { user, userData, refreshUserData } = useAuth()
  const currentUserUidRef = useRef<string | null>(null)
  currentUserUidRef.current = user?.uid || null

  const isPassExpired = userData?.plan === 'recovery_pass' && userData?.expiresAt && Date.now() >= userData.expiresAt;
  const savedPlan: string | undefined = userData?.plan;
  const plan = !user ? 'guest' : ((savedPlan === 'guest' || (savedPlan === 'recovery_pass' && isPassExpired)) ? 'free' : (savedPlan || 'free'));

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
    const recorded = Math.max(totalFilesProcessed, usedFiles, lifetimeFiles);
    return recorded;
  }

  const guestUsage = !user ? getGuestUsage() : { files: 0, bytes: 0 };
  const currentUsedFiles = !user ? guestUsage.files : getUserFiles(userData as unknown as Record<string, unknown>);
  const currentUsedBytes = !user ? guestUsage.bytes : getUserBytes(userData as unknown as Record<string, unknown>);

  const [tierThresholds, setTierThresholds] = useState({
    guest:         { maxFiles: Infinity, maxSizeMB: 1024 },
    free:          { maxFiles: Infinity, maxSizeMB: Infinity },
    recovery_pass: { maxFiles: Infinity, maxSizeMB: Infinity },
    pro:           { maxFiles: Infinity, maxSizeMB: Infinity },
    super:         { maxFiles: Infinity, maxSizeMB: Infinity },
  })
  const [isFreePromoActive, setIsFreePromoActive] = useState(false)
  const [unlockFreeFeatures, setUnlockFreeFeatures] = useState(true)

  // Guests can sign in to continue after reaching the free guest limit.
  const isFreeUnlimited = Boolean(user);
  const limitFiles = Infinity;
  const limitBytes = user ? Infinity : GUEST_MAX_BYTES;

  const formatByteSize = (bytes: number) => {
    if (bytes === Infinity) return "Unlimited";
    if (bytes <= 0) return "0.0 MB";
    if (bytes >= 1024 * 1024 * 1024) {
      const gb = bytes / (1024 * 1024 * 1024);
      return gb % 1 === 0 ? `${gb.toFixed(0)} GB` : `${gb.toFixed(2)} GB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Maintenance State
  const [maintenance, setMaintenance] = useState(false)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "global"), (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        setMaintenance(data.maintenance ?? false)
        // Check limited-time free unlimited promo
        const promo = data.freeUnlimitedPromo
        if (promo && promo.enabled && promo.endsAt && Date.now() < promo.endsAt) {
          setIsFreePromoActive(true)
        } else {
          setIsFreePromoActive(false)
        }
        // Sync unlockFreeFeatures setting (default to true)
        setUnlockFreeFeatures(data.unlockFreeFeatures !== false)
        // Sync tool thresholds from admin settings in real-time
        const stored = data.tierThresholds
        if (stored) {
          const parseLimit = (val: any) => {
            const num = Number(val);
            return (val === undefined || val === null || num === 0 || isNaN(num)) ? Infinity : num;
          };
          setTierThresholds({
            guest: { maxFiles: Infinity, maxSizeMB: GUEST_MAX_BYTES / 1024 / 1024 },
            free: {
              maxFiles: parseLimit(stored.free?.maxFiles),
              maxSizeMB: parseLimit(stored.free?.maxSizeMB),
            },
            recovery_pass: {
              maxFiles: parseLimit(stored.recovery_pass?.maxFiles),
              maxSizeMB: parseLimit(stored.recovery_pass?.maxSizeMB),
            },
            pro: {
              maxFiles: parseLimit(stored.pro?.maxFiles),
              maxSizeMB: parseLimit(stored.pro?.maxSizeMB),
            },
            super: {
              maxFiles: parseLimit(stored.super?.maxFiles),
              maxSizeMB: parseLimit(stored.super?.maxSizeMB),
            },
          })
        }
      }
    }, (err) => {
      console.error("Global settings query error:", err)
    })
    return unsub
  }, [])

  const [, setTimeTick] = useState(0)

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

  const [zipMode, setZipMode] = useState(false)
  const zipModeRef = useRef(false)
  const currentZipWriterRef = useRef<any>(null)
  const currentZipBlobWriterRef = useRef<any>(null)
  const currentZipBytesRef = useRef<number>(0)
  const currentZipPartRef = useRef<number>(1)
  const pendingZipUsageRef = useRef(new PendingZipUsage())
  const pendingGuestZipUsageRef = useRef(new PendingZipUsage())

  // Concurrency processing pool implementation
  const [maxWorkers, setMaxWorkers] = useState(1)
  const maxWorkersRef = useRef(1)
  useEffect(() => {
    maxWorkersRef.current = maxWorkers
  }, [maxWorkers])
  const [activeWorkersCount, setActiveWorkersCount] = useState(0)
  const [popupModal, setPopupModal] = useState<{ title: string; message: string; type: 'error' | 'warning' } | null>(null)

  const isProcessingRef = useRef(false)
  const logContainerRef = useRef<HTMLDivElement>(null)
  const startTimeRef = useRef<number>(0)

  // Quota session trackers
  const sessionBytesRef = useRef(0)
  const sessionFilesRef = useRef(0)
  const checkpointsRef = useRef(new UsageCheckpoints())
  const checkpointUsageRef = useRef<() => void>(() => {})
  const commitSessionUsageRef = useRef(commitSessionUsage)
  commitSessionUsageRef.current = commitSessionUsage
  const [sessionBytes, setSessionBytes] = useState(0)
  const [sessionFiles, setSessionFiles] = useState(0)

  // Buffers for batching UI updates to prevent freezing
  const statsBuffer = useRef({ scanned: 0, matched: 0, unmatched: 0, exifFailed: 0, errors: 0, total: 0 })
  const totalBytesRef = useRef<number>(0)
  const logsBuffer = useRef<LogEntry[]>([])
  const flushLogs = (extra: LogEntry[] = []) => {
    const pending = logsBuffer.current
    logsBuffer.current = []
    if (pending.length || extra.length) {
      setLogs(prev => [...prev, ...pending, ...extra].slice(-400))
    }
  }
  const fileBuffer = useRef<string>("Waiting to start...")
  const progressBuffer = useRef<number>(0)
  const flushInterval = useRef<number | null>(null)

  const sessionIdRef = useRef<string | null>(null)
  const historySessionIdRef = useRef<string | null>(null)
  const totalSessionBytesRef = useRef<number>(0)
  const lastActiveSessionUpdateRef = useRef<number>(0)
  const lastCommitTimeRef = useRef<number>(0)
  const currentSessionRef = useRef<ActiveSession | null>(null)
  const usageOwnerUidRef = useRef<string | null>(null)
  const cancelForAccountChangeRef = useRef<(() => Promise<void>) | null>(null)
  const restoredTimestampsCatalogRef = useRef<{ path: string; epoch: number }[]>([])

  const [activeToolTab, setActiveToolTabState] = useState<ToolTab>(() => {
    if (typeof window !== 'undefined') {
      const param = new URLSearchParams(window.location.search).get('tab');
      if (param && ['restore', 'studio', 'photovault', 'folderflow', 'viewer', 'comparison', 'duplicates'].includes(param)) {
        return param as ToolTab;
      }
    }
    return 'restore';
  })

  const setActiveToolTab = (tab: ToolTab) => {
    setActiveToolTabState(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.replaceState({}, '', url.toString());
    }
  };

  // local drag-and-drop / zip processing states
  const [zipFile, setZipFile] = useState<File | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [takeoutLock, setTakeoutLock] = useState(false)
  const [outputLock, setOutputLock] = useState(false)
  const [takeoutFolderStructure] = useState<any>(null)
  const [zipFilesList] = useState<any[]>([])
  const [modalContext, setModalContext] = useState<'source' | 'destination' | null>(null)
  const [pendingFolderHandle, setPendingFolderHandle] = useState<FileSystemDirectoryHandle | null>(null)

  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleDrop = async (e: React.DragEvent<HTMLElement>) => {
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
  const inFlightTasksRef = useRef(new Set<Promise<void>>())
  const pipelineGenerationRef = useRef(0)
  const startupTaskRef = useRef<Promise<void> | null>(null)
  const restoreLockReleaseRef = useRef<(() => void) | null>(null)
  const restoreLockPendingRef = useRef(false)
  const pipelineLaunchedRef = useRef(false)
  const cancellingRef = useRef(false)
  const disposedRef = useRef(false)
  const resumeNextRef = useRef<(() => void) | null>(null)
  const retryPendingUsageRef = useRef<(() => void) | null>(null)
  const unstoredUsageRef = useRef<UnstoredUsage[]>([])
  const journalFlushRef = useRef<Promise<void> | null>(null)
  const usageRecoveryRunningRef = useRef(false)
  const usageRecoveryRequestedRef = useRef(false)

  const releaseRestoreLock = () => {
    const release = restoreLockReleaseRef.current
    release?.()
    restoreLockReleaseRef.current = null
    pipelineLaunchedRef.current = false
    if (release && !disposedRef.current) window.setTimeout(() => retryPendingUsageRef.current?.(), 0)
  }

  const lockRestore = async () => {
    if (restoreLockPendingRef.current || restoreLockReleaseRef.current) throw new Error('A restore is already open in this tab.')
    restoreLockPendingRef.current = true
    let release: () => void
    try {
      release = await acquireRestoreLock(navigator.locks)
    } finally {
      restoreLockPendingRef.current = false
    }
    if (disposedRef.current) {
      release()
      throw new Error('The restore workspace is no longer open.')
    }
    restoreLockReleaseRef.current = release
  }

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
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    const cores = navigator.hardwareConcurrency || 2;
    let mem = 4;
    if ('deviceMemory' in navigator) {
      mem = (navigator as unknown as { deviceMemory: number }).deviceMemory || 4;
    }

    // Each worker loads the WebAssembly metadata engine. Keep headroom for the
    // browser, archive reader, and output buffers instead of saturating every core.
    const memoryWorkers = mem >= 8 ? 4 : mem >= 4 ? 2 : 1;
    const cpuWorkers = Math.max(1, Math.floor(cores / 2));
    return Math.min(memoryWorkers, cpuWorkers, isMobile ? 2 : 4);
  };

  useEffect(() => {
    disposedRef.current = false
    const initTelemetryAndSession = async () => {
      // Always calculate optimal thread count dynamically to respect hardware capabilities
      const optimal = getOptimalThreadCount();
      setMaxWorkers(optimal);

      // Clean up any stale persisted custom selections to ensure dynamic behavior is maintained
      await indexedDbService.remove('telemetry', 'takeoutfix_max_workers').catch(() => {});

      // 2. Check for pending crashed/interrupted session
      try {
        const active = await sessionManagerRef.current.getActiveSession();
        if (active) setPendingSession(active);
      } catch (error) {
        console.error("Could not check for interrupted restores:", error);
        useToastStore.getState().addToast("Could not check saved restores. Check browser storage before starting a new run.", "error", 10000);
      }
    };
    initTelemetryAndSession();

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isProcessingRef.current) {
        e.preventDefault()
        e.returnValue = ''
        void commitSessionUsageRef.current().catch(error => console.error('Could not save usage before leaving:', error))
      }
    }

    // Restore output handle when re-grant banner succeeds
    const handleRestoreOutput = (e: Event) => {
      const handle = (e as CustomEvent<FileSystemDirectoryHandle>).detail
      if (handle) setOutputFolder(handle)
    }

    // SW background sync: flush pending Firestore usage when reconnected after offline
    const handleFlushUsage = () => { void commitSessionUsageRef.current().catch(error => console.error('Could not flush usage:', error)) }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('takeoutfix-restore-output', handleRestoreOutput)
    window.addEventListener('takeoutfix-flush-usage', handleFlushUsage)

    return () => {
      disposedRef.current = true
      pipelineGenerationRef.current++
      isProcessingRef.current = false
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('takeoutfix-restore-output', handleRestoreOutput)
      window.removeEventListener('takeoutfix-flush-usage', handleFlushUsage)
      if (flushInterval.current) window.clearInterval(flushInterval.current)
      if (workerPoolRef.current) workerPoolRef.current.terminate()
      const startup = startupTaskRef.current
      const heldLock = restoreLockReleaseRef.current
      void (async () => {
        if (startup) await startup.catch(error => console.error('Restore startup cleanup failed:', error))
        await Promise.allSettled([...inFlightTasksRef.current])
        let timeout: number | undefined
        try {
          await Promise.race([
            commitSessionUsageRef.current(),
            new Promise<never>((_, reject) => {
              timeout = window.setTimeout(() => reject(new Error('Usage save is still pending.')), 10000)
            })
          ])
        } catch (error) {
          console.error('Could not save usage during cleanup:', error)
        } finally {
          if (timeout !== undefined) window.clearTimeout(timeout)
          if (heldLock && restoreLockReleaseRef.current === heldLock) releaseRestoreLock()
        }
      })()
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

  // Recover usage stored in IndexedDB when a previous submission could not finish.
  const flushUnstoredJournal = () => {
    if (journalFlushRef.current) return journalFlushRef.current
    const task = flushUnstoredUsage(unstoredUsageRef.current, entry => indexedDbService.set('telemetry', entry.key, entry.value))
    journalFlushRef.current = task
    void task.then(() => { journalFlushRef.current = null }, () => { journalFlushRef.current = null })
    return task
  }

  const recoverPendingUsage = async () => {
    if (!user) return
    if (usageRecoveryRunningRef.current) {
      usageRecoveryRequestedRef.current = true
      return
    }
    usageRecoveryRunningRef.current = true
    try {
      await withRestoreLock(Boolean(restoreLockReleaseRef.current), () => acquireRestoreLock(navigator.locks), async () => {
        const keys = await indexedDbService.getAllKeys('telemetry')
        let recovered = false
        await recoverAccountBatches(user.uid, keys, () => currentUserUidRef.current === user.uid && !disposedRef.current,
          key => indexedDbService.get('telemetry', key),
          batch => applyUsageBatch(db, user.uid, batch.batchId, batch.bytes, batch.files),
          async key => { await indexedDbService.remove('telemetry', key); recovered = true })
        if (recovered) await refreshUserData().catch(err => console.warn('Could not refresh account data after usage recovery:', err))
      })
    } catch (err) {
      console.error("Failed to recover pending usage:", err)
    } finally {
      usageRecoveryRunningRef.current = false
      if (usageRecoveryRequestedRef.current && !disposedRef.current) {
        usageRecoveryRequestedRef.current = false
        window.setTimeout(() => retryPendingUsageRef.current?.(), 0)
      }
    }
  }
  retryPendingUsageRef.current = () => {
    if (disposedRef.current) return
    void checkpointsRef.current.settle().then(() => flushUnstoredJournal()).then(() => {
      if (user && currentUserUidRef.current === user.uid && navigator.onLine && !disposedRef.current) void recoverPendingUsage()
    }).catch(error => console.warn('Could not save pending usage on this device:', error))
  }

  useEffect(() => {
    retryPendingUsageRef.current?.()
    const retryWhenOnline = () => retryPendingUsageRef.current?.()
    window.addEventListener('online', retryWhenOnline)
    return () => window.removeEventListener('online', retryWhenOnline)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  useEffect(() => {
    const timer = setInterval(() => {
      if (isProcessingRef.current) {
        setTimeTick(t => t + 1);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (isProcessingRef.current) checkpointUsageRef.current()
    }, 10000)
    return () => window.clearInterval(timer)
  }, [])

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
    const sessionId = sessionIdRef.current
    const historyId = historySessionIdRef.current
    const generation = pipelineGenerationRef.current
    const historyFields = {
      filesProcessed: statsBuffer.current.scanned,
      matched: statsBuffer.current.matched,
      recovered: statsBuffer.current.matched,
      failed: statsBuffer.current.errors,
      bytesProcessed: totalSessionBytesRef.current,
      duration: Date.now() - startTimeRef.current,
      status
    }

    try {
      await setDoc(sessionRef, {
        uid: user.uid,
        email: user.email || 'Anonymous',
        status,
        lastUpdated: now,
        ...fields
      }, { merge: true })

      // Dynamically update the user's dashboard recovery history record in Firestore
      if (historyId && sessionIdRef.current === sessionId && pipelineGenerationRef.current === generation && currentUserUidRef.current === user.uid) {
        const historyRef = doc(db, 'recoveryHistory', user.uid, 'sessions', historyId)
        await setDoc(historyRef, historyFields, { merge: true }).catch(err => console.error("Failed to update dynamic recovery history:", err))
      }
    } catch (err) {
      console.warn("Failed to update active session telemetry:", err)
    }
  }

  useEffect(() => {
    checkpointUsageRef.current = () => {
      const ownerUid = usageOwnerUidRef.current
      if (!ownerUid) return
      const sessionId = sessionIdRef.current
      const historySessionId = historySessionIdRef.current
      const batchId = crypto.randomUUID()
      const pending = pendingZipUsageRef.current.snapshot()
      checkpointsRef.current.capture({
        bytes: sessionBytesRef.current - pending.bytes,
        files: sessionFilesRef.current - pending.files,
      }, async ({ bytes, files }) => {
        const key = pendingUsageKey(ownerUid, `${sessionId || 'unknown'}:${batchId}`)
        const value = { uid: ownerUid, batchId, bytes, files, sessionId,
          takeoutName: takeoutFolder?.name || 'Google Takeout Archive', historySessionId }
        try {
          await indexedDbService.set('telemetry', key, value)
        } catch (error) {
          console.error('Could not checkpoint usage:', error)
          unstoredUsageRef.current.push({ key, value })
          useToastStore.getState().addToast('Usage could not be saved on this device. It may be lost if you close this page.', 'error', 10000)
          if (!disposedRef.current) window.setTimeout(() => retryPendingUsageRef.current?.(), 0)
        }
      })
    }
  }, [takeoutFolder])

  async function commitSessionUsage() {
    await checkpointsRef.current.settle()
    const pending = pendingZipUsageRef.current.snapshot()
    const { bytes: bytesToSave, files: filesToSave } = checkpointsRef.current.consume({
      bytes: sessionBytesRef.current - pending.bytes,
      files: sessionFilesRef.current - pending.files,
    })
    const sessionId = sessionIdRef.current
    const historyId = historySessionIdRef.current
    const ownerUid = usageOwnerUidRef.current
    const batchId = ownerUid ? crypto.randomUUID() : ''
    const pendingKey = ownerUid ? pendingUsageKey(ownerUid, `${sessionId || 'unknown'}:${batchId}`) : ''

    // Zero out trackers immediately to prevent duplicate updates
    sessionBytesRef.current = pending.bytes
    sessionFilesRef.current = pending.files
    setSessionBytes(pending.bytes)
    setSessionFiles(pending.files)
    if (bytesToSave <= 0 && filesToSave <= 0) return
    if (!ownerUid) {
      // Guest usage is already recorded when each file completes.
      return
    }

    const record = {
      uid: ownerUid, batchId, bytes: bytesToSave, files: filesToSave, sessionId,
      takeoutName: takeoutFolder?.name || 'Google Takeout Archive', historySessionId: historyId
    }
    let journalStored = false
    try {
      await indexedDbService.set('telemetry', pendingKey, record)
      journalStored = true
      if (currentUserUidRef.current !== ownerUid) return
      await applyUsageBatch(db, ownerUid, batchId, bytesToSave, filesToSave)
      await indexedDbService.remove('telemetry', pendingKey).catch(error => console.warn('Usage saved, but its local record could not be removed:', error))
      await refreshUserData().catch(err => console.warn('Usage was saved, but account data could not be refreshed:', err))

      // Dynamically update user's live session history record in Firestore
      if (historyId && sessionIdRef.current === sessionId && currentUserUidRef.current === ownerUid) {
        const historyRef = doc(db, 'recoveryHistory', ownerUid, 'sessions', historyId)
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
      if (!journalStored) {
        unstoredUsageRef.current.push({ key: pendingKey, value: record })
        useToastStore.getState().addToast('Usage could not be saved on this device. It may be lost if you close this page.', 'error', 10000)
        if (!disposedRef.current) window.setTimeout(() => retryPendingUsageRef.current?.(), 0)
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
      if (!canManageSession(session, currentUserUidRef.current)) {
        useToastStore.getState().addToast("Sign in to the account that started this restore to continue.", "error");
        return;
      }
      if (!hasCompleteSessionScan(session)) {
        useToastStore.getState().addToast(
          "The file scan did not finish. Discard this saved session and start again to include all files.",
          "error",
          10000
        );
        return;
      }
      if (session.outputMode !== 'folder') {
        useToastStore.getState().addToast(
          "This interrupted session cannot be resumed safely. Start a new restore and check any previously downloaded files.",
          "error",
          8000
        );
        return;
      }

      if (session.zipFile) {
        try {
          // Verify if File reference in IndexedDB is still readable
          await session.zipFile.slice(0, 10).arrayBuffer();
        } catch {
          useToastStore.getState().addToast(
            "The original ZIP is no longer accessible. Discard this saved session and start again with the original ZIP.",
            "error",
            10000
          );
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
    if (!canManageSession(session, currentUserUidRef.current)) return;
    if (startupTaskRef.current || isProcessingRef.current || isProcessing) return;
    const task = (async () => {
      let acquired = false;
      try {
        await lockRestore();
        acquired = true;
        const active = await sessionManagerRef.current.getActiveSession();
        if (disposedRef.current || !active || active.id !== session.id || !canManageSession(active, currentUserUidRef.current) || !hasCompleteSessionScan(active)) {
          throw new Error('The saved restore has changed. Refresh this page and check its status.');
        }
        if (!currentUserUidRef.current) await ensureGuestUsageLoaded();
        if (disposedRef.current || !canManageSession(active, currentUserUidRef.current)) return;
        await resumeSession(active);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        useToastStore.getState().addToast(message, 'error', 10000);
      } finally {
        if (acquired && !pipelineLaunchedRef.current && !cancellingRef.current) releaseRestoreLock();
      }
    })();
    startupTaskRef.current = task;
    try { await task; } finally { if (startupTaskRef.current === task) startupTaskRef.current = null; }
  };

  const discardPendingSession = async () => {
    if (!pendingSession || !canManageSession(pendingSession, currentUserUidRef.current)) return;
    if (startupTaskRef.current || isProcessingRef.current || restoreLockReleaseRef.current) return;
    const task = (async () => {
      let acquired = false;
      try {
        await lockRestore();
        acquired = true;
        const active = await sessionManagerRef.current.getActiveSession();
        if (disposedRef.current || !active || active.id !== pendingSession.id || !canManageSession(active, currentUserUidRef.current)) {
          throw new Error('The saved restore has changed. Refresh this page and check its status.');
        }
        await sessionManagerRef.current.terminateSession('cancelled');
        setPendingSession(null);
      } catch (error) {
        console.error("Could not discard interrupted restore:", error);
        useToastStore.getState().addToast(error instanceof Error ? error.message : "Could not discard the saved restore.", "error");
      } finally {
        if (acquired) releaseRestoreLock();
      }
    })();
    startupTaskRef.current = task;
    try { await task; } finally { if (startupTaskRef.current === task) startupTaskRef.current = null; }
  };

  const resumeSession = async (session: ActiveSession) => {
    if (currentUserUidRef.current !== (user?.uid || null)) {
      throw new Error('The signed-in account changed. Check your account and try again.');
    }
    resetReports(session.scannedCount > 0);
    usageOwnerUidRef.current = user?.uid || null;
    cancelForAccountChangeRef.current = () => cancelProcessing('account-change');
    sessionIdRef.current = session.id;
    historySessionIdRef.current = null;
    sessionManagerRef.current.setCurrentSession(session);
    currentSessionRef.current = session;
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

    totalBytesRef.current = Number.isSafeInteger(session.totalSourceBytes) && (session.totalSourceBytes ?? -1) >= 0 ? session.totalSourceBytes! : 0;
    totalSessionBytesRef.current = Number.isSafeInteger(session.bytesProcessed) && session.bytesProcessed >= 0 ? session.bytesProcessed : 0;

    setStats({ ...statsBuffer.current });
    setProgress(Math.floor((session.scannedCount / session.totalFiles) * 100));
    setCurrentFile("Resuming restoration...");
    setLogs([]);
    logsBuffer.current = [{ level: 'info', msg: `Resuming restoration... Re-checking in-flight files.` }];

    try {
      await indexedDbService.resetProcessingToPending();
    } catch (dbErr) {
      console.error("Failed to reset in-flight files status:", dbErr);
      setPendingSession(session);
      setCurrentFile("Could not resume saved restore");
      setIsProcessing(false);
      isProcessingRef.current = false;
      useToastStore.getState().addToast("Could not prepare the saved files. Check browser storage and try again.", "error", 10000);
      return;
    }
    if (!isProcessingRef.current) return;

    startTimeRef.current = Date.now() - (session.lastUpdatedAt - session.startedAt);

    flushInterval.current = window.setInterval(() => {
      if (document.hidden) return;
      requestAnimationFrame(() => {
        setStats({ ...statsBuffer.current });
        setProgress(progressBuffer.current);
        if (startTimeRef.current && isProcessingRef.current && !isPausedRef.current) {
          const el = Math.max(1, Math.floor((Date.now() - startTimeRef.current) / 1000));
          setElapsedSeconds(el);
          setSpeedMBs(((totalSessionBytesRef.current / 1048576) / el).toFixed(2));
        }
        setSessionBytes(sessionBytesRef.current);
        setSessionFiles(sessionFilesRef.current);
        flushLogs();
      });
    }, 250);

    try {
      await processRestorePipeline(session, sessionManagerRef.current);
    } catch (err: any) {
      console.error("Resumption pipeline execution error:", err);
      logsBuffer.current.push({ level: 'error', msg: `Resumption Error: ${err.message}` });
      flushLogs();
      setIsProcessing(false);
      isProcessingRef.current = false;
      if (flushInterval.current) window.clearInterval(flushInterval.current);
      workerPoolRef.current?.terminate();
      workerPoolRef.current = null;
      await Promise.allSettled([...inFlightTasksRef.current]);
      if (!cancellingRef.current) releaseRestoreLock();
    }
  };

  const processRestorePipeline = async (session: ActiveSession, sessionManager: SessionManager) => {
    pipelineLaunchedRef.current = true;
    const generation = ++pipelineGenerationRef.current;
    const isCurrentRun = () => pipelineGenerationRef.current === generation && isProcessingRef.current;
    let zipTools: Promise<typeof import("@zip.js/zip.js")> | undefined;
    const loadZipTools = () => zipTools ??= import("@zip.js/zip.js");
    const zipSourceTools = session.zipFile ? await loadZipTools() : null;
    if (!isCurrentRun()) return;

    currentSessionRef.current = session;
    // 1. Initialize WorkerPool with selected engine
    const engine = useSettingsStore.getState().exifEngine;
    console.log('[PIPELINE ENGINE SELECTED]', engine);
    const driveProfile = useSettingsStore.getState().driveProfile;
    const effectiveWorkers = driveProfile === 'hdd' || session.zipFile || zipModeRef.current ? 1 : maxWorkersRef.current;
    console.log('[PIPELINE ENGINE: WASM ExifTool] Concurrency:', effectiveWorkers, 'Profile:', driveProfile);
    const pool = new WorkerPool(effectiveWorkers);
    workerPoolRef.current = pool;

    // 2. Open ZIP Reader if ZIP source
    let zipReader: ZipSourceReader<File> | null = null;
    let zipEntries: any[] = [];
    const zipEntryMap = new Map<string, any>();

    if (session.zipFile && zipSourceTools) {
      const { ZipReader, BlobReader } = zipSourceTools;
      zipReader = new ZipReader(new BlobReader(session.zipFile));
      zipEntries = await zipReader.getEntries();
      if (!isCurrentRun()) {
        await zipReader.close();
        return;
      }

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
          cached.add(name);
        }
        dirCache.set(pathKey, cached);
      }
      return cached;
    };

    // 4. Retry in-flight files without deleting existing output.
    await sessionManager.revertInFlightFiles();

    // 5. Get total pending count
    const totalPending = await sessionManager.getPendingCount();
    statsBuffer.current.total = (session.scannedCount || 0) + totalPending;

    // 6. Queue-based concurrency engine (prevents premature break / worker starvation freeze)
    const inflightLimit = (session.zipFile || zipModeRef.current) ? 1 : effectiveWorkers;
    const memoryBudget = restoreMemoryBudget((navigator as Navigator & { deviceMemory?: number }).deviceMemory);
    let inFlightCount = 0;
    let inFlightBytes = 0;
    const fileQueue: FileRecord[] = [];
    let isFetchingPage = false;
    let noMorePending = false;
    let lastPendingId: string | null = null;
    let outputReservation: Promise<void> = Promise.resolve();
    const usedZipPaths = new Set<string>();
    let guestReservedBytes = 0;
    let guestQuotaWaiters: Array<() => void> = [];
    let finishing = false;

    const failQueue = (error: unknown) => {
      if (!isCurrentRun()) return;
      console.error("Restore queue failed:", error);
      pipelineGenerationRef.current++;
      isProcessingRef.current = false;
      if (flushInterval.current) window.clearInterval(flushInterval.current);
      flushInterval.current = null;
      workerPoolRef.current?.terminate();
      workerPoolRef.current = null;
      const message = zipModeRef.current
        ? "Restore stopped because local session data could not be read or updated. The current ZIP part may not have downloaded. Keep your originals and check your downloads before retrying."
        : "Restore stopped because local session data could not be read or updated. Keep your originals and check any partial output before retrying.";
      setCurrentFile("Restore stopped");
      flushLogs([{ level: 'error', msg: message }]);
      useToastStore.getState().addToast(message, "error", 10000);
      queueMicrotask(() => {
        void finishZipFailure(zipReader);
      });
    };

    const pumpQueue = async () => {
      if (!isCurrentRun() || isPausedRef.current) {
        if (inFlightCount === 0 && !isCurrentRun()) {
          if (zipReader) {
            try { await zipReader.close(); } catch {}
          }
          if (pipelineGenerationRef.current === generation) resumeNextRef.current = null;
        }
        return;
      }

      // If queue is running low, fetch next slice of pending files
      if (fileQueue.length < inflightLimit * 3 && !isFetchingPage && !noMorePending) {
        isFetchingPage = true;
        try {
          const nextBatch = await sessionManager.getPendingFilesPage(lastPendingId, 150);
          if (!isCurrentRun()) return;
          if (!nextBatch || nextBatch.length === 0) {
            noMorePending = true;
          } else {
            lastPendingId = nextBatch[nextBatch.length - 1].id;
            fileQueue.push(...nextBatch);
            if (nextBatch.length < 150) {
              noMorePending = true;
            }
          }
        } catch (err) {
          console.error("Failed to load pending files batch:", err);
          throw err;
        } finally {
          isFetchingPage = false;
        }
      }

      // Check if completely drained and trigger auto-completion
      if (inFlightCount === 0 && fileQueue.length === 0) {
        const remainingInDb = await sessionManager.getPendingCount();
        if (!isCurrentRun()) return;
        if (remainingInDb === 0 && isProcessingRef.current && !finishing) {
          finishing = true;
          if (zipReader) {
            try { await zipReader.close(); } catch {}
          }
          if (!isCurrentRun()) return;
          resumeNextRef.current = null;
          if (zipModeRef.current) {
            if (!await downloadCurrentZipChunk()) return;
          }
          if (isCurrentRun()) await completeProcessing();
          return;
        } else if (remainingInDb > 0 && isProcessingRef.current && !isPausedRef.current) {
          noMorePending = false;
          lastPendingId = null;
        }
      }

      // Dispatch up to inflightLimit tasks
      while (inFlightCount < inflightLimit && fileQueue.length > 0) {
        if (!isCurrentRun() || isPausedRef.current) break;
        if (inFlightBytes >= memoryBudget.activeBytes) break;

        const nextFile = fileQueue[0];
        if (!nextFile) {
          fileQueue.shift();
          continue;
        }

        const reservedBytes = restoreFileReservation(nextFile.bytes, memoryBudget.activeBytes);
        if (inFlightBytes + reservedBytes > memoryBudget.activeBytes) break;

        fileQueue.shift();
        inFlightCount++;
        inFlightBytes += reservedBytes;
        setActiveWorkersCount(inFlightCount);

        // Execute task in self-contained worker closure
        const task = (async (fileRecord: FileRecord) => {
          let writable: any = null;
          let guestReservation = 0;
          let outputDescription = '';
          try {
            // Check quota limits
            if (!user && getGuestUsage().bytes >= GUEST_MAX_BYTES) {
              pipelineGenerationRef.current++;
              isProcessingRef.current = false;
              queueMicrotask(() => { void haltDueToQuota(); });
              return;
            }

            await sessionManager.claimFile(fileRecord.id);

            let size = fileRecord.bytes;
            let fileObj: File | null = null;
            let zipEntry: any = null;

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
              zipEntry = zipEntryMap.get(normalizeZipPath(fileRecord.zipPath).normalize('NFC'));
              if (zipEntry) {
                size = zipEntry.uncompressedSize;
              }
            }

            if (!fileObj && !zipEntry) {
              throw new Error("Source file reference not found.");
            }
            if (!Number.isSafeInteger(size) || size < 0) throw new Error("The source file has an invalid size.");
            if (!isCurrentRun()) return;
            if (zipModeRef.current) {
              if (size > memoryBudget.zipPartBytes || (zipEntry && size > memoryBudget.fileBytes)) {
                throw new Error("This file is too large for a browser ZIP download on this device. Restore to a folder or use the desktop app.");
              }
              if (currentZipWriterRef.current && currentZipBytesRef.current + size > memoryBudget.zipPartBytes) {
                if (!await downloadCurrentZipChunk() || !isCurrentRun()) return;
              }
            }
            if (!user) {
              while (isCurrentRun()) {
                const decision = guestQuotaDecision(getGuestUsage().bytes + pendingGuestZipUsageRef.current.snapshot().bytes, guestReservedBytes, size);
                if (decision === 'fit') break;
                if (decision === 'limit') {
                  pipelineGenerationRef.current++;
                  isProcessingRef.current = false;
                  queueMicrotask(() => { void haltDueToQuota(); });
                  return;
                }
                await new Promise<void>(resolve => { guestQuotaWaiters.push(resolve); });
              }
              if (!isCurrentRun()) return;
              guestReservation = size;
              guestReservedBytes += size;
            }

            let epochSec: number | null = null;
            let lat: number | undefined = undefined;
            let lng: number | undefined = undefined;
            let description: string | undefined = undefined;
            let people: string[] | undefined = undefined;
            let albumName: string | undefined = undefined;

            if (fileHandle && parentDirHandle) {
              const pathKey = fileRecord.relativePath.join('/');
              const allNames = await getDirNames(parentDirHandle, pathKey);
              const jsonName = findMatchingJsonName(fileRecord.filename, allNames);
              if (jsonName) {
                try {
                  const jsonHandle = await parentDirHandle.getFileHandle(jsonName);
                  const jsonFile = await jsonHandle.getFile();
                  const parsed = jsonFile.size <= MAX_RESTORE_SIDECAR_BYTES ? safeParseJson(await jsonFile.text()) : null;
                  if (parsed) {
                    epochSec = extractTimestamp(parsed);
                    const coordinates = extractCoordinates(parsed);
                    lat = coordinates?.lat;
                    lng = coordinates?.lng;
                    if (typeof parsed.description === 'string' && parsed.description.trim()) {
                      description = parsed.description.trim();
                    }
                    if (Array.isArray(parsed.people)) {
                      people = parsed.people
                        .map((p: any) => (typeof p === 'string' ? p : (p && typeof p.name === 'string' ? p.name : '')))
                        .map((s: string) => s.trim())
                        .filter(Boolean);
                    }
                  }
                } catch {}
              }

              const isUserAlbum = (name?: string | null) => {
                if (!name || !name.trim()) return false;
                const trimmed = name.trim();
                if (/^Photos from \d{4}$/i.test(trimmed)) return false;
                const lower = trimmed.toLowerCase();
                return !['bin', 'archive', 'trash', 'locked folder', 'similar shots'].includes(lower);
              };

              if (parentDirHandle.name && isUserAlbum(parentDirHandle.name)) {
                albumName = parentDirHandle.name;
                try {
                  const metaHandle = await parentDirHandle.getFileHandle('metadata.json');
                  const metaFile = await metaHandle.getFile();
                  const metaParsed = metaFile.size <= MAX_RESTORE_SIDECAR_BYTES ? safeParseJson(await metaFile.text()) : null;
                  if (metaParsed && typeof metaParsed.title === 'string' && metaParsed.title.trim() && isUserAlbum(metaParsed.title.trim())) {
                    albumName = metaParsed.title.trim();
                  }
                } catch {}
              }
            } else if (fileRecord.zipPath) {
              epochSec = fileRecord.epochSec;
              if (fileRecord.lat != null && fileRecord.lng != null && (Math.abs(fileRecord.lat) > 0.0001 || Math.abs(fileRecord.lng) > 0.0001)) {
                lat = fileRecord.lat;
                lng = fileRecord.lng;
              }
              if (fileRecord.description && fileRecord.description.trim()) {
                description = fileRecord.description.trim();
              }
              people = fileRecord.people;

              const isUserAlbum = (name?: string | null) => {
                if (!name || !name.trim()) return false;
                const trimmed = name.trim();
                if (/^Photos from \d{4}$/i.test(trimmed)) return false;
                const lower = trimmed.toLowerCase();
                return !['bin', 'archive', 'trash', 'locked folder', 'similar shots'].includes(lower);
              };

              const normalizedPath = normalizeZipPath(fileRecord.zipPath);
              const parts = normalizedPath.split('/');
              parts.pop();
              const dirPath = parts.join('/');
              const folderName = parts[parts.length - 1] || '';
              if (isUserAlbum(folderName)) {
                albumName = folderName;
                if (zipEntryMap) {
                  const metaZipPath = (dirPath ? `${dirPath}/metadata.json` : 'metadata.json').normalize('NFC');
                  const metaEntry = zipEntryMap.get(metaZipPath);
                  if (metaEntry?.getData && metaEntry.uncompressedSize <= MAX_RESTORE_SIDECAR_BYTES) {
                    try {
                      const { TextWriter } = await loadZipTools();
                      const textWriter = new TextWriter();
                      const jsonText = await metaEntry.getData(textWriter);
                      const metaParsed = safeParseJson(jsonText);
                      if (metaParsed && typeof metaParsed.title === 'string' && metaParsed.title.trim() && isUserAlbum(metaParsed.title.trim())) {
                        albumName = metaParsed.title.trim();
                      }
                    } catch {}
                  }
                }
              }
            }

            let bufferOrBlob: any = null;
            let actionStr = 'Copied (no usable date; metadata not restored)';
            let levelStr = 'warn';

            const organizeByYearMonth = useSettingsStore.getState().organizeYearMonth;
            const outputPath = (restored: boolean): string[] => {
              if (restored && organizeByYearMonth && epochSec) {
                const dt = new Date(epochSec * 1000);
                const y = String(dt.getFullYear());
                return ['restored', y, `${y}-${String(dt.getMonth() + 1).padStart(2, '0')}`];
              }
              return [restored ? 'restored' : 'unmatched', ...fileRecord.relativePath];
            };
            const outputHandle = async (path: string[]) => {
              const previous = outputReservation;
              let release!: () => void;
              outputReservation = new Promise<void>(resolve => { release = resolve; });
              await previous;
              try {
                const perm = await (session.outputHandle as any).queryPermission?.({ mode: 'readwrite' });
                if (perm === 'denied') throw new Error('Write permission was denied. Select the output folder again.');
                if (perm === 'prompt') {
                  const granted = await (session.outputHandle as any).requestPermission?.({ mode: 'readwrite' });
                  if (granted !== 'granted') throw new Error('Write permission is required. Select the output folder again.');
                }
                const dir = await getOrCreateDir(session.outputHandle!, path);
                return await getUniqueFileHandle(dir, fileRecord.filename);
              } catch (error: unknown) {
                const detail = error instanceof Error ? error.message : String(error);
                throw new Error(`Could not create the output file: ${detail}`);
              } finally {
                release();
              }
            };

            const isVideo = isVideoFilename(fileRecord.filename);
            const isSupported = isSupportedImageFormat(fileRecord.filename) || isVideo;

            const hasMetadataToWrite = isSupported && (epochSec || (!isVideo && lat !== undefined && lng !== undefined));
            const canBufferForMetadata = size <= memoryBudget.fileBytes && size <= reservedBytes;
            if (hasMetadataToWrite && canBufferForMetadata) {
              actionStr = isVideo ? 'Restored (Video Meta)' : 'Restored';
              levelStr = 'success';

              if (fileObj) {
                bufferOrBlob = await fileObj.arrayBuffer();
              } else if (zipEntry) {
                const { Uint8ArrayWriter } = await loadZipTools();
                const writer = new Uint8ArrayWriter();
                const bytes = await zipEntry.getData!(writer);
                bufferOrBlob = bytes.buffer;
                (writer as any).writable = null;
              }

              if (!isCurrentRun()) return;
              if (bufferOrBlob) {
                const taskName = isVideo ? 'inject_video' : 'inject_wasm';
                const res = await pool.runTask(taskName, {
                  buffer: bufferOrBlob,
                  epochSec,
                  lat,
                  lng,
                  filename: fileRecord.filename,
                  description,
                  people,
                  albumName,
                  type: isVideo ? 'video' : 'image'
                }, [bufferOrBlob]);

                if (!isCurrentRun()) return;
                if (!(res?.buffer instanceof ArrayBuffer) || (size > 0 && res.buffer.byteLength === 0) || typeof res.success !== 'boolean') {
                  throw new Error('Metadata worker returned an invalid file. No output was saved.');
                }
                bufferOrBlob = res.buffer;
                if (res.success) {
                  actionStr = epochSec ? 'Restored' : 'Location restored; date unavailable';
                  if (!epochSec) levelStr = 'warn';
                } else {
                  actionStr = `Copied (Meta fallback: ${res.error || 'skipped'})`;
                  levelStr = 'warn';
                  statsBuffer.current.exifFailed += 1;
                }
              }

              if (!bufferOrBlob) {
                throw new Error("Failed to read file contents.");
              }

              const outRelativePath = outputPath(levelStr === 'success');
              if (zipModeRef.current) {
                const { BlobReader, BlobWriter, ZipWriter } = await loadZipTools();
                if (!isCurrentRun()) return;
                if (!currentZipWriterRef.current) {
                  const blobWriter = new BlobWriter("application/zip");
                  currentZipBlobWriterRef.current = blobWriter;
                  currentZipWriterRef.current = new ZipWriter(blobWriter);
                }
                const zipEntryPath = reserveZipPath([...outRelativePath, fileRecord.filename].join('/'), usedZipPaths);
                const dateObj = epochSec ? new Date(epochSec * 1000)
                  : fileObj ? new Date(fileObj.lastModified) : zipEntry.lastModDate;
                await currentZipWriterRef.current.add(zipEntryPath, new BlobReader(new Blob([bufferOrBlob])), {
                  lastModDate: dateObj
                });
                outputDescription = `ZIP part ${currentZipPartRef.current} entry: ${zipEntryPath}`;
                currentZipBytesRef.current += size;
              } else {
                const outHandle = await outputHandle(outRelativePath);
                writable = await outHandle.createWritable();
                await writable.write(bufferOrBlob);
                await writable.close();
                writable = null;
                bufferOrBlob = null;
                outputDescription = `Output: ${[...outRelativePath, outHandle.name].join('/')}`;
                if (epochSec && levelStr === 'success') {
                  const relPath = [...outRelativePath, outHandle.name].join('/');
                  restoredTimestampsCatalogRef.current.push({ path: relPath, epoch: epochSec });
                }
              }
            } else {
              if (!isCurrentRun()) return;
              if (hasMetadataToWrite) actionStr = 'Copied unchanged (too large to safely restore metadata in this run)';
              else if (epochSec) actionStr = 'Copied (unsupported metadata format)';
              const outRelativePath = outputPath(false);

              if (zipModeRef.current) {
                const { BlobReader, BlobWriter, ZipWriter, Uint8ArrayWriter } = await loadZipTools();
                if (!isCurrentRun()) return;
                if (!currentZipWriterRef.current) {
                  const blobWriter = new BlobWriter("application/zip");
                  currentZipBlobWriterRef.current = blobWriter;
                  currentZipWriterRef.current = new ZipWriter(blobWriter);
                }
                const zipEntryPath = reserveZipPath([...outRelativePath, fileRecord.filename].join('/'), usedZipPaths);
                const dateObj = epochSec ? new Date(epochSec * 1000)
                  : fileObj ? new Date(fileObj.lastModified) : zipEntry.lastModDate;

                let contentReader: any;
                if (fileObj) {
                  contentReader = new BlobReader(fileObj);
                } else if (zipEntry) {
                  const writer = new Uint8ArrayWriter();
                  const bytes = await zipEntry.getData!(writer);
                  contentReader = new BlobReader(new Blob([bytes]));
                } else {
                  throw new Error("Failed to resolve file reference.");
                }

                if (!isCurrentRun()) return;
                await currentZipWriterRef.current.add(zipEntryPath, contentReader, {
                  lastModDate: dateObj
                });
                outputDescription = `ZIP part ${currentZipPartRef.current} entry: ${zipEntryPath}`;
                currentZipBytesRef.current += size;
              } else {
                const outHandle = await outputHandle(outRelativePath);
                writable = await outHandle.createWritable();
                if (fileObj) {
                  const readableStream = fileObj.stream();
                  await readableStream.pipeTo(writable);
                  writable = null;
                } else if (zipEntry) {
                  await zipEntry.getData!(writable, { preventClose: true });
                  await writable.close();
                  writable = null;
                } else {
                  throw new Error("Failed to resolve file reference for streaming.");
                }
                outputDescription = `Output: ${[...outRelativePath, outHandle.name].join('/')}`;
              }
            }

            let zipPartDownloaded = false;
            if (zipModeRef.current && currentZipBytesRef.current >= memoryBudget.zipPartBytes) {
              if (!await downloadCurrentZipChunk()) return;
              zipPartDownloaded = true;
            }

            try {
              await sessionManager.confirmFile(fileRecord.id, 'completed', size, epochSec, undefined, levelStr === 'success');
            } catch (error) {
              failQueue(error);
              return;
            }

            bufferOrBlob = null;
            fileObj = null;
            zipEntry = null;

            if (levelStr === 'success') {
              statsBuffer.current.matched += 1;
            } else if (levelStr === 'warn' && actionStr.startsWith('Copied (Meta')) {
              // counted as exifFailed
            } else if (levelStr === 'warn') {
              statsBuffer.current.unmatched += 1;
            } else {
              statsBuffer.current.errors += 1;
            }
            statsBuffer.current.scanned += 1;

            sessionBytesRef.current += size;
            sessionFilesRef.current += 1;
            if (user && zipModeRef.current && !zipPartDownloaded) {
              pendingZipUsageRef.current.add(size);
            }
            totalSessionBytesRef.current += size;
            if (!user) {
              guestReservedBytes -= guestReservation;
              guestReservation = 0;
              if (zipModeRef.current && !zipPartDownloaded) pendingGuestZipUsageRef.current.add(size);
              else recordGuestUsage(1, size);
            }

            logsBuffer.current.push({
              level: levelStr,
              path: fileRecord.relativePath,
              filename: fileRecord.filename,
              action: actionStr,
              output: outputDescription
            });
            if (logsBuffer.current.length > 400) logsBuffer.current.shift();
            const logTs = new Date().toISOString().replace('T', ' ').substring(0, 19);
            const fullRel = fileRecord.relativePath.length > 0 ? '/' + fileRecord.relativePath.join('/') + '/' : '/';
            const logLine = fullRel + fileRecord.filename + ' | ' + actionStr + (outputDescription ? ' | ' + outputDescription : '');
            if (levelStr === 'success') {
              auditLogLinesRef.current.push('[' + logTs + '] WRITE REPORTED SUCCESSFUL: ' + logLine);
            } else if (levelStr === 'warn') {
              auditLogLinesRef.current.push('[' + logTs + '] REVIEW: ' + logLine);
              issuesLogLinesRef.current.push('[' + logTs + '] REVIEW: ' + logLine);
            } else {
              auditLogLinesRef.current.push('[' + logTs + '] ERROR: ' + logLine);
              issuesLogLinesRef.current.push('[' + logTs + '] ERROR: ' + logLine);
            }
            fileBuffer.current = fileRecord.filename;
            progressBuffer.current = statsBuffer.current.total > 0
              ? Math.floor((statsBuffer.current.scanned / statsBuffer.current.total) * 100)
              : 0;

          } catch (err: any) {
            if (writable) {
              try { await writable.abort(); } catch {}
            }
            console.error("A file could not be processed. See the local report for details.");

            const errorMessage = err instanceof Error ? err.message : String(err || 'Unknown error');
            await sessionManager.confirmFile(fileRecord.id, 'failed', fileRecord.bytes, null, errorMessage);

            statsBuffer.current.errors += 1;
            statsBuffer.current.scanned += 1;

            const errorAction = `Error: ${errorMessage}`;
            logsBuffer.current.push({
              level: 'error',
              path: fileRecord.relativePath,
              filename: fileRecord.filename,
              action: errorAction
            });
            if (logsBuffer.current.length > 400) logsBuffer.current.shift();
            const logTs = new Date().toISOString().replace('T', ' ').substring(0, 19);
            const fullRel = fileRecord.relativePath.length > 0 ? '/' + fileRecord.relativePath.join('/') + '/' : '/';
            const logLine = '[' + logTs + '] ERROR: ' + fullRel + fileRecord.filename + ' | ' + errorAction;
            auditLogLinesRef.current.push(logLine);
            issuesLogLinesRef.current.push(logLine);
            fileBuffer.current = fileRecord.filename;
            progressBuffer.current = statsBuffer.current.total > 0
              ? Math.floor((statsBuffer.current.scanned / statsBuffer.current.total) * 100)
              : 0;
          } finally {
            guestReservedBytes -= guestReservation;
            const waiters = guestQuotaWaiters;
            guestQuotaWaiters = [];
            waiters.forEach(resolve => resolve());
            inFlightCount--;
            inFlightBytes -= reservedBytes;
            setActiveWorkersCount(inFlightCount);

            // Yield slightly for garbage collection every 10 files
            if (statsBuffer.current.scanned % 10 === 0) {
              await new Promise(r => setTimeout(r, 5));
            }

            // Immediately trigger next queue items
            void pumpQueue().catch(failQueue);

            // Completion check: when all workers and queues are drained
            if (isCurrentRun() && inFlightCount === 0 && fileQueue.length === 0) {
              const remainingInDb = await sessionManager.getPendingCount();
              if (remainingInDb === 0 && isCurrentRun() && !finishing) {
                finishing = true;
                if (zipReader) {
                  try { await zipReader.close(); } catch {}
                }
                if (isCurrentRun()) {
                  resumeNextRef.current = null;
                  if (zipModeRef.current) {
                    if (!await downloadCurrentZipChunk()) return;
                  }
                  if (isCurrentRun()) await completeProcessing();
                }
              } else if (remainingInDb > 0 && isCurrentRun() && !isPausedRef.current) {
                noMorePending = false;
                lastPendingId = null;
                void pumpQueue().catch(failQueue);
              }
            }
          }
        })(nextFile);
        inFlightTasksRef.current.add(task);
        task.then(
          () => inFlightTasksRef.current.delete(task),
          error => { inFlightTasksRef.current.delete(task); failQueue(error); }
        );
      }
    };

    resumeNextRef.current = () => { void pumpQueue().catch(failQueue); };

    // Trigger initial batch
    void pumpQueue().catch(failQueue);
  };

  const haltDueToQuota = async () => {
    try {
    if (workerPoolRef.current) {
      workerPoolRef.current.terminate()
      workerPoolRef.current = null
    }
    await Promise.allSettled([...inFlightTasksRef.current])
    const hasPartialZip = Boolean(currentZipWriterRef.current)
    if (hasPartialZip && !await downloadCurrentZipChunk()) return
    setActiveWorkersCount(0)

    if (flushInterval.current) {
      window.clearInterval(flushInterval.current)
      flushInterval.current = null
    }

    setUseDeepExif(false)
    useDeepExifRef.current = false
    setCurrentFile("Halted: Quota Exceeded")

    const quotaErrMsg = `Quota Exceeded! Halted after processing ${statsBuffer.current.scanned} files.`
    logsBuffer.current.push({ level: 'error', msg: quotaErrMsg })
    flushLogs()

    const finalBytes = sessionBytesRef.current
    await sessionManagerRef.current.terminateSession('failed')
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

    if (!user) {
      setQuotaAlert({
        open: true,
        message: hasPartialZip
          ? "The next file would exceed the 1 GB guest limit. A ZIP containing files processed so far was prepared for download; check that your browser saved it. Sign in for free, then start a new restore and keep your originals."
          : "The next file would exceed the 1 GB guest limit. Sign in for free, then start a new restore and check any files already saved."
      });
      return;
    }

    setQuotaAlert({
      open: true,
      message: "Restoration stopped after reaching the guest limit. Start a new restore while signed in, and check any files already saved. A partially prepared ZIP may not have downloaded."
    })
    } catch (error) {
      const message = `Could not finish stopping the restore: ${error instanceof Error ? error.message : String(error)}`
      console.error(message, error)
      setLogs(prev => [...prev, { level: 'error', msg: message }])
      useToastStore.getState().addToast(message, "error", 10000)
    } finally {
      setStats({ ...statsBuffer.current })
      setIsProcessing(false)
      releaseRestoreLock()
    }
  }

  const downloadCurrentZipChunk = async () => {
    if (!currentZipWriterRef.current) return true
    const zipWriter = currentZipWriterRef.current
    currentZipWriterRef.current = null
    currentZipBlobWriterRef.current = null

    try {
      setCurrentFile("Packaging ZIP archive...")
      const zipBlob = await zipWriter.close()
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      const takeoutName = zipFile?.name || takeoutFolder?.name || 'Takeout'
      a.download = `${takeoutName.replace(/\.[^/.]+$/, "")}_Restored_Part${currentZipPartRef.current}.zip`
      document.body.appendChild(a)
      try {
        a.click()
      } finally {
        a.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      }

      currentZipPartRef.current += 1
      currentZipBytesRef.current = 0
      pendingZipUsageRef.current.take()
      const guestUsage = pendingGuestZipUsageRef.current.take()
      if (guestUsage.files || guestUsage.bytes) recordGuestUsage(guestUsage.files, guestUsage.bytes)
      return true
    } catch (err) {
      console.error("Failed to close/download ZIP chunk:", err)
      pipelineGenerationRef.current++
      isProcessingRef.current = false
      if (flushInterval.current) window.clearInterval(flushInterval.current)
      flushInterval.current = null
      workerPoolRef.current?.terminate()
      workerPoolRef.current = null
      const message = "ZIP packaging failed. The current archive may not have downloaded. Keep your originals and check your downloads before starting again."
      setCurrentFile("ZIP packaging failed")
      flushLogs([{ level: 'error', msg: message }])
      useToastStore.getState().addToast(message, "error", 10000)
      queueMicrotask(() => { void finishZipFailure() })
      return false
    }
  }

  const finishZipFailure = async (sourceReader: ZipSourceReader<File> | null = null) => {
    try {
      await Promise.allSettled([...inFlightTasksRef.current])
      currentZipWriterRef.current = null
      currentZipBlobWriterRef.current = null
      currentZipBytesRef.current = 0
      const pending = pendingZipUsageRef.current.take()
      pendingGuestZipUsageRef.current.take()
      sessionBytesRef.current -= pending.bytes
      sessionFilesRef.current -= pending.files
      await commitSessionUsage()
      if (sourceReader) await sourceReader.close().catch(error => console.warn("Could not close source ZIP:", error))
      await sessionManagerRef.current.terminateSession('failed')
    } catch (error) {
      console.error("Failed to finish restore failure cleanup:", error)
      setLogs(prev => [...prev, { level: 'error', msg: 'Could not finish restore failure cleanup. Check the results before retrying.' }])
    } finally {
      setActiveWorkersCount(0)
      setStats({ ...statsBuffer.current })
      setIsProcessing(false)
      releaseRestoreLock()
    }
  }

  const completeProcessing = async () => {
    pipelineGenerationRef.current++
    isProcessingRef.current = false
    try {
    setUseDeepExif(false)
    useDeepExifRef.current = false
    setZipMode(false)
    zipModeRef.current = false
    currentZipWriterRef.current = null
    currentZipBlobWriterRef.current = null
    setActiveWorkersCount(0)

    if (flushInterval.current) {
      window.clearInterval(flushInterval.current)
      flushInterval.current = null
    }

    setStats({ ...statsBuffer.current })
    setProgress(100)
    setCurrentFile("Finalizing results...")

    // Prepare reports for download and write copies for folder output.
    const outHandle = currentSessionRef.current?.outputMode === 'zip' ? null : currentSessionRef.current?.outputHandle || outputFolder;
    const auditText = [
      "==================================================================",
      "TAKEOUTFIX - RESTORATION LOG",
      "==================================================================",
      `Generated: ${new Date().toISOString()}`,
      `Application: TakeoutFix Metadata Restorer`,
      `Files Processed: ${statsBuffer.current.scanned}`,
      `Metadata Writes Reported Successful: ${statsBuffer.current.matched}`,
      `Files Needing Review: ${statsBuffer.current.unmatched}`,
      `Metadata Fallbacks: ${statsBuffer.current.exifFailed}`,
      `Errors: ${statsBuffer.current.errors}`,
      "==================================================================",
      "Check restored files in your photo app; metadata is not independently verified by this report.",
      "",
      ...auditLogLinesRef.current
    ].join('\r\n');

    const issuesText = [
      "==================================================================",
      "TAKEOUTFIX - RESTORATION ISSUES & REVIEW REPORT",
      "==================================================================",
      `Generated: ${new Date().toISOString()}`,
      `Files Needing Review: ${statsBuffer.current.unmatched}`,
      `Metadata Fallbacks: ${statsBuffer.current.exifFailed}`,
      `Errors: ${statsBuffer.current.errors}`,
      "==================================================================",
      "",
      ...(issuesLogLinesRef.current.length > 0
        ? issuesLogLinesRef.current
        : [statsBuffer.current.unmatched || statsBuffer.current.exifFailed || statsBuffer.current.errors
          ? "Issues were recorded in the totals; details may be unavailable from a previous session."
          : "No errors or files needing review were recorded."])
    ].join('\r\n');

    latestAuditLogRef.current = auditText;
    latestIssuesLogRef.current = issuesText;

    if (outHandle) {
      try {
        const aHandle = await getUniqueFileHandle(outHandle, "restoration_log.txt");
        const aWritable = await (aHandle as any).createWritable();
        await aWritable.write(auditText);
        await aWritable.close();

        const iHandle = await getUniqueFileHandle(outHandle, "restoration_issues.txt");
        const iWritable = await (iHandle as any).createWritable();
        await iWritable.write(issuesText);
        await iWritable.close();
      } catch (logErr) {
        console.warn("Could not write logs to output folder:", logErr);
        const message = "One or more reports could not be saved to the output folder. Use Download Log and Issues Report to save them separately.";
        logsBuffer.current.push({ level: 'warn', msg: message });
        useToastStore.getState().addToast(message, "error", 10000);
      }
    }

    // Auto-generate sync scripts (.bat for Windows, .sh for Mac/Linux) in output folder if direct folder mode was used
    if (outHandle && useSettingsStore.getState().generateSyncScript && restoredTimestampsCatalogRef.current.length > 0) {
      try {
        for (const name of ['file_timestamps.json', 'sync_windows_dates.bat', 'sync_macos_linux.sh']) {
          try {
            await outHandle.getFileHandle(name);
            throw new Error(`${name} already exists; timestamp helper files were not generated.`);
          } catch (err) {
            if (!(err instanceof DOMException) || err.name !== 'NotFoundError') throw err;
          }
        }
        const jsonHandle = await outHandle.getFileHandle('file_timestamps.json', { create: true });
        const jsonWritable = await jsonHandle.createWritable();
        await jsonWritable.write(JSON.stringify(restoredTimestampsCatalogRef.current, null, 2));
        await jsonWritable.close();

        // 1. Windows batch script
        const batHandle = await outHandle.getFileHandle('sync_windows_dates.bat', { create: true });
        const batWritable = await batHandle.createWritable();
        await batWritable.write(generateSyncBatContent());
        await batWritable.close();

        // 2. macOS & Linux shell script
        const shHandle = await outHandle.getFileHandle('sync_macos_linux.sh', { create: true });
        const shWritable = await shHandle.createWritable();
        await shWritable.write(generateSyncShContent());
        await shWritable.close();

        logsBuffer.current.push({
          level: 'success',
          filename: 'sync_windows_dates.bat / sync_macos_linux.sh',
          action: 'Generated in output folder — run to sync File Explorer / Finder Date Modified'
        });
      } catch (scriptErr) {
        console.warn("Could not write sync scripts to destination folder:", scriptErr);
        logsBuffer.current.push({ level: 'warn', msg: `Timestamp helper files were not generated: ${scriptErr instanceof Error ? scriptErr.message : String(scriptErr)}` });
      }
    }

    flushLogs()

    const finalBytes = sessionBytesRef.current
    await sessionManagerRef.current.terminateSession('completed')
    await commitSessionUsage()
    await updateActiveSession('completed', {
      scanned: statsBuffer.current.scanned,
      matched: statsBuffer.current.matched,
      bytesProcessed: finalBytes,
      currentFile: 'Processing Complete'
    })

    if (user && statsBuffer.current.scanned > 0) {
      const duration = Date.now() - startTimeRef.current
      let historySaveFailed = false
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
      }).catch((err) => { historySaveFailed = true; console.error("Failed to save recovery record:", err) })

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
        }, { merge: true }).catch((err) => { historySaveFailed = true; console.error("Failed to update final recoveryHistory:", err) })
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
        }).catch((err) => { historySaveFailed = true; console.error("Failed to write fallback recoveryHistory:", err) })
      }
      if (historySaveFailed) {
        const message = "Local processing finished, but some account history could not be saved. Check your output and keep your reports."
        setLogs(prev => [...prev, { level: 'warn', msg: message }])
        useToastStore.getState().addToast(message, "error", 10000)
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
    setCurrentFile("Processing Complete")
    } catch (error) {
      const message = `Could not finish the restore: ${error instanceof Error ? error.message : String(error)}`
      console.error(message, error)
      setCurrentFile("Finalization failed")
      flushLogs([{ level: 'error', msg: message }])
      useToastStore.getState().addToast(message, "error", 10000)
    } finally {
      setIsProcessing(false)
      releaseRestoreLock()
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

      if (isSupportedImageFormat(file.name)) {
        try {
          const parsed = await parseImageMetadata(arrayBuffer, file.name);
          result.cameraInfo = { ...result.cameraInfo, ...parsed.cameraInfo };
          result.gpsInfo = { ...result.gpsInfo, ...parsed.gpsInfo };
        } catch (err) {
          console.warn("Exif parser fail:", err);
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

      if (isSupportedImageFormat(activeMedia.name)) {
        try {
          const parsed = await parseImageMetadata(mediaBuf, activeMedia.name);
          if (parsed.cameraInfo["Date Taken (EXIF)"]) {
            mediaDate = parsed.cameraInfo["Date Taken (EXIF)"];
          }
          if (parsed.gpsInfo["Latitude"] && parsed.gpsInfo["Longitude"]) {
            mediaGps = `${parsed.gpsInfo["Latitude"]}°, ${parsed.gpsInfo["Longitude"]}°`;
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
    if (typeof window === 'undefined' || !(window as any).showDirectoryPicker) {
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
    if (typeof window === 'undefined' || !(window as any).showDirectoryPicker) {
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

      const status = await (dirHandle as any).queryPermission({ mode: 'read' })
      if (status === 'prompt') {
        setPendingFolderHandle(dirHandle)
        setModalContext('source')
      } else {
        setTakeoutFolder(dirHandle)
        setZipFile(null)
        // Persist handle so it survives tab close
        saveHandles(dirHandle, outputFolder).catch(() => {})
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
        isNotAllowed ? "Permission Denied" : "Folder Selection Error"
      )
    } finally {
      setTakeoutLock(false)
    }
  }

  const handleSelectOutput = async () => {
    if (outputLock) return
    if (typeof window === 'undefined' || !(window as any).showDirectoryPicker) {
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

      const status = await (dirHandle as any).queryPermission({ mode: 'readwrite' })
      if (status === 'prompt') {
        setPendingFolderHandle(dirHandle)
        setModalContext('destination')
      } else if (status === 'granted') {
        setOutputFolder(dirHandle)
        // Persist handle so it survives tab close
        saveHandles(takeoutFolder, dirHandle).catch(() => {})
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
        isNotAllowed ? "Permission Denied" : "Folder Selection Error"
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
          // Persist handle so it survives tab close
          saveHandles(pendingFolderHandle, outputFolder).catch(() => {})
        } else {
          setOutputFolder(pendingFolderHandle)
          // Persist handle so it survives tab close
          saveHandles(takeoutFolder, pendingFolderHandle).catch(() => {})
        }
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

  const startProcessing = async (useZip: boolean = false) => {
    if (startupTaskRef.current || isProcessingRef.current || isProcessing) return;
    const task = (async () => {
      let acquired = false;
      try {
        await lockRestore();
        acquired = true;
        await startProcessingImpl(useZip);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        useToastStore.getState().addToast(message, 'error', 10000);
      } finally {
        if (acquired && !pipelineLaunchedRef.current && !cancellingRef.current) releaseRestoreLock();
      }
    })();
    startupTaskRef.current = task;
    try { await task; } finally { if (startupTaskRef.current === task) startupTaskRef.current = null; }
  };

  const startProcessingImpl = async (useZip: boolean) => {
    currentSessionRef.current = null;
    const sourceName = zipFile ? zipFile.name : (takeoutFolder ? takeoutFolder.name : '');
    if (!sourceName) {
      console.warn("Cannot start processing: No source folder or ZIP file selected.");
      useToastStore.getState().addToast("Please select a Source Folder or ZIP archive first.", "error");
      return;
    }

    if (!outputFolder && !useZip) {
      console.warn("Cannot start processing: No destination folder selected.");
      useToastStore.getState().addToast("Please select a Destination Output Folder first.", "error");
      return;
    }

    try {
      if (takeoutFolder && outputFolder && !useZip) {
        const overlaps = await takeoutFolder.resolve(outputFolder) !== null || await outputFolder.resolve(takeoutFolder) !== null
        if (overlaps) {
          setPopupModal({
            title: "Choose a different output folder",
            type: "warning",
            message: "Choose separate source and output folders that do not contain one another."
          })
          return
        }
      }
    } catch (err) {
      console.warn("Failed to check directory handles:", err)
      useToastStore.getState().addToast("Could not verify the source and output folders. Please select them again.", "error")
      return
    }

    let usedBytes = currentUsedBytes;
    if (!user) {
      try {
        usedBytes = (await ensureGuestUsageLoaded()).bytes;
      } catch (error) {
        console.error('Could not load guest usage:', error);
        useToastStore.getState().addToast('Could not read saved guest usage. Check browser storage and try again.', 'error', 10000);
        return;
      }
    }
    if (!user && usedBytes >= GUEST_MAX_BYTES) {
      setQuotaAlert({
        open: true,
        message: "You have reached the 1 GB guest limit. Sign in for free to remove this limit. Your browser and device may still limit large restores."
      });
      return;
    }

    if (disposedRef.current) return
    if (currentUserUidRef.current !== (user?.uid || null)) {
      throw new Error('The signed-in account changed. Check your account and try again.');
    }
    resetReports(false)
    usageOwnerUidRef.current = user?.uid || null
    cancelForAccountChangeRef.current = () => cancelProcessing('account-change')
    setIsProcessing(true)
    isProcessingRef.current = true
    setIsPaused(false)
    isPausedRef.current = false
    setUseDeepExif(true)
    useDeepExifRef.current = true
    setZipMode(useZip)
    zipModeRef.current = useZip

    currentZipWriterRef.current = null
    currentZipBlobWriterRef.current = null
    currentZipBytesRef.current = 0
    currentZipPartRef.current = 1
    pendingZipUsageRef.current.take()
    pendingGuestZipUsageRef.current.take()

    setProgress(0)
    setStats({ scanned: 0, matched: 0, unmatched: 0, exifFailed: 0, errors: 0, total: 0 })
    statsBuffer.current = { scanned: 0, matched: 0, unmatched: 0, exifFailed: 0, errors: 0, total: 0 }
    totalBytesRef.current = 0
    logsBuffer.current = []
    setLogs([])
    setCurrentFile("Scanning input source...")

    sessionBytesRef.current = 0
    sessionFilesRef.current = 0
    checkpointsRef.current.reset()
    setSessionBytes(0)
    setSessionFiles(0)
    setElapsedSeconds(0)
    setSpeedMBs('0.0')
    startTimeRef.current = Date.now()
    lastCommitTimeRef.current = Date.now()

    totalSessionBytesRef.current = 0
    historySessionIdRef.current = null

    const sessionUid = user?.uid || 'guest';
    const sessionId = `${sessionUid}_${Date.now()}`;
    sessionIdRef.current = sessionId;

    if (user) {
      const historyRef = doc(collection(db, 'recoveryHistory', user.uid, 'sessions'))
      historySessionIdRef.current = historyRef.id
      updateActiveSession('initializing', {
        startedAt: Date.now(),
        totalFiles: 0,
        scanned: 0,
        matched: 0,
        bytesProcessed: 0,
        currentFile: 'Scanning input source...'
      })

      setDoc(historyRef, {
        archiveName: sourceName,
        timestamp: Date.now(),
        filesProcessed: 0,
        matched: 0,
        recovered: 0,
        failed: 0,
        bytesProcessed: 0,
        duration: 0,
        status: 'processing'
      }).catch(err => console.error("Failed to initialize recoveryHistory session:", err))
    }

    flushInterval.current = window.setInterval(() => {
      if (document.hidden) return
      requestAnimationFrame(() => {
        setStats({ ...statsBuffer.current })
        setProgress(progressBuffer.current)
        if (startTimeRef.current && isProcessingRef.current && !isPausedRef.current) {
          const elapsed = Math.max(1, Math.floor((Date.now() - startTimeRef.current) / 1000))
          setElapsedSeconds(elapsed)
          setSpeedMBs(((totalSessionBytesRef.current / 1048576) / elapsed).toFixed(2))
        }
        setSessionBytes(sessionBytesRef.current)
        setSessionFiles(sessionFilesRef.current)
        flushLogs()
      });
    }, 250)

    let sessionStarted = false;
    try {
      const session = await sessionManagerRef.current.startNewSession(
        sessionId,
        sessionUid,
        sourceName,
        zipFile || takeoutFolder!,
        useZip ? null : outputFolder,
        useZip ? 'zip' : 'folder'
      );
      sessionStarted = true;
      currentSessionRef.current = session;

      if (!isProcessingRef.current) return;

      const { count: totalFiles, totalBytes: scannedTotalBytes } = await sessionManagerRef.current.scanAndRegister((indexedCount) => {
        fileBuffer.current = `Indexing Takeout source... Found ${indexedCount} media files`;
      }, () => !isProcessingRef.current);

      if (!isProcessingRef.current) return;

      if (totalFiles === 0) {
        setIsProcessing(false)
        isProcessingRef.current = false
        setCurrentFile("Finished: No files found")
        if (flushInterval.current) window.clearInterval(flushInterval.current)
        await sessionManagerRef.current.terminateSession('completed');
        releaseRestoreLock();
        return
      }

      statsBuffer.current.total = totalFiles;

      // Use the byte sum collected during scan — no second getAll() needed
      totalBytesRef.current = scannedTotalBytes;

      await updateActiveSession('processing', {
        totalFiles: totalFiles,
        currentFile: 'Starting restoration pipeline...'
      });

      if (!isProcessingRef.current) return;
      await processRestorePipeline(session, sessionManagerRef.current);

    } catch (err: any) {
      if (cancellingRef.current || disposedRef.current) return;
      console.error("Restoration start error:", err);
      const message = `Could not start the restore: ${err instanceof Error ? err.message : String(err)}`
      flushLogs([{ level: 'error', msg: message }])
      setCurrentFile("Restore could not start")
      useToastStore.getState().addToast(message, "error", 10000)
      setIsProcessing(false)
      isProcessingRef.current = false
      if (flushInterval.current) window.clearInterval(flushInterval.current)
      workerPoolRef.current?.terminate()
      workerPoolRef.current = null
      await Promise.allSettled([...inFlightTasksRef.current])
      if (sessionStarted) {
        await sessionManagerRef.current.terminateSession('failed');
      } else {
        try {
          const active = await sessionManagerRef.current.getActiveSession();
          if (active) setPendingSession(active);
        } catch (lookupError) {
          console.error("Could not check saved restores after startup failed:", lookupError);
        }
      }
      if (!cancellingRef.current) releaseRestoreLock()
    }
  }

  const cancelProcessing = async (reason: 'user' | 'account-change' = 'user') => {
    if (!isProcessingRef.current) return
    const wasZipOutput = zipModeRef.current
    cancellingRef.current = true
    pipelineGenerationRef.current++
    isProcessingRef.current = false
    try {
    setActiveWorkersCount(0)

    if (startupTaskRef.current) await startupTaskRef.current

    // Stop worker jobs before waiting for file tasks to finish.
    if (workerPoolRef.current) {
      workerPoolRef.current.terminate()
      workerPoolRef.current = null
    }

    await Promise.allSettled([...inFlightTasksRef.current])

    if (currentZipWriterRef.current) {
      try {
        await currentZipWriterRef.current.close()
      } catch (error) {
        console.error('Could not close the cancelled ZIP part:', error)
      }
      currentZipWriterRef.current = null
      currentZipBlobWriterRef.current = null
    }

    if (flushInterval.current) window.clearInterval(flushInterval.current)
    setIsPaused(false)
    isPausedRef.current = false
    setUseDeepExif(false)
    useDeepExifRef.current = false
    setZipMode(false)
    zipModeRef.current = false
    setCurrentFile("Cancelled")
    setLogs(prev => [...prev, { level: 'error', msg: reason === 'account-change' ? 'Processing stopped because the signed-in account changed. Check your output and keep your originals.' : 'Processing cancelled by user.' }])
    if (wasZipOutput) {
      const pending = pendingZipUsageRef.current.take()
      pendingGuestZipUsageRef.current.take()
      sessionBytesRef.current -= pending.bytes
      sessionFilesRef.current -= pending.files
      const message = 'The current ZIP part may not have been saved. Check your downloads and keep your originals.'
      setLogs(prev => [...prev, { level: 'error', msg: message }])
      useToastStore.getState().addToast(message, 'error', 10000)
    }

    const finalBytes = sessionBytesRef.current
    try {
      if (currentSessionRef.current) await sessionManagerRef.current.terminateSession('cancelled')
    } finally {
      await commitSessionUsage()
    }
    if (reason === 'account-change') return
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
    } catch (error) {
      const message = `Could not finish cancellation: ${error instanceof Error ? error.message : String(error)}`
      console.error(message, error)
      setLogs(prev => [...prev, { level: 'error', msg: message }])
      useToastStore.getState().addToast(message, "error", 10000)
    } finally {
      setStats({ ...statsBuffer.current })
      setIsProcessing(false)
      cancellingRef.current = false
      releaseRestoreLock()
    }
  }

  useEffect(() => {
    if (isProcessingRef.current && currentUserUidRef.current !== usageOwnerUidRef.current) {
      useToastStore.getState().addToast('Your account changed. Stopping the restore; check your output and keep your originals.', 'error', 10000)
      void cancelForAccountChangeRef.current?.()
    }
  }, [user?.uid])

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

  /** Resets all restoration state so the user can start a fresh restore without a page reload. */
  const resetForNewRestore = () => {
    setTakeoutFolder(null)
    setOutputFolder(null)
    setZipFile(null)
    setIsProcessing(false)
    isProcessingRef.current = false
    setIsPaused(false)
    isPausedRef.current = false
    setProgress(0)
    setCurrentFile('')
    setStats({ scanned: 0, matched: 0, unmatched: 0, exifFailed: 0, errors: 0, total: 0 })
    setLogs([])
    setZipMode(false)
    zipModeRef.current = false
    setActiveWorkersCount(0)
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
        const calculatedBytesPerSec = totalSessionBytesRef.current / elapsed;

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
      remainingBytes = Math.max(0, totalBytes - totalSessionBytesRef.current);
    } else if (scannedFiles > 0) {
      const avgBytesPerFile = totalSessionBytesRef.current / scannedFiles;
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

    let elapsedStr = "";
    if (startTimeRef.current > 0) {
      const elapsedSec = Math.max(0, Math.floor((Date.now() - startTimeRef.current) / 1000));
      const mm = Math.floor(elapsedSec / 60).toString().padStart(2, '0');
      const ss = (elapsedSec % 60).toString().padStart(2, '0');
      elapsedStr = `${mm}:${ss} elapsed • `;
    }

    const speedText = bytesPerSec > 0 ? ` @ ${formatByteSize(bytesPerSec)}/s` : '';
    return `⏱️ ${elapsedStr}${timeString}${scannedFiles > 0 ? ' remaining' : ''}${speedText}`;
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
        checkpointsRef.current.reset();
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
    isFreePromoActive,
    isFreeUnlimited,
    limitFiles,
    limitBytes,
    currentUsedFiles,
    currentUsedBytes,
    formatByteSize,
    // Maintenance
    maintenance,
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
    zipMode,
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
    modalContext,
    setModalContext,
    pendingSession,
    canManagePendingSession: !!pendingSession && canManageSession(pendingSession, user?.uid || null),
    discardPendingSession,
    setPendingSession,
    logTab,
    setLogTab,
    sessionManagerRef,
    // Session tracking (for display)
    sessionBytes,
    sessionFiles,
    elapsedSeconds,
    speedMBs,
    downloadAuditLog,
    downloadIssuesLog,
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
    // Active tool tab & feature unlocks
    activeToolTab,
    setActiveToolTab,
    unlockFreeFeatures,
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
    resetForNewRestore,
    getEstimatedRestoreTime,
    handleViewerFileChange,
    handleCompFilesChange,
    handleSelectDupFolder,
    startDuplicateScan,
  }
}
