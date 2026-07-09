/**
 * RestorePanel — the main right-hand content area.
 * Renders the 4 tool tabs: Restore Archive, EXIF Viewer, Comparison, Duplicates.
 */

import { useState } from "react"
import { FolderUp, HardDrive, Play, Square, Pause, Activity, Database, CheckCircle2, AlertCircle, AlertTriangle, Download, Eye, Layers, Copy, Lock, FileImage, FileJson, Search, Zap, Sparkles, ShieldCheck } from "lucide-react"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card"
import { Progress } from "../components/ui/progress"
import AdUnit from "../components/AdUnit"
import { getPlanCardStyles, type LogEntry } from "./useToolPipeline"
import type { ActiveSession } from "../lib/SessionManager"

interface RestorePanelProps {
  // Tool tab routing
  activeToolTab: 'restore' | 'viewer' | 'comparison' | 'duplicates'
  setActiveToolTab: (tab: 'restore' | 'viewer' | 'comparison' | 'duplicates') => void
  plan: string
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
// Super-tier gate: renders either `renderContent()` or an upgrade prompt
// ---------------------------------------------------------------------------
function SuperTierGate({
  plan,
  title,
  description,
  features,
  children,
}: {
  plan: string
  title: string
  description: string
  features: string[]
  children: React.ReactNode
}) {
  if (plan === 'super') return <>{children}</>

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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function RestorePanel({
  activeToolTab,
  setActiveToolTab,
  plan,
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
  zipMode,
  cancelProcessing,
  pauseProcessing,
  resumeProcessing,
  resetForNewRestore,
  setShowCompareModal,
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
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  return (
    <div className="flex-grow w-full lg:w-[72%] bg-black flex flex-col lg:h-full h-auto overflow-hidden order-1 lg:order-2">

      {/* ── Tab Header ────────────────────────────────────────────────── */}
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

          {/* Setup Grid */}
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
                        or drag &amp; drop your folder / ZIP file here
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
              <div className="mt-auto space-y-3">
                {/* Memory Limit Warning for Large Files */}
                {!isProcessing && progress === 0 && (takeoutFolder || zipFile) && (
                  <div className="p-2.5 rounded-lg border border-yellow-500/20 bg-yellow-500/[0.03] text-yellow-500/80 text-[9.5px] leading-relaxed flex gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-yellow-500">Notice on Large Media:</span> Browser tabs have strict memory limits. If you have single files larger than 1.5 GB, we highly recommend using our free desktop app to restore them natively without limits.
                    </div>
                  </div>
                )}

                {!isProcessing && progress === 0 && (takeoutFolder || zipFile) && (
                  <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-zinc-950/40 border border-white/5 text-[9.5px] text-zinc-400">
                    <input
                      type="checkbox"
                      id="agree-checkbox"
                      checked={agreedToTerms}
                      onChange={(e) => setAgreedToTerms(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-white/10 bg-zinc-900 text-white focus:ring-0 focus:ring-offset-0 cursor-pointer accent-zinc-800 mt-0.5 flex-shrink-0"
                    />
                    <label htmlFor="agree-checkbox" className="cursor-pointer select-none leading-relaxed">
                      I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-white underline hover:text-zinc-350 transition-colors">Terms of Service</a> and <a href="/refund" target="_blank" rel="noopener noreferrer" className="text-white underline hover:text-zinc-350 transition-colors">Refund Policy</a>.
                    </label>
                  </div>
                )}

                {!isProcessing && progress === 0 ? (
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
                {(stats.exifFailed ?? 0) > 0 && (
                  <button
                    onClick={() => setLogTab('exif')}
                    className={`pb-0.5 transition-all duration-150 relative cursor-pointer ${
                      logTab === 'exif' ? 'text-orange-400 border-b border-orange-500' : 'hover:text-zinc-350'
                    }`}
                  >
                    EXIF Skip ({stats.exifFailed})
                  </button>
                )}
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
                      if (logTab === 'skipped') return log.level === 'warn' && !log.action?.startsWith('Copied (EXIF');
                      if (logTab === 'exif') return log.action?.startsWith('Copied (EXIF') ?? false;
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
                        const isExifFail = log.action?.startsWith('Copied (EXIF');
                        return (
                          <div key={i} className={`pl-2 border-l py-0.5 whitespace-pre-wrap ${
                            isExifFail
                              ? 'text-orange-400/80 border-orange-500/20'
                              : 'text-yellow-400/80 border-yellow-500/20'
                          }`}>
                            <span className="font-bold mr-2">{isExifFail ? '[EXIF SKIP]' : '[UNMATCHED]'}</span>
                            <span>{fullFilename}{log.action ? `  ➜  ${log.action}` : ''}</span>
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

        {/* ── RESULTS BREAKDOWN + TRANSFER GUIDE (shown after run completes) ── */}
        {!isProcessing && stats.scanned > 0 && (
          <div className="border-t border-white/5 bg-black/60 px-5 py-4 space-y-3 flex-shrink-0">

            {/* Results Breakdown */}
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Results Breakdown</p>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div className="flex items-center gap-2 bg-emerald-500/5 border border-emerald-500/10 rounded-lg px-3 py-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span className="text-emerald-300 font-semibold tabular-nums">{stats.matched.toLocaleString()}</span>
                  <span className="text-zinc-400 truncate">Fully Restored</span>
                </div>
                <div className="flex items-center gap-2 bg-yellow-500/5 border border-yellow-500/10 rounded-lg px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
                  <span className="text-yellow-300 font-semibold tabular-nums">{stats.unmatched.toLocaleString()}</span>
                  <span className="text-zinc-400 truncate">No Sidecar</span>
                </div>
                {(stats.exifFailed ?? 0) > 0 && (
                  <div className="flex items-center gap-2 bg-orange-500/5 border border-orange-500/10 rounded-lg px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                    <span className="text-orange-300 font-semibold tabular-nums">{(stats.exifFailed ?? 0).toLocaleString()}</span>
                    <span className="text-zinc-400 truncate">EXIF Unsupported</span>
                  </div>
                )}
                {stats.errors > 0 && (
                  <div className="flex items-center gap-2 bg-red-500/5 border border-red-500/10 rounded-lg px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    <span className="text-red-300 font-semibold tabular-nums">{stats.errors.toLocaleString()}</span>
                    <span className="text-zinc-400 truncate">Failed</span>
                  </div>
                )}
              </div>
            </div>

            {/* Transfer Guide */}
            <details className="group">
              <summary className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest cursor-pointer hover:text-zinc-300 transition-colors select-none list-none">
                <Zap className="w-3 h-3 group-open:text-indigo-400 transition-colors" />
                <span>Transfer Guide</span>
                <span className="ml-auto text-zinc-700 group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <div className="mt-2.5 space-y-1.5 text-[11px]">
                <div className="flex items-start gap-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10 px-3 py-2">
                  <span className="text-emerald-400 mt-0.5 flex-shrink-0">✓</span>
                  <span className="text-zinc-300"><span className="font-semibold text-white">Best:</span> Upload to Google Photos or iCloud — both read EXIF automatically, ignoring file system dates.</span>
                </div>
                <div className="flex items-start gap-2 rounded-lg bg-amber-500/5 border border-amber-500/10 px-3 py-2">
                  <span className="text-amber-400 mt-0.5 flex-shrink-0">⚠</span>
                  <span className="text-zinc-300"><span className="font-semibold text-white">Avoid MTP (Android):</span> "File Transfer" mode resets file dates. Use Google Photos backup or ADB push instead.</span>
                </div>
                <div className="flex items-start gap-2 rounded-lg bg-zinc-800/60 border border-white/5 px-3 py-2">
                  <span className="text-zinc-400 mt-0.5 flex-shrink-0">ℹ</span>
                  <span className="text-zinc-300"><span className="font-semibold text-white">USB Drives:</span> Use exFAT or NTFS — FAT32 has 2-second timestamp rounding and no timezone info.</span>
                </div>
                <div className="flex items-start gap-2 rounded-lg bg-zinc-800/60 border border-white/5 px-3 py-2">
                  <span className="text-zinc-400 mt-0.5 flex-shrink-0">ℹ</span>
                  <span className="text-zinc-300"><span className="font-semibold text-white">Windows Explorer:</span> Sort by "Date Taken" column, not "Date Modified" — Date Taken reads EXIF directly.</span>
                </div>
              </div>
            </details>

          </div>
        )}

        </>
      )}

      {/* ── EXIF VIEWER TAB ───────────────────────────────────────────── */}
      {activeToolTab === 'viewer' && (
        <SuperTierGate
          plan={plan}
          title="Visual EXIF Viewer"
          description="Gain deeper diagnostic insights into individual media files by inspecting their underlying EXIF structure locally."
          features={["Read Camera make, model, & software parameters", "Inspect Date & Time metadata headers", "Resolve Latitude, Longitude, and Altitude GPS coordinates", "100% Offline security"]}
        >
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
                      <span className="text-[11px] text-zinc-400 block">Drag &amp; Drop or click to browse JPEG</span>
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
                        {Object.entries(viewerExif.fileInfo as Record<string, unknown>).map(([k, v]) => (
                          <div key={k} className="flex justify-between border-b border-white/5 pb-1.5 last:border-0 last:pb-0">
                            <span className="text-zinc-500">{k}</span>
                            <span className="text-zinc-300 truncate max-w-[150px]">{String(v)}</span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    <Card className="bg-white/[0.01] border-white/5">
                      <CardHeader className="pb-2 border-b border-white/5 bg-black/20 p-3">
                        <CardTitle className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Camera EXIF Tags</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-3 space-y-2 font-mono text-[10px] p-3">
                        {Object.keys(viewerExif.cameraInfo as Record<string, unknown>).length > 0 ? (
                          Object.entries(viewerExif.cameraInfo as Record<string, unknown>).map(([k, v]) => (
                            <div key={k} className="flex justify-between border-b border-white/5 pb-1.5 last:border-0 last:pb-0">
                              <span className="text-zinc-500">{k}</span>
                              <span className="text-zinc-300 truncate max-w-[150px]">{String(v)}</span>
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
                        {Object.keys(viewerExif.gpsInfo as Record<string, unknown>).length > 0 ? (
                          Object.entries(viewerExif.gpsInfo as Record<string, unknown>).map(([k, v]) => (
                            <div key={k} className="flex justify-between border-b border-white/5 pb-1.5 last:border-0 last:pb-0">
                              <span className="text-zinc-500">{k}</span>
                              <span className="text-rose-300">{String(v)}</span>
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
        </SuperTierGate>
      )}

      {/* ── COMPARISON TAB ────────────────────────────────────────────── */}
      {activeToolTab === 'comparison' && (
        <SuperTierGate
          plan={plan}
          title="Metadata Comparison"
          description="Perform side-by-side matches of image binary fields and sidecar JSON data before importing to check accuracy."
          features={["Compare local image name vs sidecar title", "Evaluate embedded EXIF date vs JSON formatted taken time", "Cross check GPS coordinates and tags", "Diagnose synchronization mismatches"]}
        >
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
                            <span className="text-zinc-300 truncate max-w-[150px]">{String((compResult.media as any).name)}</span>
                          </div>
                          <div className="flex justify-between border-b border-white/5 pb-1.5">
                            <span className="text-zinc-500">EXIF Date</span>
                            <span className="text-zinc-300 truncate max-w-[150px]">{String((compResult.media as any).date)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">EXIF GPS</span>
                            <span className="text-zinc-350 truncate max-w-[150px]">{String((compResult.media as any).gps)}</span>
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
                            <span className="text-zinc-300 truncate max-w-[150px]">{String((compResult.json as any).title)}</span>
                          </div>
                          <div className="flex justify-between border-b border-white/5 pb-1.5">
                            <span className="text-zinc-500">Taken Time</span>
                            <span className="text-zinc-300 truncate max-w-[150px]">{String((compResult.json as any).time)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">JSON GPS</span>
                            <span className="text-zinc-300 truncate max-w-[150px]">{String((compResult.json as any).gps)}</span>
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
                            (compResult.checks as any).fileNameMatch
                              ? 'bg-white/10 text-white border border-white/20'
                              : 'bg-zinc-800/30 text-zinc-400 border border-zinc-750'
                          }`}>
                            {(compResult.checks as any).fileNameMatch ? "ASSOCIATED" : "MISMATCHED"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                          <span className="text-zinc-300">EXIF Timestamp Synchronized</span>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                            (compResult.checks as any).dateMatch
                              ? 'bg-white/10 text-white border border-white/20'
                              : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
                          }`}>
                            {(compResult.checks as any).dateMatch ? "EXISTS IN FILE" : "INJECTED ON WRITE"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-zinc-350 font-bold text-[9px]">GPS Coordinates Synchronized</span>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                            (compResult.checks as any).gpsMatch
                              ? 'bg-white/10 text-white border border-white/20'
                              : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
                          }`}>
                            {(compResult.checks as any).gpsMatch ? "EXISTS IN FILE" : "INJECTED ON WRITE"}
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
        </SuperTierGate>
      )}

      {/* ── DUPLICATES TAB ────────────────────────────────────────────── */}
      {activeToolTab === 'duplicates' && (
        <SuperTierGate
          plan={plan}
          title="Duplicate Space Analyzer"
          description="Scan local Takeout folders to identify byte-identical duplicate files and reclaim storage."
          features={["Detect byte-exact identical duplicate groups", "Spot conflicting renamed files e.g. photo(1).jpg", "Calculate exact storage space reclaimable in megabytes", "Recursive main-thread scanner"]}
        >
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
                          dupGroups.map((g: any, idx) => (
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
        </SuperTierGate>
      )}

    </div>
  )
}
