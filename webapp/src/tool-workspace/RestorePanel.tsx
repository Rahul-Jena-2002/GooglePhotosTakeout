/**
 * RestorePanel — the main workspace.
 * 100% fluid, responsive, and adaptive across mobile, tablets, laptops (14"-17"), and desktop monitors (24"-32"+).
 */

import { useState, useMemo } from "react"
import { FolderUp, HardDrive, Play, Square, Pause, Database, CheckCircle2, AlertCircle, AlertTriangle, XCircle, Download, Layers, ShieldCheck, RotateCcw, Zap, Archive, Info } from "lucide-react"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { Progress } from "../components/ui/progress"
import AdUnit from "../components/monetization/AdUnit"
import { type LogEntry, type ToolTab } from "./useToolPipeline"
import type { ActiveSession } from "../lib/SessionManager"
import { usePersistentHandles } from "../hooks/usePersistentHandles"
import { useSettingsStore } from "../store/useSettingsStore"
import { downloadSyncScript } from "../services/restoration/WindowsDateSyncScript"

interface RestorePanelProps {
  elapsedSeconds?: number
  filesPerSec?: string
  speedMBs?: string
  downloadAuditLog?: () => void
  downloadIssuesLog?: () => void
  activeToolTab: ToolTab
  setActiveToolTab: (tab: ToolTab) => void
  plan: string
  unlockFreeFeatures?: boolean
  tierThresholds: {
    free: { maxFiles: number; maxSizeMB: number }
    recovery_pass: { maxFiles: number; maxSizeMB: number }
    pro: { maxFiles: number; maxSizeMB: number }
    super: { maxFiles: number; maxSizeMB: number }
  }
  takeoutFolder: FileSystemDirectoryHandle | null
  outputFolder: FileSystemDirectoryHandle | null
  zipFile: File | null
  setZipFile: (f: File | null) => void
  setTakeoutFolder: (h: FileSystemDirectoryHandle | null) => void
  isDragOver: boolean
  isProcessing: boolean
  isPaused: boolean
  progress: number
  stats: { scanned: number; matched: number; unmatched: number; exifFailed: number; errors: number; total: number }
  logs: LogEntry[]
  logTab: 'all' | 'restored' | 'errors' | 'skipped' | 'exif'
  setLogTab: (tab: 'all' | 'restored' | 'errors' | 'skipped' | 'exif') => void
  logContainerRef: React.RefObject<HTMLDivElement>
  getEstimatedRestoreTime: () => string
  pendingSession: ActiveSession | null
  setPendingSession: (s: ActiveSession | null) => void
  sessionManagerRef: React.MutableRefObject<any>
  handleDragOver: (e: React.DragEvent) => void
  handleDragLeave: () => void
  handleDrop: (e: React.DragEvent) => void
  handleSelectTakeout: () => void
  handleSelectOutput: () => void
  handleReGrantPermissions: () => void
  startProcessing: (useZip?: boolean) => void
  zipMode: boolean
  cancelProcessing: () => void
  pauseProcessing: () => void
  resumeProcessing: () => void
  resetForNewRestore: () => void
  setShowCompareModal: (v: boolean) => void
  viewerFile: File | null
  viewerExif: Record<string, unknown> | null
  viewerLoading: boolean
  handleViewerFileChange: (file: File) => void
  compMediaFile: File | null
  compJsonFile: File | null
  compResult: Record<string, unknown> | null
  handleCompFilesChange: (media: File | null, json: File | null) => void
  dupFolder: FileSystemDirectoryHandle | null
  dupIsScanning: boolean
  dupStats: { scanned: number; duplicates: number; savedBytes: number }
  dupGroups: Record<string, unknown>[]
  dupScanStatus: string
  handleSelectDupFolder: () => void
  startDuplicateScan: () => void
  sessionFiles?: number
  sessionBytes?: number
  currentUsedBytes?: number
  formatByteSize?: (bytes: number) => string
}

