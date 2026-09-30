/**
 * DuplicateHunterPanel — Fast Duplicate Photo & Media Scanner.
 *
 * Scans directories for identical files by exact byte size and SHA-256 digests,
 * calculates recoverable disk space, and displays duplicates grouped together.
 */
import { Copy, HardDrive, Play, Trash2, FolderUp } from "lucide-react"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"

interface DuplicateHunterPanelProps {
  dupFolder: FileSystemDirectoryHandle | null
  dupIsScanning: boolean
  dupStats: { scanned: number; duplicates: number; savedBytes: number }
  dupGroups: Record<string, any>[]
  dupScanStatus: string
  handleSelectDupFolder: () => void
  startDuplicateScan: () => void
}

export function DuplicateHunterPanel({
  dupFolder,
  dupIsScanning,
  dupStats,
  dupGroups,
  dupScanStatus,
  handleSelectDupFolder,
  startDuplicateScan,
}: DuplicateHunterPanelProps) {
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 MB'
    const mb = bytes / 1024 / 1024
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`
    return `${mb.toFixed(1)} MB`
  }

  return (
    <div className="flex-grow flex flex-col p-4 sm:p-6 bg-white dark:bg-[#0D0E12] text-zinc-900 dark:text-zinc-100 overflow-y-auto max-w-6xl mx-auto w-full transition-colors">
      {/* Header */}
      <div className="mb-6 border-b border-zinc-200 dark:border-zinc-800 pb-5">
        <div className="flex items-center gap-2 mb-1">
          <Copy className="w-5 h-5 text-zinc-700 dark:text-zinc-300" />
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white tracking-wide uppercase">
            Duplicate Media Hunter
          </h2>
          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 font-bold">
            Disk Space Reclaimer
          </span>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Find identical photo and video copies across your library and reclaim gigabytes of wasted storage space.
        </p>
      </div>

      {/* Action / Selection Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="md:col-span-2 bg-zinc-50/50 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800">
          <CardHeader className="py-3 px-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/60 dark:bg-zinc-900/40">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FolderUp className="w-4 h-4 text-zinc-700 dark:text-zinc-300" /> Target Photo Folder
              </span>
              {dupFolder && (
                <button
                  onClick={handleSelectDupFolder}
                  disabled={dupIsScanning}
                  className="text-[10px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white font-bold px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                >
                  Change
                </button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 flex items-center justify-between">
            {dupFolder ? (
              <span className="font-mono text-zinc-900 dark:text-white text-xs truncate mr-2">{dupFolder.name}</span>
            ) : (
              <Button onClick={handleSelectDupFolder} className="bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-bold py-2 px-4 shadow-xs cursor-pointer">
                Select Photo Folder to Scan
              </Button>
            )}

            {dupFolder && (
              <Button
                onClick={startDuplicateScan}
                disabled={dupIsScanning}
                className="bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-bold py-2 px-4 flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                {dupIsScanning ? "Scanning..." : "Start Duplicate Scan"}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Recoverable Storage Meter */}
        <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between">
          <div className="text-[10px] font-mono uppercase text-zinc-500 dark:text-zinc-400">Reclaimable Storage</div>
          <div className="text-2xl font-black text-zinc-900 dark:text-white font-mono">
            {formatBytes(dupStats.savedBytes)}
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            {dupStats.duplicates} redundant files in {dupStats.scanned} scanned
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-600 dark:text-zinc-400 mb-6 flex justify-between items-center">
        <span>Status: {dupScanStatus}</span>
        {dupIsScanning && <span className="text-zinc-900 dark:text-white animate-pulse font-bold">● Active Scanner</span>}
      </div>

      {/* Duplicates Groups List */}
      {dupGroups.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">
            Duplicate Clusters ({dupGroups.length} groups)
          </h3>
          <div className="space-y-3">
            {dupGroups.map((group, idx) => (
              <Card key={idx} className="bg-zinc-950 border-zinc-800">
                <CardHeader className="py-2.5 px-4 border-b border-zinc-800/80 bg-zinc-900/30 flex flex-row items-center justify-between">
                  <div className="text-xs font-mono font-bold text-zinc-300">
                    Cluster #{idx + 1} — {group.files?.length || 0} identical copies
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold">
                    {group.size} each
                  </span>
                </CardHeader>
                <CardContent className="p-3 space-y-1 text-xs font-mono text-zinc-400">
                  {group.files?.map((filePath: string, fIdx: number) => (
                    <div key={fIdx} className="flex items-center justify-between py-1 px-2 rounded hover:bg-zinc-900/50">
                      <span className="truncate max-w-xl">{filePath}</span>
                      {fIdx === 0 ? (
                        <span className="text-[10px] text-emerald-400 font-bold uppercase">Original</span>
                      ) : (
                        <span className="text-[10px] text-rose-400 font-bold uppercase flex items-center gap-1">
                          <Trash2 className="w-3 h-3" /> Duplicate
                        </span>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
