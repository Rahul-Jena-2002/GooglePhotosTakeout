/**
 * FolderFlowPanel — Chronological Photo & Video Organizer.
 *
 * Scans photos and videos, extracts embedded EXIF or filename capture timestamps,
 * and structures files into clean chronological folder trees (e.g. 2024/2024-08).
 * 100% client-side via W3C File System Access API.
 */
import { useState, useRef } from "react"
import { FolderTree, CheckCircle2, Play, Square, FolderUp, Calendar, Sparkles } from "lucide-react"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { Progress } from "../components/ui/progress"
import { useToastStore } from "../store/useToastStore"
import { extractExifDateFast } from "../services/restoration/DeepExifRestorer"

export type OrganizePattern = 'year_month' | 'year_month_name' | 'year_month_day' | 'year_only'

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
]

export function FolderFlowPanel() {
  const [sourceDir, setSourceDir] = useState<FileSystemDirectoryHandle | null>(null)
  const [destDir, setDestDir] = useState<FileSystemDirectoryHandle | null>(null)
  const [pattern, setPattern] = useState<OrganizePattern>('year_month')
  
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [statusMsg, setStatusMsg] = useState("Ready to organize")
  
  const [scanPreview, setScanPreview] = useState<{ [folder: string]: number } | null>(null)
  const [organizedCount, setOrganizedCount] = useState(0)
  const [totalFiles, setTotalFiles] = useState(0)

  const abortRef = useRef(false)

  const handlePickSource = async () => {
    if (typeof window === 'undefined' || !(window as any).showDirectoryPicker) {
      useToastStore.getState().addToast("Requires a Chromium desktop browser (Chrome, Edge, Brave).", "error", 5000)
      return
    }
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'read' })
      setSourceDir(handle)
      setScanPreview(null)
      setOrganizedCount(0)
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error(e)
    }
  }

  const handlePickDest = async () => {
    if (typeof window === 'undefined' || !(window as any).showDirectoryPicker) {
      useToastStore.getState().addToast("Requires a Chromium desktop browser (Chrome, Edge, Brave).", "error", 5000)
      return
    }
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
      setDestDir(handle)
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error(e)
    }
  }

  // Extract date from EXIF or filename fallback
  const extractFileDate = async (file: File): Promise<Date> => {
    // 1. Try fast EXIF header scan (JPEG / TIFF / PNG)
    try {
      const buf = await file.slice(0, 65536).arrayBuffer()
      const exifDt = extractExifDateFast(buf)
      if (exifDt) return exifDt
    } catch {}

    // 2. Try filename regex e.g. IMG_20230815_... or 2023-08-15
    const regexMatch = file.name.match(/(\d{4})[-_]?(\\d{2})[-_]?(\\d{2})/)
    if (regexMatch) {
      const y = parseInt(regexMatch[1], 10)
      const m = parseInt(regexMatch[2], 10) - 1
      const d = parseInt(regexMatch[3], 10)
      if (y >= 1970 && y <= 2100 && m >= 0 && m < 12) {
        return new Date(y, m, d)
      }
    }

    // 3. Fallback to file.lastModified
    return new Date(file.lastModified || Date.now())
  }

  // Resolve target relative directory path
  const getTargetFolder = (d: Date, pat: OrganizePattern): string[] => {
    const y = d.getFullYear()
    const m = (d.getMonth() + 1).toString().padStart(2, '0')
    const day = d.getDate().toString().padStart(2, '0')
    const mName = MONTH_NAMES[d.getMonth()]

    switch (pat) {
      case 'year_month':
        return [`${y}`, `${y}-${m}`]
      case 'year_month_name':
        return [`${y}`, `${m} - ${mName}`]
      case 'year_month_day':
        return [`${y}`, `${y}-${m}-${day}`]
      case 'year_only':
        return [`${y}`]
    }
  }

  // Preview scan
  const handleScanPreview = async () => {
    if (!sourceDir) return
    setIsProcessing(true)
    setStatusMsg("Analyzing file timestamps...")
    const previewMap: { [folder: string]: number } = {}
    let count = 0

    try {
      async function walk(handle: FileSystemDirectoryHandle) {
        // @ts-ignore
        for await (const [name, entry] of handle) {
          if (entry.kind === 'file') {
            const ext = name.split('.').pop()?.toLowerCase() || ''
            if (['jpg', 'jpeg', 'png', 'heic', 'webp', 'mp4', 'mov', 'm4v'].includes(ext)) {
              const file = await (entry as FileSystemFileHandle).getFile()
              const dt = await extractFileDate(file)
              const targetPath = getTargetFolder(dt, pattern).join('/')
              previewMap[targetPath] = (previewMap[targetPath] || 0) + 1
              count++
            }
          } else if (entry.kind === 'directory') {
            await walk(entry as FileSystemDirectoryHandle)
          }
        }
      }

      await walk(sourceDir)
      setTotalFiles(count)
      setScanPreview(previewMap)
      setStatusMsg(`Preview generated: ${count} media files ready to organize.`)
    } catch (e: any) {
      console.error(e)
      setStatusMsg(`Scan error: ${e.message || e}`)
    } finally {
      setIsProcessing(false)
    }
  }

  // Execute Organization
  const handleStartOrganizing = async () => {
    if (!sourceDir || !destDir) return
    setIsProcessing(true)
    abortRef.current = false
    setStatusMsg("Organizing files...")
    let processed = 0

    try {
      // Helper to traverse and copy
      async function processDir(srcHandle: FileSystemDirectoryHandle) {
        // @ts-ignore
        for await (const [name, entry] of srcHandle) {
          if (abortRef.current) break
          if (entry.kind === 'file') {
            const ext = name.split('.').pop()?.toLowerCase() || ''
            if (['jpg', 'jpeg', 'png', 'heic', 'webp', 'mp4', 'mov', 'm4v'].includes(ext)) {
              const file = await (entry as FileSystemFileHandle).getFile()
              const dt = await extractFileDate(file)
              const pathSegments = getTargetFolder(dt, pattern)

              // Ensure target folders exist in destDir
              let currentDir = destDir!
              for (const segment of pathSegments) {
                currentDir = await currentDir.getDirectoryHandle(segment, { create: true })
              }

              // Copy file
              const destFileHandle = await currentDir.getFileHandle(name, { create: true })
              const writable = await destFileHandle.createWritable()
              await writable.write(await file.arrayBuffer())
              await writable.close()

              processed++
              setOrganizedCount(processed)
              if (totalFiles > 0) {
                setProgress(Math.round((processed / totalFiles) * 100))
              }
            }
          } else if (entry.kind === 'directory') {
            await processDir(entry as FileSystemDirectoryHandle)
          }
        }
      }

      await processDir(sourceDir)
      setStatusMsg(`Successfully organized ${processed} files!`)
    } catch (e: any) {
      console.error(e)
      setStatusMsg(`Organization interrupted: ${e.message || e}`)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="flex-grow flex flex-col p-4 sm:p-6 bg-black text-zinc-200 overflow-y-auto max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="mb-6 border-b border-zinc-800 pb-5">
        <div className="flex items-center gap-2 mb-1">
          <FolderTree className="w-5 h-5 text-violet-400" />
          <h2 className="text-lg font-bold text-white tracking-wide uppercase">
            FolderFlow Media Organizer
          </h2>
          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 font-bold">
            Chronological Sorter
          </span>
        </div>
        <p className="text-xs text-zinc-400">
          Cleanly organize disorganized photo dumps into structured Year/Month chronological folders using embedded EXIF dates.
        </p>
      </div>

      {/* Folder Picker Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card className="bg-zinc-950/60 border-zinc-800">
          <CardHeader className="py-3 px-4 border-b border-zinc-800/80 bg-zinc-900/40">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FolderUp className="w-4 h-4 text-violet-400" />
                1. Unorganized Source Media
              </span>
              {sourceDir && (
                <button onClick={handlePickSource} className="text-[10px] text-zinc-400 hover:text-white font-bold px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900">
                  Change
                </button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {sourceDir ? (
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs">
                <span className="font-mono text-white truncate mr-2">{sourceDir.name}</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              </div>
            ) : (
              <Button
                onClick={handlePickSource}
                className="btn-monochrome-secondary w-full h-11 text-xs font-bold flex items-center justify-center gap-2 border-dashed"
              >
                <FolderUp className="w-4 h-4 text-zinc-400" /> Select Source Directory
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="bg-zinc-950/60 border-zinc-800">
          <CardHeader className="py-3 px-4 border-b border-zinc-800/80 bg-zinc-900/40">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FolderUp className="w-4 h-4 text-emerald-400" />
                2. Output Directory
              </span>
              {destDir && (
                <button onClick={handlePickDest} className="text-[10px] text-zinc-400 hover:text-white font-bold px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900">
                  Change
                </button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {destDir ? (
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs">
                <span className="font-mono text-white truncate mr-2">{destDir.name}</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              </div>
            ) : (
              <Button
                onClick={handlePickDest}
                className="btn-monochrome-secondary w-full h-11 text-xs font-bold flex items-center justify-center gap-2 border-dashed"
              >
                <FolderUp className="w-4 h-4 text-zinc-400" /> Select Output Directory
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pattern Selector */}
      <div className="p-4 rounded-xl bg-zinc-950/40 border border-zinc-800 mb-6">
        <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-indigo-400" />
          Select Organization Structure:
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {[
            { id: 'year_month', label: 'Year / YYYY-MM', desc: 'e.g. 2024 / 2024-08' },
            { id: 'year_month_name', label: 'Year / Month Name', desc: 'e.g. 2024 / 08 - August' },
            { id: 'year_month_day', label: 'Year / YYYY-MM-DD', desc: 'e.g. 2024 / 2024-08-15' },
            { id: 'year_only', label: 'Year Only', desc: 'e.g. 2024 / Photos' },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => { setPattern(opt.id as OrganizePattern); setScanPreview(null); }}
              className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                pattern === opt.id
                  ? 'border-indigo-500 bg-indigo-500/10 text-white font-bold'
                  : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
              }`}
            >
              <div className="font-medium text-white">{opt.label}</div>
              <div className="text-[11px] text-zinc-500 mt-0.5 font-mono">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Action Bar */}
      <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 mb-6 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              onClick={handleScanPreview}
              disabled={!sourceDir || isProcessing}
              className="btn-monochrome-secondary text-xs h-9 px-4"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5 text-indigo-400" /> Preview Organization
            </Button>

            <Button
              onClick={handleStartOrganizing}
              disabled={!sourceDir || !destDir || isProcessing}
              className="btn-monochrome-primary text-xs h-9 px-5 font-bold"
            >
              <Play className="w-3.5 h-3.5 mr-1.5 fill-current" /> Organize Now
            </Button>

            {isProcessing && (
              <Button
                onClick={() => { abortRef.current = true; }}
                className="btn-monochrome-primary text-xs h-9 px-4 bg-rose-600 hover:bg-rose-500 text-white"
              >
                <Square className="w-3.5 h-3.5 mr-1.5 fill-current" /> Stop
              </Button>
            )}
          </div>

          <div className="text-xs font-mono text-zinc-400">{statusMsg}</div>
        </div>

        {isProcessing && (
          <div className="pt-2">
            <div className="flex justify-between text-[11px] font-mono text-zinc-400 mb-1">
              <span>Organizing files...</span>
              <span>{progress}% ({organizedCount} processed)</span>
            </div>
            <Progress value={progress} className="h-2 bg-zinc-900 rounded-full" />
          </div>
        )}
      </div>

      {/* Preview Table */}
      {scanPreview && (
        <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">
            Target Folder Structure Preview ({totalFiles} files detected)
          </h3>
          <div className="max-h-60 overflow-y-auto font-mono text-xs">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-[10px]">
                  <th className="pb-2">Destination Folder Path</th>
                  <th className="pb-2 text-right">Photo &amp; Video Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {Object.entries(scanPreview).map(([folderPath, count], idx) => (
                  <tr key={idx} className="hover:bg-zinc-900/50">
                    <td className="py-2 text-zinc-300">📁 {folderPath}/</td>
                    <td className="py-2 text-right text-emerald-400 font-bold">{count} files</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
