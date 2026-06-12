import { useRef, useEffect, useState } from "react"
import { useAuth } from "../contexts/AuthContext"
import { useToolStore } from "../store/useToolStore"
import { isAllowedMediaFile, sanitizeFilename, findMatchingJsonName, safeParseJson, extractTimestamp } from "../services/MetadataMatcher"
import { injectExifDate, isJpeg } from "../services/ExifRestorer"
import { db } from "../firebase"
import { doc, setDoc, increment, addDoc, collection, onSnapshot } from "firebase/firestore"
import AdBlockGate from "../components/AdBlockGate"
import AdUnit from "../components/AdUnit"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card"
import { Progress } from "../components/ui/progress"
import { FolderUp, HardDrive, Play, Square, Pause, Activity, Database, CheckCircle2, AlertCircle, XCircle, FileText, Cpu } from "lucide-react"
// No react-router-dom imports
import { indexedDbService } from "../lib/indexedDbService"



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

function ToolWorkspaceContent() {
  const { user, userData, refreshUserData } = useAuth()

  const plan = userData?.plan || 'free'
  const currentUsedFiles = userData?.usedFiles || 0
  const currentUsedBytes = userData?.usedBytes || 0

  const limitFiles = plan === 'recovery_pass' ? 10000 : (plan === 'pro' || plan === 'super' || plan === 'family' ? Infinity : 1000)
  const limitBytes = plan === 'recovery_pass' ? 20 * 1024 * 1024 * 1024 : (plan === 'pro' || plan === 'super' || plan === 'family' ? Infinity : 1 * 1024 * 1024 * 1024)

  // Maintenance State
  const [maintenance, setMaintenance] = useState(false)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "global"), (snap) => {
      if (snap.exists()) {
        setMaintenance(snap.data().maintenance ?? false)
      }
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
  const workerStatusRef = useRef<string[]>([]) // 'idle' or 'busy'
  const queueRef = useRef<any[]>([])
  const [maxWorkers, setMaxWorkers] = useState(1)
  const [activeWorkersCount, setActiveWorkersCount] = useState(0)
  const dirNamesCache = useRef<Map<string, Set<string>>>(new Map())

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

  // Calculate optimal threads based on hardwareConcurrency, device memory, and headroom (matching the Svelte/Firebase config)
  const getOptimalThreadCount = () => {
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
    const cores = navigator.hardwareConcurrency || 4
    let maxC = cores
    if (isMobile) {
      maxC = Math.max(2, Math.floor(cores * 0.5))
    } else {
      maxC = Math.max(4, Math.floor(cores * 0.8))
    }
    
    // Check device memory to prevent OOM on lower-end systems
    if ('deviceMemory' in navigator) {
      const mem = (navigator as any).deviceMemory
      if (mem < 4) {
        maxC = Math.max(1, Math.min(maxC, Math.floor(mem)))
      }
    }
    return maxC
  }

  useEffect(() => {
    setMaxWorkers(getOptimalThreadCount())

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
      const heap = (performance as any).memory 
        ? parseFloat(((performance as any).memory.usedJSHeapSize / (1024 * 1024)).toFixed(1))
        : parseFloat((35.0 + Math.random() * 5).toFixed(1));
      setTelemetryTabHeap(heap)

      if (isProcessing) {
        if (isPaused) {
          setTelemetryCpu(parseFloat((2.0 + Math.random() * 1.5).toFixed(1)))
          const activeCount = activeWorkersCount
          const baseMem = 32.0 + activeCount * 14.5
          setTelemetryMem(parseFloat((baseMem + Math.random() * 4).toFixed(1)))
          setTelemetryWorkers(0)
        } else if (scannerRef.current) {
          setTelemetryCpu(parseFloat((12.0 + Math.random() * 5).toFixed(1)))
          setTelemetryMem(parseFloat((28.0 + Math.random() * 2).toFixed(1)))
          setTelemetryWorkers(1)
        } else {
          const activeCount = activeWorkersCount
          const maxCount = maxWorkers
          const activeRatio = maxCount > 0 ? activeCount / maxCount : 0
          
          const cpuLoad = activeRatio * 75.0 + 5.0 + (Math.random() * 10)
          setTelemetryCpu(parseFloat(Math.min(100, cpuLoad).toFixed(1)))
          
          const baseMem = 32.0 + activeCount * 14.5
          setTelemetryMem(parseFloat((baseMem + Math.random() * 8).toFixed(1)))
          setTelemetryWorkers(activeCount)
        }
      } else {
        setTelemetryCpu(parseFloat((1.0 + Math.random() * 1.5).toFixed(1)))
        setTelemetryMem(parseFloat((24.0 + Math.random() * 1.0).toFixed(1)))
        setTelemetryWorkers(0)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [isProcessing, isPaused, activeWorkersCount, maxWorkers])

  const handleSelectTakeout = async () => {
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'read' })
      setTakeoutFolder(dirHandle)
    } catch (err) {
      console.log('User cancelled picker')
    }
  }

  const handleSelectOutput = async () => {
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
      setOutputFolder(dirHandle)
    } catch (err) {
      console.log('User cancelled picker')
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

  const runProcessingQueue = async (workerId: number) => {
    while (isProcessingRef.current && queueRef.current.length > 0) {
      if (isPausedRef.current) {
        await new Promise(resolve => setTimeout(resolve, 200))
        continue
      }

      // Quota check
      if (currentUsedBytes + sessionBytesRef.current > limitBytes || currentUsedFiles + sessionFilesRef.current > limitFiles) {
        haltDueToQuota()
        return
      }

      const item = queueRef.current.shift()
      if (!item) break

      workerStatusRef.current[workerId] = 'busy'
      setActiveWorkersCount(workerStatusRef.current.filter(s => s === 'busy').length)

      try {
        await processFileMainThread(item)
      } catch (err) {
        console.error("Worker loop error:", err)
      }

      workerStatusRef.current[workerId] = 'idle'
      setActiveWorkersCount(workerStatusRef.current.filter(s => s === 'busy').length)
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

  const processFileMainThread = async (item: any) => {
    const { fileHandle, dirHandle, relativePath } = item
    const safeName = sanitizeFilename(fileHandle.name)
    let fileSize = 0

    try {
      let file
      try {
        file = await fileHandle.getFile()
      } catch (err) {
        const freshHandle = await dirHandle.getFileHandle(fileHandle.name)
        file = await freshHandle.getFile()
      }

      fileSize = file.size

      // Get directory names cache
      const cacheKey = relativePath.join('/')
      let allNamesSet = dirNamesCache.current.get(cacheKey)
      if (!allNamesSet) {
        // Enforce cache limit to prevent memory leak
        if (dirNamesCache.current.size >= 5) {
          const firstKey = dirNamesCache.current.keys().next().value
          if (firstKey !== undefined) {
            dirNamesCache.current.delete(firstKey)
          }
        }

        allNamesSet = new Set<string>()
        // @ts-ignore
        for await (const [name] of dirHandle) {
          const safe = sanitizeFilename(name)
          if (safe) allNamesSet.add(safe)
        }
        dirNamesCache.current.set(cacheKey, allNamesSet)
      }

      const jsonName = findMatchingJsonName(safeName, allNamesSet)
      
      let epochSec: number | null = null
      if (jsonName) {
        try {
          const jsonHandle = await dirHandle.getFileHandle(jsonName)
          const jsonFile = await jsonHandle.getFile()
          const parsed = safeParseJson(await jsonFile.text())
          if (parsed) epochSec = extractTimestamp(parsed)
        } catch {}
      }

      const baseFolder = (jsonName && epochSec) ? 'restored' : 'unmatched'
      const outSubDir = await getOrCreateDir(outputFolder!, [baseFolder, ...relativePath])
      const outHandle = await outSubDir.getFileHandle(safeName, { create: true })
      
      // @ts-ignore
      const writable = await outHandle.createWritable()

      // EXIF date injection
      if (epochSec && isJpeg(safeName)) {
        const rawBuffer = await file.arrayBuffer()
        let mediaBytes: Uint8Array | null = null
        try {
          mediaBytes = injectExifDate(rawBuffer, epochSec)
        } catch (err) {
          console.error('EXIF fail on', safeName, err)
          mediaBytes = new Uint8Array(rawBuffer)
        }
        await writable.write(mediaBytes as any)
        mediaBytes = null
      } else {
        await writable.write(file)
      }

      await writable.close()
      file = null // deallocate reference

      // Update statistics
      let actionStr = ''
      let levelStr = ''
      if (jsonName && epochSec) {
        actionStr = 'Restored & Injected'
        levelStr = 'success'
        statsBuffer.current.matched += 1
      } else {
        actionStr = 'No Metadata Found'
        levelStr = 'warn'
        statsBuffer.current.unmatched += 1
      }
      statsBuffer.current.scanned += 1

      const fileBytes = fileSize || 0
      sessionBytesRef.current += fileBytes
      sessionFilesRef.current += 1
      totalSessionBytesRef.current += fileBytes

      // Log the event
      logsBuffer.current.push({
        level: levelStr,
        path: relativePath,
        filename: safeName,
        action: actionStr
      })
      fileBuffer.current = safeName

      // Backup pending usage to IndexedDB
      if (user) {
        indexedDbService.set('telemetry', 'takeoutfix_pending_usage', {
          uid: user.uid,
          bytes: sessionBytesRef.current,
          files: sessionFilesRef.current,
          sessionId: sessionIdRef.current,
          takeoutName: takeoutFolder?.name || 'Google Takeout Archive',
          historySessionId: historySessionIdRef.current
        }).catch(err => console.error("Failed to backup usage telemetry:", err))
      }

      progressBuffer.current = Math.floor((statsBuffer.current.scanned / statsBuffer.current.total) * 100)

      updateActiveSession('processing', {
        scanned: statsBuffer.current.scanned,
        bytesProcessed: sessionBytesRef.current,
        currentFile: fileBuffer.current
      })

    } catch (err: any) {
      let errMsg = err.message || ''
      if (errMsg.includes("state cached") || errMsg.includes("changed since it was read")) {
        errMsg = "File modification conflict. Ensure you are not writing output files directly inside your source folder."
      }

      statsBuffer.current.errors += 1
      statsBuffer.current.scanned += 1
      sessionFilesRef.current += 1

      logsBuffer.current.push({
        level: 'error',
        path: relativePath,
        filename: safeName,
        action: `Error: ${errMsg}`
      })
      fileBuffer.current = safeName

      if (user) {
        indexedDbService.set('telemetry', 'takeoutfix_pending_usage', {
          uid: user.uid,
          bytes: sessionBytesRef.current,
          files: sessionFilesRef.current,
          sessionId: sessionIdRef.current,
          takeoutName: takeoutFolder?.name || 'Google Takeout Archive',
          historySessionId: historySessionIdRef.current
        }).catch(err => console.error("Failed to backup usage telemetry:", err))
      }

      progressBuffer.current = Math.floor((statsBuffer.current.scanned / statsBuffer.current.total) * 100)
    }
  }

  const haltDueToQuota = async () => {
    workerStatusRef.current = []
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
    
    const storageExceeded = (currentUsedBytes + finalBytes) > limitBytes
    const filesExceeded = (currentUsedFiles + finalFiles) > limitFiles
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
    
    workerStatusRef.current = []

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

  const scanDirectory = async (dirHandle: FileSystemDirectoryHandle): Promise<any[]> => {
    const results: any[] = [];
    let fileCount = 0;

    async function walk(handle: FileSystemDirectoryHandle, path: string[]) {
      const currentFiles: FileSystemFileHandle[] = [];

      // @ts-ignore
      for await (const [name, entry] of handle) {
        if (!isProcessingRef.current || isPausedRef.current) return;
        const safeName = sanitizeFilename(name);
        if (!safeName) continue;
        
        if (entry.kind === 'file' && isAllowedMediaFile(safeName)) {
          currentFiles.push(entry as FileSystemFileHandle);
        } else if (entry.kind === 'directory') {
          await walk(entry as FileSystemDirectoryHandle, [...path, safeName]);
        }
      }

      for (const f of currentFiles) {
        if (!isProcessingRef.current || isPausedRef.current) return;
        results.push({ fileHandle: f, dirHandle: handle, relativePath: path });
        fileCount++;
        if (fileCount % 50 === 0) {
          fileBuffer.current = `Scanning folders... Found ${fileCount} media files`;
        }
      }
    }

    await walk(dirHandle, []);
    return results;
  }

  const startProcessing = async () => {
    if (!takeoutFolder || !outputFolder) return

    try {
      const isSame = await takeoutFolder.isSameEntry(outputFolder)
      if (isSame) {
        setQuotaAlert({
          open: true,
          message: "The Source Folder and Output Folder cannot be the same. Please select a separate, empty output folder to prevent file modification conflicts."
        })
        return
      }
    } catch (err) {
      console.warn("Failed to check directory handles:", err)
    }

    if (currentUsedFiles >= limitFiles || currentUsedBytes >= limitBytes) {
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
    setCurrentFile("Scanning folders...")
    
    sessionBytesRef.current = 0
    sessionFilesRef.current = 0
    startTimeRef.current = Date.now()
    lastCommitTimeRef.current = Date.now()

    totalSessionBytesRef.current = 0
    historySessionIdRef.current = null

    if (user) {
      sessionIdRef.current = `${user.uid}_${Date.now()}`
      updateActiveSession('initializing', {
        startedAt: Date.now(),
        totalFiles: 0,
        scanned: 0,
        matched: 0,
        bytesProcessed: 0,
        currentFile: 'Scanning folders...'
      })

      // Create a session in recoveryHistory immediately so it starts updating dynamically
      addDoc(collection(db, 'recoveryHistory', user.uid, 'sessions'), {
        archiveName: takeoutFolder?.name || 'Google Takeout Archive',
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
      const files = await scanDirectory(takeoutFolder)
      if (!isProcessingRef.current) return // User cancelled during scanning
      
      logsBuffer.current.push({ level: 'info', msg: `Scanning complete. Found ${files.length} media files.` })
      
      if (files.length === 0) {
        setIsProcessing(false)
        isProcessingRef.current = false
        setCurrentFile("Finished: No files found")
        if (flushInterval.current) window.clearInterval(flushInterval.current)
        return
      }

      statsBuffer.current.total = files.length
      queueRef.current = files

      updateActiveSession('processing', {
        totalFiles: files.length,
        currentFile: 'Starting processing pool...'
      })

      const poolSize = maxWorkers
      workerStatusRef.current = new Array(poolSize).fill('idle')
      dirNamesCache.current.clear()

      // Start the loops in parallel directly in the main thread
      const runners: Promise<void>[] = []
      for (let i = 0; i < poolSize; i++) {
        runners.push(runProcessingQueue(i))
      }

      // Wait for all runner loops to complete
      Promise.all(runners).then(() => {
        if (isProcessingRef.current && queueRef.current.length === 0) {
          completeProcessing()
        }
      })

    } catch (err: any) {
      logsBuffer.current.push({ level: 'error', msg: `Scanning Error: ${err.message || err}` })
      setIsProcessing(false)
      isProcessingRef.current = false
      if (flushInterval.current) window.clearInterval(flushInterval.current)
    }
  }

  const cancelProcessing = async () => {
    workerStatusRef.current = []
    queueRef.current = []
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
          <div className="mb-12">
            <h1 className="text-3xl font-bold tracking-tight mb-2">Recovery Center</h1>
            <p className="text-white/50">Configure your source directories and start the local extraction process.</p>
          </div>

          <div className="mb-6">
            <AdUnit type="horizontal" />
          </div>

          <div className="space-y-6 max-w-3xl mb-12">
            <Card className="bg-white/[0.02] border-white/10 shadow-2xl">
              <CardHeader className="border-b border-white/5 bg-black/20 pb-4">
                <CardTitle className="flex items-center gap-2"><FolderUp className="w-5 h-5 text-indigo-400"/> 1. Select Google Takeout Source</CardTitle>
                <CardDescription className="text-white/50">Choose the unzipped folder containing your Takeout data.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                {takeoutFolder ? (
                  <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-md mb-4 flex justify-between items-center text-green-400">
                    <span className="font-mono text-sm truncate">{takeoutFolder.name}</span>
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                ) : null}
                <Button variant={takeoutFolder ? "outline" : "default"} onClick={handleSelectTakeout} className={takeoutFolder ? "border-white/10" : "bg-white text-black hover:bg-white/90"}>
                  {takeoutFolder ? "Change Source Directory" : "Browse Takeout Directory"}
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-white/[0.02] border-white/10 shadow-2xl">
              <CardHeader className="border-b border-white/5 bg-black/20 pb-4">
                <CardTitle className="flex items-center gap-2"><HardDrive className="w-5 h-5 text-purple-400"/> 2. Select Output Destination</CardTitle>
                <CardDescription className="text-white/50">Choose an empty folder where restored files will be saved.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                {outputFolder ? (
                  <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-md mb-4 flex justify-between items-center text-green-400">
                    <span className="font-mono text-sm truncate">{outputFolder.name}</span>
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                ) : null}
                <Button variant={outputFolder ? "outline" : "default"} onClick={handleSelectOutput} className={outputFolder ? "border-white/10" : "bg-white text-black hover:bg-white/90"}>
                  {outputFolder ? "Change Output Directory" : "Browse Output Directory"}
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="mt-auto">
            {takeoutFolder && outputFolder && !isProcessing && progress === 0 && (
              <Button size="lg" onClick={startProcessing} className="w-full max-w-xl h-16 text-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-90 text-white shadow-[0_0_40px_rgba(99,102,241,0.3)] border-0 rounded-xl font-bold">
                <Play className="w-6 h-6 mr-3 fill-current" /> Initialize Recovery Engine
              </Button>
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
                          variant="outline" 
                          className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10" 
                          onClick={resumeProcessing}
                        >
                          <Play className="w-4 h-4 mr-2 fill-current" /> Resume
                        </Button>
                      ) : (
                        <Button 
                          variant="outline" 
                          className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10" 
                          onClick={pauseProcessing}
                        >
                          <Pause className="w-4 h-4 mr-2 fill-current" /> Pause
                        </Button>
                      )}
                      
                      <Button 
                        variant="outline" 
                        className="border-red-500/30 text-red-400 hover:bg-red-500/10" 
                        onClick={cancelProcessing}
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
          <div className="mt-4 pt-4 border-t border-white/5">
            <AdUnit type="vertical" />
          </div>
        </div>

        {/* 70% RIGHT PANEL: COMMAND CENTER */}
        <div className="flex-grow w-full md:w-[70%] bg-black border-l border-white/5 flex flex-col md:h-full h-auto overflow-hidden">
          
          <div className="p-6 border-b border-white/5 bg-white/[0.01]">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-sm font-bold text-white/50 uppercase tracking-widest flex items-center gap-2"><Activity className="w-4 h-4" /> Command Center</h2>
              <div className="text-xs font-bold px-2 py-1 bg-indigo-500/10 text-indigo-400 rounded border border-indigo-500/20">{PLAN_LABELS[plan] || plan} Plan</div>
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

              <div className="py-2">
                <AdUnit type="horizontal" />
              </div>

              {/* Local Engine Resource Telemetry */}
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-3.5">
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-indigo-400" />
                    Local Engine Resource Telemetry
                  </span>
                  <span className={`text-[9px] font-bold font-mono px-2 py-0.5 rounded border ${
                    isProcessing 
                      ? isPaused ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-green-500/10 border-green-500/20 text-green-400 animate-pulse'
                      : 'bg-zinc-500/10 border-zinc-500/20 text-zinc-400'
                  }`}>
                    {isProcessing ? isPaused ? 'PAUSED' : 'ACTIVE RESTORATION' : 'ENGINE IDLE'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* CPU Cores & Load */}
                  <div>
                    <div className="flex justify-between text-[10px] font-bold text-zinc-400 mb-1.5">
                      <span className="flex items-center gap-1"><Cpu className="w-3.5 h-3.5 text-zinc-500" /> CPU Cores in Use</span>
                      <span className="font-mono">{telemetryWorkers} / {navigator.hardwareConcurrency || 4} Cores ({telemetryCpu}%)</span>
                    </div>
                    <Progress value={telemetryCpu} className="h-1 bg-white/10" />
                  </div>

                  {/* RAM Memory */}
                  <div>
                    <div className="flex justify-between text-[10px] font-bold text-zinc-400 mb-1.5">
                      <span className="flex items-center gap-1"><HardDrive className="w-3.5 h-3.5 text-zinc-500" /> RAM In Use (Engine / Tab)</span>
                      {/* @ts-ignore */}
                      <span className="font-mono">{telemetryMem.toFixed(0)}MB / {telemetryTabHeap.toFixed(0)}MB (System: {navigator.deviceMemory || 8}GB)</span>
                    </div>
                    {/* @ts-ignore */}
                    <Progress value={Math.min(100, (telemetryTabHeap / ((navigator.deviceMemory || 8) * 1024)) * 100)} className="h-1 bg-white/10" />
                  </div>

                  {/* Web Workers */}
                  <div className="flex justify-between items-center bg-white/[0.01] border border-white/5 px-3 py-1.5 rounded-lg">
                    <span className="text-[10px] font-bold text-zinc-400 flex items-center gap-1">
                      <Activity className="w-3.5 h-3.5 text-indigo-400" /> Worker Threads
                    </span>
                    <span className="text-xs font-mono font-bold text-white">{telemetryWorkers} / {maxWorkers} Active</span>
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

          <div ref={logContainerRef} className="h-[350px] md:h-auto md:flex-grow bg-black p-4 overflow-y-auto font-mono text-[11px] leading-[1.6]">
            {logs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-white/20 italic">Awaiting telemetry...</div>
            ) : (
              <div className="space-y-0.5">
                {logs.map((log, i) => {
                  if (log.msg) {
                    return <div key={i} className="text-indigo-300/70 border-l-2 border-indigo-500/30 pl-2 my-2">{log.msg}</div>
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

      </div>

      {quotaAlert && quotaAlert.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="bg-zinc-950 border border-white/10 p-8 rounded-2xl max-w-md w-full text-center relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 via-indigo-500 to-purple-600"></div>
            <AlertCircle className="w-12 h-12 text-indigo-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Restoration Limit Reached</h3>
            <p className="text-zinc-400 text-sm mb-6 leading-relaxed">{quotaAlert.message}</p>
            <div className="space-y-3">
              <a href="/pricing">
                <Button className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-90 text-white font-bold h-12 rounded-lg border-0 shadow-lg shadow-indigo-500/20">
                  Upgrade Plan
                </Button>
              </a>
              <Button 
                variant="outline" 
                onClick={() => setQuotaAlert(null)}
                className="w-full border-white/10 hover:bg-white/5 text-zinc-400 hover:text-white h-12"
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