export function RestorePanel({
  elapsedSeconds = 0,
  speedMBs = '0.0',
  downloadAuditLog,
  downloadIssuesLog,
  activeToolTab,
  takeoutFolder,
  outputFolder,
  zipFile,
  setZipFile,
  setTakeoutFolder,
  isDragOver,
  isProcessing,
  isPaused,
  progress,
  stats,
  logs,
  logTab,
  setLogTab,
  logContainerRef,
  getEstimatedRestoreTime,
  pendingSession,
  setPendingSession,
  sessionManagerRef,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleSelectTakeout,
  handleSelectOutput,
  handleReGrantPermissions,
  startProcessing,
  cancelProcessing,
  pauseProcessing,
  resumeProcessing,
  resetForNewRestore,
  plan = 'guest',
  currentUsedBytes = 0,
  sessionFiles = 0,
  sessionBytes = 0,
  formatByteSize = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`,
}: RestorePanelProps) {
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [showPrestartGuide, setShowPrestartGuide] = useState(false)
  const organizeYearMonth = useSettingsStore((s) => s.organizeYearMonth)
  const setOrganizeYearMonth = useSettingsStore((s) => s.setOrganizeYearMonth)

  const formatElapsedTime = (totalSec: number): string => {
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    const pad = (n: number) => String(n).padStart(2, '0')
    if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`
    return `${pad(m)}:${pad(s)}`
  }

  // Persistent handle restore — auto-re-grants on tab reopen (VS Code model)
  const { needsReGrant, storedFolderName, reGrantState, reGrantAccess } = usePersistentHandles()

  const handleReGrantBanner = async () => {
    const handles = await reGrantAccess()
    if (handles?.takeout) setTakeoutFolder(handles.takeout)
    if (handles?.output) {
      window.dispatchEvent(new CustomEvent('takeoutfix-restore-output', { detail: handles.output }))
    }
  }

  // Deduplicate and filter logs
  const dedupedLogs = useMemo(() => {
    const map = new Map<string, LogEntry>()
    for (const log of logs) {
      if (log.filename) {
        const key = `${log.path ? log.path.join('/') + '/' : ''}${log.filename}`
        map.set(key, log)
      } else if (log.msg) {
        map.set(`msg-${log.msg}`, log)
      }
    }
    return Array.from(map.values())
  }, [logs])

  const restoredLogs = useMemo(() => dedupedLogs.filter(l => l.level === 'success'), [dedupedLogs])
  const errorLogs = useMemo(() => dedupedLogs.filter(l => l.level === 'error'), [dedupedLogs])
  const skippedLogs = useMemo(() => dedupedLogs.filter(l => {
    const isExif = l.action?.startsWith('Copied (EXIF') || l.action?.includes('Meta fallback')
    return l.level === 'warn' && !isExif
  }), [dedupedLogs])
  const fallbackLogs = useMemo(() => dedupedLogs.filter(l => {
    return l.action?.startsWith('Copied (EXIF') || l.action?.includes('Meta fallback')
  }), [dedupedLogs])

  const currentDisplayLogs = useMemo(() => {
    if (logTab === 'restored') return restoredLogs
    if (logTab === 'errors') return errorLogs
    if (logTab === 'skipped') return skippedLogs
    if (logTab === 'exif') return fallbackLogs
    return dedupedLogs
  }, [logTab, dedupedLogs, restoredLogs, errorLogs, skippedLogs, fallbackLogs])

  return (
    <div className="flex-grow w-full max-w-[1440px] mx-auto px-3 sm:px-5 md:px-6 py-3 sm:py-4 text-zinc-900 dark:text-zinc-100 flex flex-col transition-colors space-y-3">

      {/* Persistent Handle Re-grant Banner */}
      {needsReGrant && !takeoutFolder && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-500/20 rounded-xl text-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <FolderUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="text-zinc-800 dark:text-zinc-300 truncate">
              Previous workspace{storedFolderName ? <> — <strong className="text-zinc-900 dark:text-white">{storedFolderName}</strong></> : ''} needs access to resume.
            </span>
          </div>
          <button
            onClick={handleReGrantBanner}
            disabled={reGrantState === 'granting'}
            className="flex items-center gap-1.5 shrink-0 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-semibold transition-all shadow-xs cursor-pointer"
          >
            {reGrantState === 'granting'
              ? <><RotateCcw className="w-3.5 h-3.5 animate-spin" /> Restoring...</>
              : 'Re-grant Access'}
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div className="px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/40 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm sm:text-base text-zinc-900 dark:text-white">Google Photos Metadata Restorer</span>
            </div>
            <p className="text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400">Restore original dates, times, and location metadata directly inside your media files.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {sessionBytes > 0 && (
            <span className="text-[11px] font-mono font-medium text-zinc-700 dark:text-zinc-300 px-2.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/40">
              {formatByteSize(sessionBytes)} ({sessionFiles.toLocaleString()} files)
            </span>
          )}
          {plan === 'guest' ? (
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400">
              1.0 GB Free Limit
            </span>
          ) : (
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
              Unlimited Account
            </span>
          )}
          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
            isProcessing
              ? isPaused
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
                : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400 animate-pulse'
              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
          }`}>
            {isProcessing ? (isPaused ? 'PAUSED' : 'PROCESSING') : 'READY'}
          </span>
          <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 text-zinc-600 dark:text-zinc-400 text-[11px] font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Processes locally</span>
          </div>
        </div>
      </div>

      {/* Banners */}
      <div className="empty:hidden space-y-3">
        {/* Resumption Banner */}
        {activeToolTab === 'restore' && pendingSession && (
          <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-left space-y-2.5">
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-xs sm:text-sm">
              <Zap className="w-4 h-4" />
              <span>Interrupted Session Found</span>
            </div>
            <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              We found a pending restoration for <strong>{pendingSession.takeoutName}</strong> ({pendingSession.scannedCount} of {pendingSession.totalFiles} files processed).
            </p>
            <div className="flex gap-2.5">
              <Button
                onClick={handleReGrantPermissions}
                className="btn-monochrome-primary rounded-lg px-3.5 py-1.5 text-xs font-semibold cursor-pointer"
              >
                Resume Restoration
              </Button>
              <Button
                onClick={async () => {
                  await sessionManagerRef.current.terminateSession('cancelled')
                  setPendingSession(null)
                }}
                className="btn-monochrome-secondary rounded-lg px-3.5 py-1.5 text-xs font-semibold cursor-pointer"
              >
                Discard
              </Button>
            </div>
          </div>
        )}

        {/* Browser compatibility check alert */}
        {typeof window !== 'undefined' && !window.showDirectoryPicker && (
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 rounded-xl text-xs sm:text-sm flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div>
              <div className="font-semibold text-amber-900 dark:text-amber-100">Browser Compatibility Notice</div>
              <div className="text-xs text-amber-800 dark:text-amber-300/80 mt-0.5 leading-relaxed">
                Direct folder access requires a modern desktop browser (Google Chrome, Microsoft Edge, or Brave). If you are using Safari or Firefox, please select your archive as a ZIP file.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Single-Layer Workspace */}
      {activeToolTab === 'restore' && (
        <div className="space-y-4 sm:space-y-5">
          {/* Step 1 & Step 2 Cards (Side by side on desktop & tablet, stacked on mobile) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {/* 1. Source Card */}
            <Card
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`bg-white dark:bg-white/[0.01] border-zinc-200 dark:border-white/10 shadow-xs transition-all duration-150 ${
                isDragOver ? 'border-indigo-500/40 bg-indigo-500/[0.01] scale-[1.005]' : ''
              }`}
            >
              <CardHeader className="border-b border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-black/20 py-2 px-3.5">
                <CardTitle className="flex items-center justify-between text-xs sm:text-sm font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  <span className="flex items-center gap-2">
                    <FolderUp className="w-4 h-4 text-zinc-500 dark:text-zinc-400"/>
                    1. Select Takeout Folder or ZIP
                  </span>
                  {(takeoutFolder || zipFile) && (
                    <button
                      onClick={handleSelectTakeout}
                      className="text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white font-medium transition-all px-2.5 py-1 rounded-lg border border-zinc-300 dark:border-white/10 hover:border-zinc-400 dark:hover:border-white/20 bg-zinc-100 dark:bg-white/[0.02] cursor-pointer"
                    >
                      Change
                    </button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-3.5">
                {zipFile ? (
                  <div className="space-y-2">
                    <div className="p-3.5 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/50 rounded-xl flex items-center justify-between gap-3 text-xs sm:text-sm">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Archive className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        <div className="min-w-0">
                          <div className="font-mono font-bold text-zinc-900 dark:text-white truncate">
                            {zipFile.name}
                          </div>
                          <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">Archive mounted &bull; Ready to decompress and match</p>
                        </div>
                      </div>
                      <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    </div>
                  </div>
                ) : takeoutFolder ? (
                  <div className="space-y-2">
                    <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl flex items-center justify-between gap-3 text-xs sm:text-sm">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FolderUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 font-mono font-bold text-zinc-900 dark:text-white truncate">
                            <span>{takeoutFolder.name}</span>
                            <span className="text-zinc-400 font-normal">/</span>
                          </div>
                          <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">Source directory mounted &bull; Ready to scan files & sidecars</p>
                        </div>
                      </div>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 px-1 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span>Browser privacy shields root drive paths (<code className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">C:\...</code>) while granting direct access inside this directory.</span>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button onClick={handleSelectTakeout} className="btn-monochrome-primary rounded-lg px-3 py-1.5 transition-all duration-150 cursor-pointer text-xs h-9 flex-1 font-semibold shadow-2xs">
                        Browse Folder
                      </Button>
                      <Button
                        onClick={() => {
                          const input = document.createElement('input')
                          input.type = 'file'
                          input.accept = '.zip'
                          input.onchange = (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0]
                            if (file) {
                              setZipFile(file)
                              setTakeoutFolder(null)
                              window.dispatchEvent(new CustomEvent('takeoutfix-action-triggered'))
                            }
                          }
                          input.click()
                        }}
                        className="btn-monochrome-primary rounded-lg px-3 py-1.5 transition-all duration-150 cursor-pointer text-xs h-9 flex-1 font-semibold shadow-2xs"
                      >
                        Select ZIP Archive
                      </Button>
                    </div>
                    <div className="text-xs text-zinc-500 text-center font-normal pt-0.5">
                      or drag and drop your Takeout folder or ZIP file anywhere in this card
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 2. Destination Card */}
            <Card className="bg-white dark:bg-white/[0.01] border-zinc-200 dark:border-white/10 shadow-xs">
              <CardHeader className="border-b border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-black/20 py-2 px-3.5">
                <CardTitle className="flex items-center justify-between text-xs sm:text-sm font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  <span className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-zinc-500 dark:text-zinc-400"/>
                    2. Select Output Folder
                  </span>
                  {outputFolder && (
                    <button
                      onClick={handleSelectOutput}
                      className="text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white font-medium transition-all px-2.5 py-1 rounded-lg border border-zinc-300 dark:border-white/10 hover:border-zinc-400 dark:hover:border-white/20 bg-zinc-100 dark:bg-white/[0.02] cursor-pointer"
                    >
                      Change
                    </button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-3.5">
                {outputFolder ? (
                  <div className="space-y-2">
                    <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl flex items-center justify-between gap-3 text-xs sm:text-sm">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <HardDrive className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 font-mono font-bold text-zinc-900 dark:text-white truncate">
                            <span>{outputFolder.name}</span>
                            <span className="text-zinc-400 font-normal">/</span>
                          </div>
                          <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">Destination directory mounted &bull; Repaired photos will be saved here</p>
                        </div>
                      </div>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    </div>
                    <div className="flex flex-wrap items-center justify-between text-xs px-1 gap-2 pt-0.5">
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 text-[11px] font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Output Ready
                      </span>
                      <button
                        type="button"
                        onClick={() => downloadSyncScript()}
                        className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white underline cursor-pointer flex items-center gap-1 transition-colors text-[11px]"
                      >
                        <Download className="w-3.5 h-3.5" /> Timestamp sync script (.bat / .sh)
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <Button onClick={handleSelectOutput} className="btn-monochrome-primary w-full rounded-lg px-3 py-1.5 transition-all duration-150 cursor-pointer text-xs h-9 font-semibold shadow-2xs">
                      Browse Output Folder
                    </Button>
                    <div className="text-xs text-zinc-500 text-center font-normal pt-0.5">
                      Select where restored photos and videos will be saved
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Controls, Telemetry & Actions Card */}
          <div className="p-3 sm:p-3.5 rounded-xl bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-white/10 shadow-2xs space-y-2.5">
            {/* Options Strip: Checkboxes + Help */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 border-b border-zinc-100 dark:border-white/5 pb-3.5">
              <div className="flex flex-wrap items-center gap-5">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={organizeYearMonth}
                    onChange={(e) => setOrganizeYearMonth(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-300 dark:border-white/10 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white cursor-pointer accent-zinc-800 shrink-0"
                  />
                  <span>Organize into clean <strong className="font-medium text-zinc-900 dark:text-white">Year/Month folders</strong> (YYYY/YYYY-MM)</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-300 dark:border-white/10 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white cursor-pointer accent-zinc-800 shrink-0"
                  />
                  <span>I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-900 dark:hover:text-white">Terms of Service</a></span>
                </label>
              </div>

              <button
                type="button"
                onClick={() => setShowPrestartGuide(!showPrestartGuide)}
                className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors flex items-center gap-1.5 font-medium cursor-pointer text-xs sm:text-sm"
              >
                <Zap className="w-3.5 h-3.5 text-indigo-500" />
                <span>{showPrestartGuide ? 'Hide' : 'Show'} helpful tips</span>
                <span>{showPrestartGuide ? '▴' : '▾'}</span>
              </button>
            </div>

            {/* Collapsible Prestart Guide */}
            {showPrestartGuide && (
              <div className="py-2 px-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-white/10 space-y-2 text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                <div>
                  <strong className="text-zinc-900 dark:text-white">Dates and Location:</strong> Original taken dates, times, and GPS coordinates are embedded directly inside each photo and video so they appear chronologically in Google Photos, Apple Photos, or any software.
                </div>
                <div>
                  <strong className="text-zinc-900 dark:text-white">Folder dates on Windows/Mac:</strong> Browsers cannot alter operating system file modification dates due to sandbox security. Running the generated helper script (<span className="text-emerald-600 dark:text-emerald-400 font-mono">sync_windows_dates.bat</span> on Windows, <span className="text-emerald-600 dark:text-emerald-400 font-mono">sync_macos_linux.sh</span> on Mac/Linux) in your output folder syncs file system dates in seconds.
                </div>
                <div>
                  <strong className="text-zinc-900 dark:text-white">Download as ZIP:</strong> The ZIP download method sets file timestamps directly into the zip archive headers automatically.
                </div>
              </div>
            )}

            {/* Time Elapsed | Estimated Time | Speed HUD */}
            <div className="p-2 sm:p-2.5 rounded-lg bg-zinc-50/80 dark:bg-black/30 border border-zinc-200/80 dark:border-white/5">
              <div className="grid grid-cols-3 gap-2 text-center divide-x divide-zinc-200 dark:divide-zinc-800">
                <div>
                  <div className="text-[10px] sm:text-xs uppercase font-semibold text-zinc-500 tracking-wider">Time Elapsed</div>
                  <div className="text-sm sm:text-base lg:text-lg font-mono font-semibold text-zinc-800 dark:text-zinc-200 mt-0.5">
                    {formatElapsedTime(elapsedSeconds)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] sm:text-xs uppercase font-semibold text-zinc-500 tracking-wider">Estimated Time</div>
                  <div className="text-sm sm:text-base lg:text-lg font-mono font-semibold text-emerald-600 dark:text-emerald-400 truncate mt-0.5">
                    {isProcessing ? (getEstimatedRestoreTime().replace(/^[⏱️\s]*(Est\.\s*restoration\s*time:\s*)?/i, '') || 'Calculating...') : '--'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] sm:text-xs uppercase font-semibold text-zinc-500 tracking-wider">Speed</div>
                  <div className="text-sm sm:text-base lg:text-lg font-mono font-semibold text-cyan-600 dark:text-cyan-400 mt-0.5">
                    {isProcessing ? `${speedMBs} MB/s` : '--'}
                  </div>
                </div>
              </div>

              {/* Progress Bar (Visible while processing or completed) */}
              {(isProcessing || progress > 0) && (
                <div className="pt-3 mt-3 border-t border-zinc-200/60 dark:border-white/5">
                  <div className="flex justify-between items-center text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 font-semibold mb-1.5">
                    <span>Restoration Progress</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2 bg-zinc-200 dark:bg-white/10 rounded-full" />
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div>
              {!isProcessing && progress === 0 ? (
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    disabled={!(takeoutFolder || zipFile) || !outputFolder || !agreedToTerms}
                    onClick={() => startProcessing(false)}
                    className="btn-monochrome-primary flex-1 h-9 text-xs rounded-lg font-semibold transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none shadow-sm"
                  >
                    <Play className="w-4 h-4 fill-current" /> Start Restore (Folder)
                  </Button>
                  <Button
                    disabled={!(takeoutFolder || zipFile) || !agreedToTerms}
                    onClick={() => startProcessing(true)}
                    className="btn-monochrome-secondary flex-1 h-9 text-xs rounded-lg font-semibold transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none shadow-sm"
                  >
                    <Download className="w-4 h-4 fill-current" /> Download as ZIP
                  </Button>
                </div>
              ) : isProcessing ? (
                <div className="flex gap-3">
                  {isPaused ? (
                    <Button
                      onClick={resumeProcessing}
                      className="btn-monochrome-primary flex-1 h-9 text-xs rounded-lg transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 font-semibold"
                    >
                      <Play className="w-4 h-4 fill-current" /> Resume
                    </Button>
                  ) : (
                    <Button
                      onClick={pauseProcessing}
                      className="btn-monochrome-primary flex-1 h-9 text-xs rounded-lg transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 font-semibold"
                    >
                      <Pause className="w-4 h-4 fill-current" /> Pause
                    </Button>
                  )}
                  <Button
                    onClick={cancelProcessing}
                    className="btn-monochrome-secondary flex-1 h-9 text-xs rounded-lg transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 font-semibold"
                  >
                    <Square className="w-4 h-4 fill-current" /> Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={() => downloadSyncScript()}
                    className="btn-monochrome-secondary flex-1 h-9 text-xs rounded-lg font-semibold cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" /> Download Timestamp Sync Script
                  </Button>
                  <Button
                    onClick={resetForNewRestore}
                    className="btn-monochrome-primary flex-1 h-9 text-xs rounded-lg font-semibold cursor-pointer flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" /> Start Another Restoration
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Data Volume & Quota Monitoring Card */}
          <div className="p-3 sm:p-3.5 rounded-xl bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-white/10 shadow-2xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                  <HardDrive className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-900 dark:text-white">
                    <span>Processed Volume &amp; Quota</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      plan === 'guest'
                        ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
                        : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                    }`}>
                      {plan === 'guest' ? 'Guest Mode (1.0 GB Free Quota)' : 'Account Active (Unlimited Volume)'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                    {plan === 'guest'
                      ? 'Free guest mode allows up to 1.0 GB per batch. Sign in for 100% free unlimited processing.'
                      : 'Signed in with your account. Full library restoration and unlimited volume enabled.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 ml-auto sm:ml-0">
                <div className="text-right">
                  <div className="text-xs sm:text-sm font-mono font-bold text-zinc-900 dark:text-white">
                    {plan === 'guest'
                      ? `${formatByteSize(currentUsedBytes + sessionBytes)} / 1.0 GB`
                      : `${formatByteSize(sessionBytes || currentUsedBytes)} ${sessionFiles > 0 ? `(${sessionFiles.toLocaleString()} files)` : ''}`}
                  </div>
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
                    {plan === 'guest'
                      ? `${Math.min(100, Math.round(((currentUsedBytes + sessionBytes) / (1024 * 1024 * 1024)) * 100))}% of guest quota used`
                      : 'Unlimited batch allowance'}
                  </div>
                </div>

                {plan === 'guest' && (
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('takeoutfix:open-auth-modal', { detail: { mode: 'signin' } }))}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer transition-all shadow-2xs whitespace-nowrap"
                  >
                    Sign in to expand
                  </button>
                )}
              </div>
            </div>

            {plan === 'guest' && (
              <div className="pt-1.5 border-t border-zinc-100 dark:border-white/5">
                <Progress
                  value={Math.min(100, (((currentUsedBytes + sessionBytes) / (1024 * 1024 * 1024)) * 100))}
                  className="h-1.5 bg-zinc-200 dark:bg-white/10 rounded-full"
                />
              </div>
            )}
          </div>

          {/* Restoration Summary Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-white dark:bg-white/[0.02] border border-zinc-200 dark:border-white/5 py-2 px-3 rounded-lg flex items-center justify-between shadow-2xs">
              <span className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 flex items-center gap-2 font-medium"><Database className="w-4 h-4 text-zinc-400"/> Scanned</span>
              <span className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white truncate">{stats.scanned} / {stats.total || '—'}</span>
            </div>
            <div className="bg-emerald-50/70 dark:bg-emerald-500/5 border border-emerald-200 dark:border-emerald-500/10 py-2 px-3 rounded-lg flex items-center justify-between shadow-2xs">
              <span className="text-xs sm:text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-2 font-semibold"><CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400"/> Restored</span>
              <span className="text-sm sm:text-base font-semibold text-emerald-800 dark:text-emerald-400 truncate">{stats.matched}</span>
            </div>
            <div className="bg-amber-50/70 dark:bg-amber-500/5 border border-amber-300 dark:border-amber-500/10 py-2 px-3 rounded-lg flex items-center justify-between shadow-2xs">
              <span className="text-xs sm:text-sm text-amber-800 dark:text-amber-400 flex items-center gap-2 font-semibold"><AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400"/> Unmatched</span>
              <span className="text-sm sm:text-base font-semibold text-amber-900 dark:text-amber-400 truncate">{stats.unmatched}</span>
            </div>
            <div className="bg-rose-50/70 dark:bg-rose-500/5 border border-rose-200 dark:border-rose-500/10 py-2 px-3 rounded-lg flex items-center justify-between shadow-2xs">
              <span className="text-xs sm:text-sm text-rose-700 dark:text-rose-400 flex items-center gap-2 font-semibold"><XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400"/> Errors</span>
              <span className="text-sm sm:text-base font-semibold text-rose-800 dark:text-rose-400 truncate">{stats.errors}</span>
            </div>
          </div>

          {/* Ad Unit (Seamlessly integrated, collapses if empty) */}
          <div className="w-full">
            <AdUnit type="horizontal" placement="TOOL_RESTORE_TOP" />
          </div>

          {/* Activity Logs Terminal */}
          <div className="rounded-2xl border border-zinc-200 dark:border-white/10 overflow-hidden bg-white dark:bg-zinc-900/40 shadow-xs flex flex-col min-h-[300px]">
            {/* Logs Header */}
            <div className="border-b border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-black/30 px-3.5 py-2 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Database className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                  Activity Logs
                </span>
                <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm font-medium text-zinc-500">
                  <button
                    onClick={() => setLogTab('all')}
                    className={`pb-0.5 transition-all cursor-pointer ${
                      logTab === 'all' ? 'text-zinc-900 dark:text-white border-b-2 border-indigo-500 font-bold' : 'hover:text-zinc-800 dark:hover:text-zinc-300'
                    }`}
                  >
                    All ({dedupedLogs.length})
                  </button>
                  <button
                    onClick={() => setLogTab('restored')}
                    className={`pb-0.5 transition-all cursor-pointer ${
                      logTab === 'restored' ? 'text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-500 font-bold' : 'hover:text-zinc-800 dark:hover:text-zinc-300'
                    }`}
                  >
                    Restored ({restoredLogs.length})
                  </button>
                  <button
                    onClick={() => setLogTab('errors')}
                    className={`pb-0.5 transition-all cursor-pointer ${
                      logTab === 'errors' ? 'text-rose-600 dark:text-rose-400 border-b-2 border-rose-500 font-bold' : 'hover:text-zinc-800 dark:hover:text-zinc-300'
                    }`}
                  >
                    Errors ({errorLogs.length})
                  </button>
                  <button
                    onClick={() => setLogTab('skipped')}
                    className={`pb-0.5 transition-all cursor-pointer ${
                      logTab === 'skipped' ? 'text-amber-600 dark:text-amber-400 border-b-2 border-amber-500 font-bold' : 'hover:text-zinc-800 dark:hover:text-zinc-300'
                    }`}
                  >
                    Skipped ({skippedLogs.length})
                  </button>
                  {fallbackLogs.length > 0 && (
                    <button
                      onClick={() => setLogTab('exif')}
                      className={`pb-0.5 transition-all cursor-pointer ${
                        logTab === 'exif' ? 'text-amber-600 dark:text-amber-400 border-b-2 border-amber-500 font-bold' : 'hover:text-zinc-800 dark:hover:text-zinc-300'
                      }`}
                    >
                      Fallback ({fallbackLogs.length})
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                {downloadAuditLog && (
                  <button
                    type="button"
                    onClick={downloadAuditLog}
                    title="Download complete restoration log (restoration_log.txt)"
                    className="text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Download Log
                  </button>
                )}
                {downloadIssuesLog && (
                  <button
                    type="button"
                    onClick={downloadIssuesLog}
                    title="Download issues summary (restoration_issues.txt)"
                    className="text-xs text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-200 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" /> Issues Report
                  </button>
                )}
              </div>
            </div>

            {/* Log Stream Terminal */}
            <div ref={logContainerRef} className="flex-grow bg-black dark:bg-black p-3 sm:p-4 overflow-y-auto font-mono text-xs leading-[1.6] max-h-[260px] sm:max-h-[320px] xl:max-h-[380px]">
              {currentDisplayLogs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-zinc-500 dark:text-white/20 italic py-12">
                  {logTab === 'all' ? 'Awaiting activity...' : `No ${logTab} logs recorded.`}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {currentDisplayLogs.map((log, i) => {
                    if (log.msg) {
                      return <div key={i} className="text-zinc-500 dark:text-zinc-400 border-l-2 border-zinc-600 pl-2 my-2">{log.msg}</div>
                    }

                    const pathStr = log.path ? `/${log.path.join('/')}/` : ''
                    const fullFilename = `${pathStr}${log.filename}`

                    if (log.level === 'success') {
                      const actionLabel = log.action && log.action !== 'Restored' ? ` (${log.action})` : ''
                      return (
                        <div key={i} className="text-emerald-500 dark:text-emerald-400 pl-2 border-l border-emerald-500/30 py-0.5 whitespace-pre-wrap">
                          <span className="font-bold mr-2">[RESTORED]</span>
                          <span>{fullFilename}{actionLabel}</span>
                        </div>
                      )
                    } else if (log.level === 'warn') {
                      const isExifFail = log.action?.startsWith('Copied (EXIF') || log.action?.includes('Meta fallback')
                      return (
                        <div key={i} className={`pl-2 border-l py-0.5 whitespace-pre-wrap ${
                          isExifFail
                            ? 'text-amber-500 dark:text-amber-400/90 border-amber-500/30'
                            : 'text-amber-500 dark:text-amber-400/80 border-amber-500/30'
                        }`}>
                          <span className="font-bold mr-2">{isExifFail ? '[FALLBACK]' : '[UNMATCHED]'}</span>
                          <span>{fullFilename}{log.action ? `  ➔  ${log.action}` : ''}</span>
                        </div>
                      )
                    } else if (log.level === 'error') {
                      const errorMsg = log.action ? log.action.replace(/^Error:\s*/i, '') : 'Unknown error'
                      return (
                        <div key={i} className="text-rose-500 dark:text-rose-400 pl-2 border-l border-rose-500/30 py-0.5 whitespace-pre-wrap">
                          <span className="font-bold mr-2">[ERROR]   </span>
                          <span>{fullFilename}  ➔  {errorMsg}</span>
                        </div>
                      )
                    }

                    return null
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
