/**
 * CommandSidebar — left "Command Center" panel.
 * Pure display: quotas, telemetry, stats counters, upgrade banner.
 */
import { useState, useEffect } from "react"
import { Activity, HardDrive, FileText, Cpu, Database, CheckCircle2, AlertCircle, XCircle } from "lucide-react"
import { Progress } from "../components/ui/progress"
import AdUnit from "../components/AdUnit"
import { Button } from "../components/ui/button"

interface CommandSidebarProps {
  plan: string
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
  // Countdown timer for 24-hour pass
  const [timeLeft, setTimeLeft] = useState("")

  useEffect(() => {
    if (plan !== 'recovery_pass') return
    
    const calculateTimeLeft = () => {
      const expiresAt = userData?.expiresAt || (userData?.updatedAt ? userData.updatedAt + 24 * 60 * 60 * 1000 : Date.now() + 24 * 60 * 60 * 1000)
      const diff = expiresAt - Date.now()
      
      if (diff <= 0) {
        setTimeLeft("Expired")
        return
      }
      
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const secs = Math.floor((diff % (1000 * 60)) / 1000)
      
      setTimeLeft(`${hours}h ${mins}m ${secs}s`)
    }
    
    calculateTimeLeft()
    const timer = setInterval(calculateTimeLeft, 1000)
    return () => clearInterval(timer)
  }, [plan, userData])

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

      {/* Quota Progress */}
      {plan === 'recovery_pass' ? (
        <div className="space-y-2 mb-3 bg-gradient-to-r from-cyan-500/10 to-cyan-500/10 border border-cyan-500/20 p-3.5 rounded-lg text-left">
          <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
            24h Recovery Pass Active
          </div>
          <div className="text-[11px] text-zinc-300 font-semibold mt-1">
            Unlimited files & storage restoration enabled.
          </div>
          <div className="border-t border-cyan-500/10 pt-2.5 mt-2 flex justify-between items-center text-xs">
            <span className="text-zinc-400 font-medium font-semibold">Time Left:</span>
            <span className="font-mono font-black text-white bg-zinc-950/80 px-2 py-0.5 rounded border border-zinc-800 tracking-tight">{timeLeft}</span>
          </div>
        </div>
      ) : (
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

          {/* Developer / Admin Reset Button */}
          {(userData?.isAdmin || import.meta.env.DEV) && (
            <Button 
              onClick={resetUserQuota}
              className="w-full mt-2 h-7 text-[9px] font-bold text-zinc-400 hover:text-white border border-white/10 hover:border-white/20 bg-white/[0.02] cursor-pointer rounded-md flex items-center justify-center gap-1"
            >
              ↺ Reset Usage Quota (Dev/Admin)
            </Button>
          )}
        </div>
      )}

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
  )
}
