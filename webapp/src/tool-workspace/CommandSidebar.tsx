/**
 * CommandSidebar — left "Command Center" panel.
 * Pure display: quotas, telemetry, stats counters, upgrade banner.
 */
import { Activity, HardDrive, Cpu, Database, CheckCircle2, AlertCircle, XCircle, ShieldCheck } from "lucide-react"
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
  useDeepExif: boolean
  maxWorkers: number
  telemetryCpu: number
  telemetryMem: number
  telemetryTabHeap: number
  telemetryWorkers: number
  userData: any
  resetUserQuota: () => Promise<void>
}

export function CommandSidebar({
  plan,
  tierThresholds,
  isFreePromoActive,
  limitFiles,
  limitBytes,
  currentUsedFiles,
  currentUsedBytes,
  sessionFiles,
  sessionBytes,
  formatByteSize,
  stats,
  isProcessing,
  isPaused,
  useDeepExif,
  maxWorkers,
  telemetryCpu,
  telemetryMem,
  telemetryTabHeap,
  telemetryWorkers,
  userData,
  resetUserQuota,
}: CommandSidebarProps) {
  return (
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

      {/* Engine Status */}
      <div className="space-y-2 mb-3 bg-white/[0.02] border border-white/5 p-3 rounded-xl">
        <div className="flex justify-between items-center text-[9px] text-white/40 font-bold uppercase tracking-wider">
          <span className="flex items-center gap-1"><HardDrive className="w-3 h-3 text-emerald-400" /> Restoration Engine</span>
          <span className="text-emerald-400 font-mono">100% Free</span>
        </div>
        <div className="text-xs font-bold text-zinc-150 flex items-center justify-between">
          <span>Processed Volume</span>
          <span className="font-mono text-zinc-300">{formatByteSize(sessionBytes)} ({sessionFiles.toLocaleString()} files)</span>
        </div>
        <div className="text-[10px] text-zinc-500 font-medium">
          Unlimited batch processing enabled. All files are merged client-side.
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

      {/* Scanning/Loading Logo Indicator */}
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
      <div className={`grid ${stats.exifFailed > 0 ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5 mb-3`}>
        <div className="bg-zinc-100 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/5 p-2 rounded flex flex-col justify-between h-14">
          <span className="text-[9px] text-zinc-500 dark:text-white/40 flex items-center gap-1 font-medium"><Database className="w-3 h-3"/> Scanned</span>
          <span className="text-xs font-bold text-zinc-900 dark:text-white truncate">{stats.scanned} / {stats.total || '—'}</span>
        </div>
        <div className="bg-emerald-50 dark:bg-green-500/5 border border-emerald-200 dark:border-green-500/10 p-2 rounded flex flex-col justify-between h-14">
          <span className="text-[9px] text-emerald-700 dark:text-green-400/70 flex items-center gap-1 font-semibold"><CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-green-400"/> Restored</span>
          <span className="text-xs font-bold text-emerald-800 dark:text-green-400 truncate">{stats.matched} / {stats.total || '—'}</span>
        </div>
        {stats.exifFailed > 0 && (
          <div className="bg-amber-50 dark:bg-amber-500/5 border border-amber-300 dark:border-amber-500/10 p-2 rounded flex flex-col justify-between h-14">
            <span className="text-[9px] text-amber-800 dark:text-amber-400/70 flex items-center gap-1 font-semibold"><Activity className="w-3 h-3 text-amber-600 dark:text-amber-400"/> Fallback</span>
            <span className="text-xs font-bold text-amber-900 dark:text-amber-400 truncate">{stats.exifFailed}</span>
          </div>
        )}
        <div className="bg-amber-50 dark:bg-yellow-500/5 border border-amber-300 dark:border-yellow-500/10 p-2 rounded flex flex-col justify-between h-14">
          <span className="text-[9px] text-amber-800 dark:text-yellow-400/70 flex items-center gap-1 font-semibold"><AlertCircle className="w-3 h-3 text-amber-600 dark:text-yellow-400"/> Unmatched</span>
          <span className="text-xs font-bold text-amber-900 dark:text-yellow-400 truncate">{stats.unmatched}</span>
        </div>
        <div className="bg-rose-50 dark:bg-red-500/5 border border-rose-200 dark:border-red-500/10 p-2 rounded flex flex-col justify-between h-14">
          <span className="text-[9px] text-rose-700 dark:text-red-400/70 flex items-center gap-1 font-semibold"><XCircle className="w-3 h-3 text-rose-600 dark:text-red-400"/> Errors</span>
          <span className="text-xs font-bold text-rose-800 dark:text-red-400 truncate">{stats.errors}</span>
        </div>
      </div>

      {/* Engine Trust Card at bottom */}
      <div className="mt-auto pt-3 border-t border-white/5 space-y-2.5">
        <div className="flex flex-col gap-2">
          <AdUnit type="compact" placement="TOOL_SIDEBAR_1" />
          <AdUnit type="compact" placement="TOOL_SIDEBAR_2" />
        </div>
        <div className="p-3 rounded-xl border border-white/5 bg-white/[0.02]">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-1.5 text-xs font-bold text-white">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              100% Free &amp; Offline
            </div>
            <span className="text-[9px] font-mono tracking-wide px-2 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 uppercase font-bold">
              Active
            </span>
          </div>
          <p className="mt-2 text-[9.5px] text-zinc-400 leading-normal font-medium">
            Zero server uploads. Your photos and JSON companion sidecars are restored directly in your browser with unlimited capacity.
          </p>
        </div>
      </div>

    </div>
  )
}
