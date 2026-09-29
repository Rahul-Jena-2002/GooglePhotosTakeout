/**
 * RestorePanel — the main right-hand content area.
 * Renders the 4 tool tabs: Restore Archive, EXIF Viewer, Comparison, Duplicates.
 */

import { useState, useMemo, useRef, useEffect } from "react"
import { FolderUp, HardDrive, Play, Square, Pause, Activity, Database, CheckCircle2, AlertCircle, AlertTriangle, Download, Eye, Layers, Copy, Lock, FileImage, FileJson, Search, Zap, Sparkles, ShieldCheck, RotateCcw, ChevronDown, FolderTree, Scale, Sliders } from "lucide-react"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card"
import { Progress } from "../components/ui/progress"
import AdUnit from "../components/monetization/AdUnit"
import { type LogEntry, type ToolTab } from "./useToolPipeline"
import type { ActiveSession } from "../lib/SessionManager"
import { usePersistentHandles } from "../hooks/usePersistentHandles"
import { useSettingsStore } from "../store/useSettingsStore"
import { useAuth } from "../contexts/AuthContext"
import { downloadSyncScript, downloadSyncBat } from "../services/restoration/WindowsDateSyncScript"
import { PhotoStudioPanel } from "./PhotoStudioPanel"
import { PhotoVaultPanel } from "./PhotoVaultPanel"
import { FolderFlowPanel } from "./FolderFlowPanel"
import { ExifViewerPanel } from "./ExifViewerPanel"
import { ComparisonPanel } from "./ComparisonPanel"
import { DuplicateHunterPanel } from "./DuplicateHunterPanel"

interface RestorePanelProps {
  // Tool tab routing
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
  // Folder/zip state
  takeoutFolder: FileSystemDirectoryHandle | null
  outputFolder: FileSystemDirectoryHandle | null
  zipFile: File | null
  setZipFile: (f: File | null) => void
  setTakeoutFolder: (h: FileSystemDirectoryHandle | null) => void
  isDragOver: boolean
  // Processing state
  isProcessing: boolean
  isPaused: boolean
  progress: number
  stats: { scanned: number; matched: number; unmatched: number; exifFailed: number; errors: number; total: number }
  logs: LogEntry[]
  logTab: 'all' | 'restored' | 'errors' | 'skipped' | 'exif'
  setLogTab: (tab: 'all' | 'restored' | 'errors' | 'skipped' | 'exif') => void
  logContainerRef: React.RefObject<HTMLDivElement>
  getEstimatedRestoreTime: () => string
  // Pending session
  pendingSession: ActiveSession | null
  setPendingSession: (s: ActiveSession | null) => void
  sessionManagerRef: React.MutableRefObject<any>
  // Drag handlers
  handleDragOver: (e: React.DragEvent) => void
  handleDragLeave: () => void
  handleDrop: (e: React.DragEvent) => void
  // Action handlers
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
  // EXIF Viewer
  viewerFile: File | null
  viewerExif: Record<string, unknown> | null
  viewerLoading: boolean
  handleViewerFileChange: (file: File) => void
  // Comparison
  compMediaFile: File | null
  compJsonFile: File | null
  compResult: Record<string, unknown> | null
  handleCompFilesChange: (media: File | null, json: File | null) => void
  // Duplicates
  dupFolder: FileSystemDirectoryHandle | null
  dupIsScanning: boolean
  dupStats: { scanned: number; duplicates: number; savedBytes: number }
  dupGroups: Record<string, unknown>[]
  dupScanStatus: string
  handleSelectDupFolder: () => void
  startDuplicateScan: () => void
}


// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function RestorePanel({
  activeToolTab,
  setActiveToolTab,
  plan,
  unlockFreeFeatures = true,
  tierThresholds,
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
  viewerFile,
  viewerExif,
  viewerLoading,
  handleViewerFileChange,
  compMediaFile,
  compJsonFile,
  compResult,
  handleCompFilesChange,
  dupFolder,
  dupIsScanning,
  dupStats,
  dupGroups,
  dupScanStatus,
  handleSelectDupFolder,
  startDuplicateScan,
}: RestorePanelProps) {
  const { enablePricingAndPayments } = useAuth();
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showPrestartGuide, setShowPrestartGuide] = useState(false);
  const organizeYearMonth = useSettingsStore((s) => s.organizeYearMonth);
  const setOrganizeYearMonth = useSettingsStore((s) => s.setOrganizeYearMonth);
  const generateSyncScript = useSettingsStore((s) => s.generateSyncScript);
  const setGenerateSyncScript = useSettingsStore((s) => s.setGenerateSyncScript);

  // Persistent handle restore — auto-re-grants on tab reopen (VS Code model)
  const { needsReGrant, storedFolderName, reGrantState, reGrantAccess } = usePersistentHandles()

  // When re-grant succeeds, push handles into tool state
  const handleReGrantBanner = async () => {
    const handles = await reGrantAccess()
    if (handles?.takeout) setTakeoutFolder(handles.takeout)
    if (handles?.output) {
      // outputFolder setter lives in useToolStore — dispatch via pipeline
      // (RestorePanel receives setTakeoutFolder but not setOutputFolder — use window event)
      window.dispatchEvent(new CustomEvent('takeoutfix-restore-output', { detail: handles.output }))
    }
  }

  // Deduplicate and filter logs ("dont do multiple")
  // Each file has a unique key: `${path.join('/')}/${filename}`.
  // Later entries overwrite earlier ones so each file appears exactly once with its final status.
  const dedupedLogs = useMemo(() => {
    const map = new Map<string, LogEntry>();
    for (const log of logs) {
      if (log.filename) {
        const key = `${log.path ? log.path.join('/') + '/' : ''}${log.filename}`;
        map.set(key, log);
      } else if (log.msg) {
        map.set(`msg-${log.msg}`, log);
      }
    }
    return Array.from(map.values());
  }, [logs]);

  const restoredLogs = useMemo(() => dedupedLogs.filter(l => l.level === 'success'), [dedupedLogs]);
  const errorLogs = useMemo(() => dedupedLogs.filter(l => l.level === 'error'), [dedupedLogs]);
  const skippedLogs = useMemo(() => dedupedLogs.filter(l => {
    const isExif = l.action?.startsWith('Copied (EXIF') || l.action?.includes('Meta fallback') || l.action?.includes('piexif');
    return l.level === 'warn' && !isExif;
  }), [dedupedLogs]);
  const fallbackLogs = useMemo(() => dedupedLogs.filter(l => {
    return l.action?.startsWith('Copied (EXIF') || l.action?.includes('Meta fallback') || l.action?.includes('piexif');
  }), [dedupedLogs]);

  const currentDisplayLogs = useMemo(() => {
    if (logTab === 'restored') return restoredLogs;
    if (logTab === 'errors') return errorLogs;
    if (logTab === 'skipped') return skippedLogs;
    if (logTab === 'exif') return fallbackLogs;
    return dedupedLogs;
  }, [logTab, dedupedLogs, restoredLogs, errorLogs, skippedLogs, fallbackLogs]);

  // Tool menu dropdown state & outside click handler
  const [toolMenuOpen, setToolMenuOpen] = useState(false)
  const toolMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (toolMenuRef.current && !toolMenuRef.current.contains(event.target as Node)) {
        setToolMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const TOOLS_LIST: { id: ToolTab; name: string; tag: string; icon: any; desc: string; badge?: string }[] = [
    { id: 'restore', name: 'TakeoutFix', tag: 'Metadata Restorer', icon: <Layers className="w-4 h-4 text-indigo-400" />, desc: 'Google Photos JSON metadata injector & sidecar merger', badge: 'Core' },
    { id: 'studio', name: 'Photo Studio', tag: 'Batch EXIF Suite', icon: <Sliders className="w-4 h-4 text-purple-400" />, desc: 'Batch shift dates, timezones, and stamp creator presets', badge: 'New' },
    { id: 'photovault', name: 'PhotoVault', tag: 'Backup Verifier', icon: <ShieldCheck className="w-4 h-4 text-emerald-400" />, desc: 'Bit-for-bit SHA-256 backup audit & certificate generator', badge: 'New' },
    { id: 'folderflow', name: 'FolderFlow', tag: 'Media Organizer', icon: <FolderTree className="w-4 h-4 text-violet-400" />, desc: 'Chronologically sort photos into Year/Month folder trees' },
    { id: 'viewer', name: 'EXIF Inspector', tag: 'Metadata Viewer', icon: <Eye className="w-4 h-4 text-sky-400" />, desc: 'Deep camera IFD, exposure tags, and GPS coordinates' },
    { id: 'comparison', name: 'Comparator', tag: 'Sidecar Diff', icon: <Scale className="w-4 h-4 text-amber-400" />, desc: 'Compare Google Takeout JSON sidecar vs image EXIF' },
    { id: 'duplicates', name: 'Duplicate Hunter', tag: 'Space Reclaimer', icon: <Copy className="w-4 h-4 text-rose-400" />, desc: 'Find duplicate photos & reclaim gigabytes of storage' },
  ]

  const currentTool = TOOLS_LIST.find(t => t.id === activeToolTab) || TOOLS_LIST[0]

  return (
    <div className="flex-grow w-full lg:w-[72%] bg-black flex flex-col h-auto order-1 lg:order-2">

      {/* ── Persistent Handle Re-grant Banner (VS Code model) ──────────── */}
      {needsReGrant && !takeoutFolder && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-indigo-950/60 border-b border-indigo-500/20 text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <FolderUp className="w-4 h-4 text-indigo-400 flex-shrink-0" />
            <span className="text-zinc-300 truncate">
              Previous workspace{storedFolderName ? <> — <strong className="text-white">{storedFolderName}</strong></> : ''} needs access to resume.
            </span>
          </div>
          <button
            onClick={handleReGrantBanner}
            disabled={reGrantState === 'granting'}
            className="flex items-center gap-1.5 flex-shrink-0 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-bold transition-all"
          >
            {reGrantState === 'granting'
              ? <><RotateCcw className="w-3 h-3 animate-spin" /> Restoring...</>
              : 'Re-grant Access'}
          </button>
        </div>
      )}

      {/* ── Studio Header with Multi-Tool Dropdown Switcher ────────────────── */}
      <div className="p-3 sm:p-4 border-b border-white/5 bg-white/[0.01] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Interactive Tool Switcher Dropdown */}
          <div className="relative" ref={toolMenuRef}>
            <button
              onClick={() => setToolMenuOpen(!toolMenuOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/80 text-white font-semibold text-xs transition-all shadow-sm cursor-pointer"
              title="Click to switch tool"
            >
              <span className="flex items-center gap-2">
                {currentTool.icon}
                <span className="font-bold text-sm text-white">{currentTool.name}</span>
                <span className="text-[10px] text-zinc-400 font-normal hidden sm:inline">• {currentTool.tag}</span>
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${toolMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {toolMenuOpen && (
              <div className="absolute left-0 top-full mt-2 w-80 bg-zinc-950/95 border border-zinc-800 rounded-2xl p-2 shadow-2xl backdrop-blur-2xl z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="px-3 py-1.5 text-[10px] font-bold font-mono uppercase tracking-wider text-zinc-500 border-b border-zinc-800 mb-1 flex items-center justify-between">
                  <span>Available Tools</span>
                  <span className="text-emerald-400">100% Offline</span>
                </div>
                <div className="space-y-1">
                  {TOOLS_LIST.map((tool) => (
                    <button
                      key={tool.id}
                      onClick={() => {
                        setActiveToolTab(tool.id)
                        setToolMenuOpen(false)
                      }}
                      className={`w-full flex items-start gap-2.5 p-2 rounded-xl text-left transition-colors cursor-pointer ${
                        activeToolTab === tool.id
                          ? 'bg-zinc-900 text-white border border-zinc-800'
                          : 'text-zinc-300 hover:bg-zinc-900/60 hover:text-white'
                      }`}
                    >
                      <div className="p-1.5 rounded-lg bg-black border border-zinc-800 flex-shrink-0 mt-0.5">
                        {tool.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">{tool.name}</span>
                          {tool.badge && (
                            <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold">
                              {tool.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-400 truncate mt-0.5">{tool.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Quick desktop switcher pills */}
          <div className="hidden xl:flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800/80 text-xs">
            {TOOLS_LIST.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveToolTab(t.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                  activeToolTab === t.id
                    ? 'bg-zinc-800 text-white shadow-xs font-bold'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900/50'
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold shadow-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          Free &amp; Offline
        </div>
      </div>

      {/* ── Banners (resumption + compat) ─────────────────────────────── */}
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

      {/* ── RESTORE ARCHIVE TAB ───────────────────────────────────────── */}
      {activeToolTab === 'restore' && (
        <>
          <div className="flex-grow flex flex-col overflow-hidden">

          {/* Setup Grid: 2 balanced rows aligned across 3 columns */}
          {/* Setup Grid: Left 2 columns for Source & Destination, Right 1 column for Actions & Options */}
          <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4 border-b border-white/5 bg-white/[0.005]">
            {/* Left 2 Columns: Source & Destination cards stacked neatly */}
            <div className="lg:col-span-2 space-y-3 flex flex-col justify-between">
              {/* 1. Source Card */}
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
                        or drag &amp; drop your folder / ZIP file here
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 2. Destination Card */}
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
                    <div className="space-y-1.5">
                      <div className="p-2 bg-zinc-800/10 border border-zinc-800/25 rounded flex justify-between items-center text-zinc-400 text-[10px]">
                        <span className="font-mono truncate mr-2">{outputFolder.name}</span>
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                      </div>
                      <div className="flex items-center justify-between text-[9px] px-0.5">
                        <span className="text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Output Ready
                        </span>
                        <button
                          type="button"
                          onClick={() => downloadSyncScript()}
                          className="text-zinc-400 hover:text-white underline cursor-pointer flex items-center gap-1 transition-colors"
                        >
                          <Download className="w-2.5 h-2.5" /> Download sync script (.bat / .sh)
                        </button>
                      </div>
                    </div>
                  ) : (
                    <Button onClick={handleSelectOutput} className="btn-monochrome-primary w-full rounded px-3 py-1.5 transition-all duration-150 cursor-pointer text-[10px] h-8">
                      Browse Output Directory
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right 1 Column: Start & Download Buttons, Checkboxes, Progress */}
            <div className="lg:col-span-1 flex flex-col justify-between">
              <div className="space-y-2.5 w-full">
                {/* Memory Limit Warning for Large Files */}
                {!isProcessing && progress === 0 && (
                  <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-200 text-[9.5px] leading-relaxed flex gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-amber-800 dark:text-amber-300">Notice on Large Media:</span> Browser tabs have strict memory limits. If you have single files larger than 1.5 GB, we highly recommend using our free desktop app to restore them natively without limits.
                    </div>
                  </div>
                )}

                {!isProcessing && progress === 0 && (
                  <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-zinc-950/40 border border-white/5 text-[9.5px] text-zinc-300">
                    <input
                      type="checkbox"
                      id="organize-ym-checkbox"
                      checked={organizeYearMonth}
                      onChange={(e) => setOrganizeYearMonth(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-white/10 bg-zinc-900 text-white focus:ring-0 focus:ring-offset-0 cursor-pointer accent-zinc-800 flex-shrink-0"
                    />
                    <label htmlFor="organize-ym-checkbox" className="cursor-pointer select-none leading-relaxed">
                      Organize restored output into clean <strong className="text-white font-medium">Year/Month folders</strong> (YYYY/YYYY-MM)
                    </label>
                  </div>
                )}


                {!isProcessing && progress === 0 && (
                  <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-zinc-950/40 border border-white/5 text-[9.5px] text-zinc-400">
                    <input
                      type="checkbox"
                      id="agree-checkbox"
                      checked={agreedToTerms}
                      onChange={(e) => setAgreedToTerms(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-white/10 bg-zinc-900 text-white focus:ring-0 focus:ring-offset-0 cursor-pointer accent-zinc-800 mt-0.5 flex-shrink-0"
                    />
                    <label htmlFor="agree-checkbox" className="cursor-pointer select-none leading-relaxed">
                      I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-white underline hover:text-zinc-350 transition-colors">Terms of Service</a>
                      {enablePricingAndPayments ? (
                        <> and <a href="/refund" target="_blank" rel="noopener noreferrer" className="text-white underline hover:text-zinc-350 transition-colors">Refund Policy</a></>
                      ) : null}.
                    </label>
                  </div>
                )}

                {/* What to do before starting & Windows timestamp sync guide */}
                {!isProcessing && progress === 0 && (
                  <div className="text-[9px] text-zinc-400 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setShowPrestartGuide(!showPrestartGuide)}
                      className="text-zinc-400 hover:text-white transition-colors flex items-center gap-1 font-semibold cursor-pointer select-none"
                    >
                      <Zap className="w-3 h-3 text-indigo-400" />
                      <span>{showPrestartGuide ? 'Hide' : 'Show'} Guide: OS Timestamps &amp; Folder vs ZIP</span>
                      <span className="text-[10px]">{showPrestartGuide ? '▴' : '▾'}</span>
                    </button>
                    {showPrestartGuide && (
                      <div className="mt-2 p-2.5 rounded-lg bg-zinc-900/60 border border-white/10 space-y-1.5 text-[9px] leading-relaxed text-zinc-350">
                        <div>
                          <strong className="text-white">Why videos are QuickTime &amp; photos have deep EXIF:</strong> Photos store metadata in EXIF headers (DateTimeOriginal, GPS). Videos use standard ISO QuickTime atoms (mvhd/tkhd) for encoded creation times.
                        </div>
                        <div>
                          <strong className="text-white">Why File Explorer / Finder shows today's date:</strong> Browsers cannot directly modify OS filesystem timestamps due to sandbox security. Double-clicking the generated <span className="text-emerald-400 font-mono">sync_windows_dates.bat</span> (Windows) or running <span className="text-emerald-400 font-mono">sync_macos_linux.sh</span> (Mac/Linux) in your output folder syncs file modified dates in 2 seconds!
                        </div>
                        <div>
                          <strong className="text-white">Download as ZIP:</strong> The ZIP method stores taken timestamps directly into the zip archive headers. Extracting it on Windows/Mac automatically sets the modified date without needing any script.
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!isProcessing && progress > 0 ? (
                  <div className="space-y-2.5 p-3 rounded-lg bg-emerald-500/[0.05] border border-emerald-500/20">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        Restoration Complete
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400/80">100%</span>
                    </div>
                    <p className="text-[9.5px] text-zinc-400 leading-relaxed">
                      All media files have been processed. Deep EXIF and QuickTime metadata were injected into your files.
                    </p>
                    <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-[9.5px] text-emerald-300 dark:text-emerald-300 leading-relaxed">
                      <strong>Important Next Step:</strong> Open your output folder and double-click <span className="font-mono text-white bg-black/40 px-1 py-0.5 rounded">sync_windows_dates.bat</span> (Windows) or run <span className="font-mono text-white bg-black/40 px-1 py-0.5 rounded">sync_macos_linux.sh</span> (Mac/Linux) to sync File Explorer / Finder folder dates in 2 seconds.
                    </div>
                    <div className="flex flex-col gap-1.5 pt-1">
                      <Button
                        onClick={() => downloadSyncScript()}
                        className="btn-monochrome-secondary w-full h-8 text-[10px] rounded font-semibold cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Zap className="w-3.5 h-3.5 text-amber-400" /> Download Timestamp Sync Script (.bat / .sh)
                      </Button>
                      <Button
                        onClick={resetForNewRestore}
                        className="btn-monochrome-primary w-full h-8 text-[10px] rounded font-semibold cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Start Another Restoration
                      </Button>
                    </div>
                  </div>
                ) : !isProcessing && progress === 0 ? (
                  <div className="space-y-2">
                    <Button
                      disabled={!(takeoutFolder || zipFile) || !outputFolder || !agreedToTerms}
                      onClick={() => startProcessing(false)}
                      className="btn-monochrome-primary w-full h-9 text-[11px] rounded-lg font-bold transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" /> Start Restore (Folder)
                    </Button>
                    <Button
                      disabled={!(takeoutFolder || zipFile) || !agreedToTerms}
                      onClick={() => startProcessing(true)}
                      className="btn-monochrome-secondary w-full h-9 text-[11px] rounded-lg font-bold transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
                    >
                      <Download className="w-3.5 h-3.5 fill-current" /> Download as ZIP
                    </Button>
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

          {/* In-Workspace Responsive Ad Unit */}
          <div className="px-4 py-2 bg-black/40 border-b border-white/5">
            <AdUnit type="horizontal" placement="TOOL_RESTORE_TOP" />
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
                    {getEstimatedRestoreTime().replace(/^⏱️\s*(Est\. restoration time:\s*)?/, '')}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4 text-[10px] font-bold text-zinc-500">
                <button
                  onClick={() => setLogTab('all')}
                  className={`pb-0.5 transition-all duration-150 relative cursor-pointer ${
                    logTab === 'all' ? 'text-zinc-900 dark:text-white border-b-2 border-[#8170CC] font-bold' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-350'
                  }`}
                >
                  All ({dedupedLogs.length})
                </button>
                <button
                  onClick={() => setLogTab('restored')}
                  className={`pb-0.5 transition-all duration-150 relative cursor-pointer ${
                    logTab === 'restored' ? 'text-emerald-600 dark:text-green-400 border-b-2 border-emerald-500 dark:border-green-500 font-bold' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-350'
                  }`}
                >
                  Restored ({restoredLogs.length})
                </button>
                <button
                  onClick={() => setLogTab('errors')}
                  className={`pb-0.5 transition-all duration-150 relative cursor-pointer ${
                    logTab === 'errors' ? 'text-rose-600 dark:text-red-400 border-b-2 border-rose-500 dark:border-red-500 font-bold' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-350'
                  }`}
                >
                  Errors ({errorLogs.length})
                </button>
                <button
                  onClick={() => setLogTab('skipped')}
                  className={`pb-0.5 transition-all duration-150 relative cursor-pointer ${
                    logTab === 'skipped' ? 'text-amber-600 dark:text-yellow-400 border-b-2 border-amber-500 dark:border-yellow-500 font-bold' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-350'
                  }`}
                >
                  Skipped ({skippedLogs.length})
                </button>
                {fallbackLogs.length > 0 && (
                  <button
                    onClick={() => setLogTab('exif')}
                    className={`pb-0.5 transition-all duration-150 relative cursor-pointer ${
                      logTab === 'exif' ? 'text-amber-600 dark:text-amber-400 border-b-2 border-amber-500 font-bold' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-350'
                    }`}
                  >
                    Fallback ({fallbackLogs.length})
                  </button>
                )}
              </div>
            </div>

            <div ref={logContainerRef} className="flex-grow bg-black dark:bg-black p-6 overflow-y-auto font-mono text-[11px] leading-[1.6]">
              {currentDisplayLogs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-zinc-500 dark:text-white/20 italic">
                  {logTab === 'all' ? 'Awaiting telemetry...' : `No ${logTab} logs recorded.`}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {currentDisplayLogs.map((log, i) => {
                    if (log.msg) {
                      return <div key={i} className="text-zinc-600 dark:text-zinc-400/90 border-l-2 border-zinc-400 dark:border-zinc-700 pl-2 my-2">{log.msg}</div>
                    }

                    const pathStr = log.path ? `/${log.path.join('/')}/` : ''
                    const fullFilename = `${pathStr}${log.filename}`

                    if (log.level === 'success') {
                      const actionLabel = log.action && log.action !== 'Restored' ? ` (${log.action})` : '';
                      return (
                        <div key={i} className="text-emerald-700 dark:text-green-400/90 pl-2 border-l border-emerald-500/30 dark:border-green-500/20 py-0.5 whitespace-pre-wrap">
                          <span className="font-bold mr-2">[RESTORED] </span>
                          <span>{fullFilename}{actionLabel}</span>
                        </div>
                      )
                    } else if (log.level === 'warn') {
                      const isExifFail = log.action?.startsWith('Copied (EXIF') || log.action?.includes('Meta fallback') || log.action?.includes('piexif');
                      return (
                        <div key={i} className={`pl-2 border-l py-0.5 whitespace-pre-wrap ${
                          isExifFail
                            ? 'text-amber-700 dark:text-amber-400/90 border-amber-500/30 dark:border-amber-500/20'
                            : 'text-amber-800 dark:text-yellow-400/80 border-amber-500/30 dark:border-yellow-500/20'
                        }`}>
                          <span className="font-bold mr-2">{isExifFail ? '[EXIF FALLBACK]' : '[UNMATCHED]'}</span>
                          <span>{fullFilename}{log.action ? `  ➜  ${log.action}` : ''}</span>
                        </div>
                      )
                    } else if (log.level === 'error') {
                      const errorMsg = log.action ? log.action.replace(/^Error:\s*/i, '') : 'Unknown error';
                      return (
                        <div key={i} className="text-rose-700 dark:text-red-400 pl-2 border-l border-rose-500/30 dark:border-red-500/20 py-0.5 whitespace-pre-wrap">
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

        </>
      )}

      {/* ── PHOTO STUDIO BATCH EXIF SUITE TAB ───────────────────────── */}
      {activeToolTab === 'studio' && <PhotoStudioPanel />}

      {/* ── PHOTOVAULT BACKUP VERIFIER TAB ───────────────────────────── */}
      {activeToolTab === 'photovault' && <PhotoVaultPanel />}

      {/* ── FOLDERFLOW MEDIA ORGANIZER TAB ──────────────────────────── */}
      {activeToolTab === 'folderflow' && <FolderFlowPanel />}

      {/* ── EXIF & GPS INSPECTOR TAB ─────────────────────────────────── */}
      {activeToolTab === 'viewer' && (
        <ExifViewerPanel
          viewerFile={viewerFile}
          viewerExif={viewerExif}
          viewerLoading={viewerLoading}
          handleViewerFileChange={handleViewerFileChange}
        />
      )}

      {/* ── METADATA COMPARATOR TAB ──────────────────────────────────── */}
      {activeToolTab === 'comparison' && (
        <ComparisonPanel
          compMediaFile={compMediaFile}
          compJsonFile={compJsonFile}
          compResult={compResult}
          handleCompFilesChange={handleCompFilesChange}
        />
      )}

      {/* ── DUPLICATE MEDIA HUNTER TAB ───────────────────────────────── */}
      {activeToolTab === 'duplicates' && (
        <DuplicateHunterPanel
          dupFolder={dupFolder}
          dupIsScanning={dupIsScanning}
          dupStats={dupStats}
          dupGroups={dupGroups}
          dupScanStatus={dupScanStatus}
          handleSelectDupFolder={handleSelectDupFolder}
          startDuplicateScan={startDuplicateScan}
        />
      )}

    </div>
  )
}

