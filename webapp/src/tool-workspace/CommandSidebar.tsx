/**
 * CommandSidebar — left dashboard panel.
 * Clean, senior-level UI: volume, progress, restoration stats counters, and privacy status.
 */
import { Activity, HardDrive, Database, CheckCircle2, AlertCircle, XCircle, ShieldCheck } from "lucide-react"
import { Progress } from "../components/ui/progress"
import AdUnit from "../components/monetization/AdUnit"
import { Button } from "../components/ui/button"

interface CommandSidebarProps {
  plan: string
  tierThresholds?: any
  isFreePromoActive?: boolean
  limitFiles: number
  limitBytes: number
  currentUsedFiles: number
  currentUsedBytes: number
  sessionFiles: number
  sessionBytes: number
  formatByteSize: (bytes: number) => string
  stats: { scanned: number; matched: number; unmatched: number; exifFailed: number; errors: number; total: number }
  isProcessing: boolean
  isPaused: boolean
  useDeepExif?: boolean
  maxWorkers?: number
  telemetryCpu?: number
  telemetryMem?: number
  telemetryTabHeap?: number
  telemetryWorkers?: number
  userData?: any
  resetUserQuota?: () => Promise<void>
}

export function CommandSidebar({
  plan,
  currentUsedBytes,
  sessionFiles,
  sessionBytes,
  formatByteSize,
  stats,
  isProcessing,
  isPaused,
}: CommandSidebarProps) {
  return (
    <div className="w-full lg:w-[28%] lg:min-w-[340px] p-4 border-t lg:border-t-0 lg:border-r border-zinc-200 dark:border-white/5 bg-zinc-50/60 dark:bg-black/40 flex flex-col h-auto order-2 lg:order-1 transition-colors">

      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-sm font-bold tracking-wider text-zinc-900 dark:text-white flex items-center gap-1.5 uppercase">
          <Activity className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
          Dashboard
        </h1>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
          isProcessing
            ? isPaused
              ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
              : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400 animate-pulse'
            : 'bg-zinc-200/60 dark:bg-zinc-500/10 border-zinc-300 dark:border-zinc-500/20 text-zinc-600 dark:text-zinc-400'
        }`}>
          {isProcessing ? (isPaused ? 'PAUSED' : 'PROCESSING') : 'READY'}
        </span>
      </div>

      {/* Processing Volume & Status */}
      <div className="space-y-2 mb-4 bg-white dark:bg-white/[0.02] border border-zinc-200 dark:border-white/5 p-3.5 rounded-xl shadow-xs">
        <div className="flex justify-between items-center text-[10px] text-zinc-500 dark:text-zinc-400 font-semibold uppercase tracking-wider">
          <span className="flex items-center gap-1.5"><HardDrive className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Status</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[10px] bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            Ready
          </span>
        </div>
        <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-150 flex items-center justify-between pt-1">
          <span>Processed Volume</span>
          <span className="font-mono text-zinc-700 dark:text-zinc-300">
            {plan === 'guest'
              ? `${formatByteSize(currentUsedBytes + sessionBytes)} / 1.0 GB`
              : `${formatByteSize(sessionBytes)} (${sessionFiles.toLocaleString()} files)`}
          </span>
        </div>
        {plan === 'guest' && (
          <div className="space-y-1 pt-1">
            <Progress
              value={Math.min(100, (((currentUsedBytes + sessionBytes) / (1024 * 1024 * 1024)) * 100))}
              className="h-1.5 bg-zinc-200 dark:bg-white/10"
            />
            <div className="flex justify-between text-[9px] text-zinc-500 dark:text-zinc-400 font-medium">
              <span>{Math.min(100, Math.round(((currentUsedBytes + sessionBytes) / (1024 * 1024 * 1024)) * 100))}% used</span>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('takeoutfix:open-auth-modal', { detail: { mode: 'signin' } }))}
                className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold bg-transparent border-0 p-0 cursor-pointer"
              >
                Sign in to expand
              </button>
            </div>
          </div>
        )}
        <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium pt-0.5">
          {plan === 'guest'
            ? 'Guest mode: 1 GB free batch processing. Sign in for higher limits.'
            : 'Google Account connected. Full batch restoration enabled.'}
        </div>
      </div>

      {/* Scanning/Loading Indicator (only while processing) */}
      {isProcessing && (
        <div className="mb-4 bg-white dark:bg-white/[0.01] border border-zinc-200 dark:border-white/5 p-4 rounded-xl flex flex-col items-center justify-center text-center space-y-2">
          <div className="relative flex items-center justify-center">
            <div className="w-10 h-10 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
            <Activity className="absolute w-4 h-4 text-indigo-500 dark:text-indigo-400 animate-pulse" />
          </div>
          <div className="text-[10px] text-zinc-600 dark:text-zinc-400 font-semibold uppercase tracking-wider animate-pulse">
            {isPaused ? 'Restoration Paused' : 'Restoring Photos & Videos...'}
          </div>
        </div>
      )}

      {/* Stats counters */}
      <div className="space-y-1.5 mb-4">
        <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-semibold uppercase tracking-wider px-0.5">
          Restoration Summary
        </div>
        <div className={`grid ${stats.exifFailed > 0 ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
          <div className="bg-white dark:bg-white/[0.02] border border-zinc-200 dark:border-white/5 p-2.5 rounded-lg flex flex-col justify-between h-16 shadow-2xs">
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1 font-medium"><Database className="w-3.5 h-3.5"/> Scanned</span>
            <span className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{stats.scanned} / {stats.total || '—'}</span>
          </div>
          <div className="bg-emerald-50/70 dark:bg-emerald-500/5 border border-emerald-200 dark:border-emerald-500/10 p-2.5 rounded-lg flex flex-col justify-between h-16 shadow-2xs">
            <span className="text-[10px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1 font-semibold"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400"/> Restored</span>
            <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-400 truncate">{stats.matched} / {stats.total || '—'}</span>
          </div>
          {stats.exifFailed > 0 && (
            <div className="bg-amber-50/70 dark:bg-amber-500/5 border border-amber-300 dark:border-amber-500/10 p-2.5 rounded-lg flex flex-col justify-between h-16 shadow-2xs">
              <span className="text-[10px] text-amber-800 dark:text-amber-400 flex items-center gap-1 font-semibold"><Activity className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400"/> Fallback</span>
              <span className="text-sm font-semibold text-amber-900 dark:text-amber-400 truncate">{stats.exifFailed}</span>
            </div>
          )}
          <div className="bg-amber-50/70 dark:bg-amber-500/5 border border-amber-300 dark:border-amber-500/10 p-2.5 rounded-lg flex flex-col justify-between h-16 shadow-2xs">
            <span className="text-[10px] text-amber-800 dark:text-amber-400 flex items-center gap-1 font-semibold"><AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400"/> Unmatched</span>
            <span className="text-sm font-semibold text-amber-900 dark:text-amber-400 truncate">{stats.unmatched}</span>
          </div>
          <div className="bg-rose-50/70 dark:bg-rose-500/5 border border-rose-200 dark:border-rose-500/10 p-2.5 rounded-lg flex flex-col justify-between h-16 shadow-2xs">
            <span className="text-[10px] text-rose-700 dark:text-rose-400 flex items-center gap-1 font-semibold"><XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400"/> Errors</span>
            <span className="text-sm font-semibold text-rose-800 dark:text-rose-400 truncate">{stats.errors}</span>
          </div>
        </div>
      </div>

      {/* Privacy Guarantee Card */}
      <div className="mt-auto pt-3 border-t border-zinc-200 dark:border-white/5 space-y-2.5">
        <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-white/5 bg-white dark:bg-white/[0.02] shadow-xs">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Private &amp; Local</span>
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
            All files are processed directly on your computer. Your photos never leave your device.
          </p>
        </div>
      </div>

    </div>
  )
}
