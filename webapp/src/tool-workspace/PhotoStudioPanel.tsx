/**
 * PhotoStudioPanel — Batch Photo Studio Suite (Date + Creator + Location).
 *
 * Provides batch EXIF editing directly in the browser:
 * - Batch Date Shifter (±days, ±hours, ±minutes, fixed datetime, or sequential increment)
 * - Customizable Creator Presets (Photographer/Artist, Copyright Stamp, Caption) with localStorage persistence
 * - GPS Location Manager (Strip GPS for privacy or inject custom coordinates)
 * 100% private & client-side using W3C File System Access API & piexifjs.
 */

import { useState, useEffect, useRef } from "react"
import { 
  Sliders, 
  Calendar, 
  User, 
  MapPin, 
  Play, 
  Square, 
  FolderUp, 
  Upload, 
  Clock, 
  Download,
  FileImage,
  Trash2
} from "lucide-react"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card"
import { Progress } from "../components/ui/progress"
import { useToastStore } from "../store/useToastStore"
import piexif from "piexifjs"

interface QueuedPhoto {
  file: File
  handle?: FileSystemFileHandle
  originalDate?: Date
  calculatedDate?: Date
  size: number
}

interface CreatorPresets {
  artist: string
  copyright: string
  description: string
}

const STORAGE_KEY = "takeoutfix_creator_presets"

export function PhotoStudioPanel() {
  // Navigation / Tabs within Studio
  const [activeTab, setActiveTab] = useState<'date' | 'creator' | 'location'>('date')

  // Files state
  const [photos, setPhotos] = useState<QueuedPhoto[]>([])
  const [sourceDir, setSourceDir] = useState<FileSystemDirectoryHandle | null>(null)
  const [destDir, setDestDir] = useState<FileSystemDirectoryHandle | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Date Shifter State
  const [dateMode, setDateMode] = useState<'shift' | 'fixed' | 'sequence'>('shift')
  const [shiftDays, setShiftDays] = useState<number>(0)
  const [shiftHours, setShiftHours] = useState<number>(0)
  const [shiftMinutes, setShiftMinutes] = useState<number>(0)
  const [fixedDateTime, setFixedDateTime] = useState<string>("")
  const [seqIntervalSec, setSeqIntervalSec] = useState<number>(5)

  // Creator & Presets State (persistent)
  const [creator, setCreator] = useState<CreatorPresets>({
    artist: "",
    copyright: "",
    description: ""
  })

  // Location State
  const [locationMode, setLocationMode] = useState<'keep' | 'strip' | 'set'>('keep')
  const [latitude, setLatitude] = useState<string>("")
  const [longitude, setLongitude] = useState<string>("")

  // Execution State
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [statusMsg, setStatusMsg] = useState("Ready to configure batch edits")
  const [processedBlobs, setProcessedBlobs] = useState<{ name: string; blob: Blob }[]>([])
  const abortRef = useRef(false)

  // Load saved presets on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed && typeof parsed === 'object') {
          setCreator({
            artist: parsed.artist || "",
            copyright: parsed.copyright || "",
            description: parsed.description || ""
          })
        }
      }
    } catch {}
  }, [])

  // Auto-save presets
  const updateCreatorField = (field: keyof CreatorPresets, value: string) => {
    setCreator(prev => {
      const updated = { ...prev, [field]: value }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      } catch {}
      return updated
    })
  }

  // Quick stamps for copyright
  const stampCopyright = (template: 'default' | 'ccby' | 'cc0' | 'clear') => {
    const year = new Date().getFullYear()
    const name = creator.artist.trim() || "Creator"
    
    if (template === 'default') {
      updateCreatorField('copyright', `© ${year} ${name}. All rights reserved.`)
    } else if (template === 'ccby') {
      updateCreatorField('copyright', `CC BY 4.0 ${name} (${year})`)
    } else if (template === 'cc0') {
      updateCreatorField('copyright', `CC0 1.0 Universal (Public Domain Dedication)`)
    } else if (template === 'clear') {
      updateCreatorField('copyright', '')
      updateCreatorField('description', '')
    }
  }

  // Extract EXIF date helper
  const extractExifDate = async (file: File): Promise<Date | undefined> => {
    if (!file.name.match(/\.jpe?g$/i)) return new Date(file.lastModified)
    try {
      const buf = await file.slice(0, 128 * 1024).arrayBuffer()
      const bytes = new Uint8Array(buf)
      let binary = ""
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      const exif = piexif.load("data:image/jpeg;base64," + btoa(binary))
      const dtStr = exif["Exif"]?.[piexif.ExifIFD.DateTimeOriginal] || exif["0th"]?.[piexif.ImageIFD.DateTime]
      if (dtStr) {
        const parts = String(dtStr).trim().split(" ")
        if (parts.length >= 2) {
          const dParts = parts[0].split(":")
          const tParts = parts[1].split(":")
          if (dParts.length === 3 && tParts.length >= 2) {
            const y = parseInt(dParts[0], 10)
            const m = parseInt(dParts[1], 10) - 1
            const d = parseInt(dParts[2], 10)
            const hh = parseInt(tParts[0], 10)
            const mm = parseInt(tParts[1], 10)
            const ss = parseInt(tParts[2] || "0", 10)
            return new Date(y, m, d, hh, mm, ss)
          }
        }
      }
    } catch {}
    return new Date(file.lastModified)
  }

  // Calculate new date based on mode
  const computeNewDate = (origDate: Date, index: number): Date => {
    if (dateMode === 'fixed') {
      if (fixedDateTime) {
        const parsed = new Date(fixedDateTime)
        if (!isNaN(parsed.getTime())) return parsed
      }
      return origDate
    }
    if (dateMode === 'sequence') {
      const base = fixedDateTime ? new Date(fixedDateTime) : origDate
      return new Date(base.getTime() + index * seqIntervalSec * 1000)
    }
    // 'shift' mode
    const msShift = (shiftDays * 86400 + shiftHours * 3600 + shiftMinutes * 60) * 1000
    return new Date(origDate.getTime() + msShift)
  }

  // Handle files selection
  const handleSelectFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return
    const fileList = Array.from(e.target.files)
    const queued: QueuedPhoto[] = []
    
    for (const f of fileList) {
      if (!f.type.startsWith("image/") && !f.name.match(/\.(jpe?g|png|webp|avif|heic|tiff?)$/i)) continue
      const orig = await extractExifDate(f)
      queued.push({
        file: f,
        originalDate: orig,
        size: f.size
      })
    }
    setPhotos(queued)
    setProcessedBlobs([])
    useToastStore.getState().addToast(`Loaded ${queued.length} photos into Studio.`, "success", 3000)
  }

  // Chromium Directory Picker
  const handlePickFolder = async () => {
    if (typeof window === 'undefined' || !(window as any).showDirectoryPicker) {
      if (fileInputRef.current) fileInputRef.current.click()
      return
    }
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'read' })
      setSourceDir(handle)
      const queued: QueuedPhoto[] = []
      
      for await (const entry of (handle as any).values()) {
        if (entry.kind === 'file') {
          const file = await entry.getFile()
          if (file.type.startsWith("image/") || file.name.match(/\.(jpe?g|png|webp|avif|heic|tiff?)$/i)) {
            const orig = await extractExifDate(file)
            queued.push({
              file,
              handle: entry,
              originalDate: orig,
              size: file.size
            })
          }
        }
      }
      setPhotos(queued)
      setProcessedBlobs([])
      useToastStore.getState().addToast(`Found ${queued.length} photos in folder.`, "success", 3000)
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error(e)
    }
  }

  // Output folder handle
  const handlePickDestFolder = async () => {
    if (typeof window === 'undefined' || !(window as any).showDirectoryPicker) {
      useToastStore.getState().addToast("Directory saving requires Chrome, Edge, or Brave.", "info", 4000)
      return
    }
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
      setDestDir(handle)
      useToastStore.getState().addToast("Destination folder connected.", "success", 3000)
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error(e)
    }
  }

  // Format date to EXIF string: "YYYY:MM:DD HH:MM:SS"
  const formatDateToExif = (d: Date): string => {
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${d.getFullYear()}:${pad(d.getMonth() + 1)}:${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

  // Process & Apply Batch Edits
  const handleRunBatch = async () => {
    if (photos.length === 0) {
      useToastStore.getState().addToast("Please select photos first.", "warn", 4000)
      return
    }

    setIsProcessing(true)
    setProgress(0)
    abortRef.current = false
    setStatusMsg(`Processing ${photos.length} photos...`)
    
    const outputBlobs: { name: string; blob: Blob }[] = []
    let successCount = 0

    try {
      for (let i = 0; i < photos.length; i++) {
        if (abortRef.current) break

        const item = photos[i]
        const origDate = item.originalDate || new Date(item.file.lastModified)
        const targetDate = computeNewDate(origDate, i)

        if (item.file.name.match(/\.jpe?g$/i)) {
          // Read as binary
          const buffer = await item.file.arrayBuffer()
          const bytes = new Uint8Array(buffer)
          let binary = ""
          for (let b = 0; b < bytes.length; b++) binary += String.fromCharCode(bytes[b])

          let exifObj: any = { "0th": {}, "Exif": {}, "GPS": {}, "Interop": {}, "1st": {}, "thumbnail": null }
          try {
            exifObj = piexif.load("data:image/jpeg;base64," + btoa(binary))
          } catch {}

          if (!exifObj["0th"]) exifObj["0th"] = {}
          if (!exifObj["Exif"]) exifObj["Exif"] = {}

          // 1. Update EXIF Dates
          const exifDateStr = formatDateToExif(targetDate)
          exifObj["0th"][piexif.ImageIFD.DateTime] = exifDateStr
          exifObj["Exif"][piexif.ExifIFD.DateTimeOriginal] = exifDateStr
          exifObj["Exif"][piexif.ExifIFD.DateTimeDigitized] = exifDateStr

          // 2. Creator & Copyright Presets
          if (creator.artist.trim()) {
            exifObj["0th"][piexif.ImageIFD.Artist] = creator.artist.trim()
          }
          if (creator.copyright.trim()) {
            exifObj["0th"][piexif.ImageIFD.Copyright] = creator.copyright.trim()
          }
          if (creator.description.trim()) {
            exifObj["0th"][piexif.ImageIFD.ImageDescription] = creator.description.trim()
          }

          // 3. Location
          if (locationMode === 'strip') {
            exifObj["GPS"] = {}
          } else if (locationMode === 'set' && latitude && longitude) {
            const lat = parseFloat(latitude)
            const lng = parseFloat(longitude)
            if (!isNaN(lat) && !isNaN(lng)) {
              if (!exifObj["GPS"]) exifObj["GPS"] = {}
              exifObj["GPS"][piexif.GPSIFD.GPSLatitudeRef] = lat >= 0 ? 'N' : 'S'
              exifObj["GPS"][piexif.GPSIFD.GPSLatitude] = piexif.GPSHelper.degToDmsRational(Math.abs(lat))
              exifObj["GPS"][piexif.GPSIFD.GPSLongitudeRef] = lng >= 0 ? 'E' : 'W'
              exifObj["GPS"][piexif.GPSIFD.GPSLongitude] = piexif.GPSHelper.degToDmsRational(Math.abs(lng))
            }
          }

          // Dump updated EXIF
          const exifBytes = piexif.dump(exifObj)
          const newBinary = piexif.insert(exifBytes, "data:image/jpeg;base64," + btoa(binary))
          
          // Convert data URI back to blob
          const byteString = atob(newBinary.split(',')[1])
          const ab = new ArrayBuffer(byteString.length)
          const ia = new Uint8Array(ab)
          for (let b = 0; b < byteString.length; b++) ia[b] = byteString.charCodeAt(b)
          const modifiedBlob = new Blob([ab], { type: "image/jpeg" })

          if (destDir) {
            const fileHandle = await destDir.getFileHandle(item.file.name, { create: true })
            const writable = await (fileHandle as any).createWritable()
            await writable.write(modifiedBlob)
            await writable.close()
          } else {
            outputBlobs.push({ name: item.file.name, blob: modifiedBlob })
          }
          successCount++
        } else {
          // For non-JPEG formats (PNG, WebP, etc.), clone blob preserving modified timestamp
          const copyBlob = new Blob([await item.file.arrayBuffer()], { type: item.file.type })
          if (destDir) {
            const fileHandle = await destDir.getFileHandle(item.file.name, { create: true })
            const writable = await (fileHandle as any).createWritable()
            await writable.write(copyBlob)
            await writable.close()
          } else {
            outputBlobs.push({ name: item.file.name, blob: copyBlob })
          }
          successCount++
        }

        const pct = Math.round(((i + 1) / photos.length) * 100)
        setProgress(pct)
        setStatusMsg(`Processed ${i + 1}/${photos.length} (${pct}%)`)
      }

      setProcessedBlobs(outputBlobs)
      useToastStore.getState().addToast(
        destDir 
          ? `Successfully saved ${successCount} photos directly to destination folder.`
          : `Successfully processed ${successCount} photos. Ready to download!`,
        "success",
        5000
      )
    } catch (err: any) {
      console.error("Batch processing error:", err)
      useToastStore.getState().addToast(`Batch error: ${err.message || 'Unknown'}`, "error", 5000)
    } finally {
      setIsProcessing(false)
    }
  }

  // Single or all download trigger
  const handleDownloadAll = () => {
    if (processedBlobs.length === 0) return
    processedBlobs.forEach(({ name, blob }) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `edited_${name}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    })
  }

  return (
    <div className="flex-1 flex flex-col p-4 md:p-6 bg-zinc-950 text-zinc-100 min-h-screen">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-zinc-800/80 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Sliders className="w-5 h-5" />
            </div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">Photo Studio Suite</h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-semibold border border-purple-500/30">
              Batch EXIF
            </span>
          </div>
          <p className="text-sm text-zinc-400">
            Shift photo capture dates, customize photographer copyright stamps, and manage GPS metadata in bulk.
          </p>
        </div>

        {/* Input file triggers */}
        <div className="flex items-center gap-2.5">
          <input 
            type="file" 
            ref={fileInputRef} 
            multiple 
            accept="image/*" 
            className="hidden" 
            onChange={handleSelectFiles} 
          />
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => fileInputRef.current?.click()}
            className="border-zinc-800 hover:bg-zinc-900 text-xs font-semibold gap-1.5"
          >
            <Upload className="w-3.5 h-3.5 text-zinc-400" />
            Select Files
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handlePickFolder}
            className="border-zinc-800 hover:bg-zinc-900 text-xs font-semibold gap-1.5"
          >
            <FolderUp className="w-3.5 h-3.5 text-zinc-400" />
            Select Folder
          </Button>
          {photos.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setPhotos([]); setProcessedBlobs([]) }}
              className="text-zinc-500 hover:text-rose-400 text-xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
        
        {/* Left Control Panel: Tabs & Settings (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* Segmented Mode Navigation */}
          <div className="flex rounded-xl bg-zinc-900/80 p-1 border border-zinc-800/80">
            <button
              onClick={() => setActiveTab('date')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'date'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Dates & Timezones
            </button>
            <button
              onClick={() => setActiveTab('creator')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'creator'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              Creator & Presets
            </button>
            <button
              onClick={() => setActiveTab('location')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'location'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              Location & Privacy
            </button>
          </div>

          {/* TAB 1: DATE SHIFTING */}
          {activeTab === 'date' && (
            <Card className="bg-zinc-900/40 border-zinc-800/80">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-purple-400" />
                  Date Adjustment Strategy
                </CardTitle>
                <CardDescription className="text-xs text-zinc-400">
                  Update EXIF DateTimeOriginal, DateTimeDigitized, and DateTime tags across all queued photos.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Mode Selector */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setDateMode('shift')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      dateMode === 'shift'
                        ? 'border-purple-500 bg-purple-950/20 text-purple-200'
                        : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <div className="text-xs font-bold">Relative Shift</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">±Hours, minutes, days</div>
                  </button>
                  <button
                    onClick={() => setDateMode('fixed')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      dateMode === 'fixed'
                        ? 'border-purple-500 bg-purple-950/20 text-purple-200'
                        : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <div className="text-xs font-bold">Set Fixed Date</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">Apply exact timestamp</div>
                  </button>
                  <button
                    onClick={() => setDateMode('sequence')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      dateMode === 'sequence'
                        ? 'border-purple-500 bg-purple-950/20 text-purple-200'
                        : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <div className="text-xs font-bold">Sequential Order</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">+N seconds per photo</div>
                  </button>
                </div>

                {/* Shift Inputs */}
                {dateMode === 'shift' && (
                  <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                    <div>
                      <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                        Days
                      </label>
                      <input
                        type="number"
                        value={shiftDays}
                        onChange={(e) => setShiftDays(parseInt(e.target.value, 10) || 0)}
                        className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700/80 rounded-md text-sm text-white focus:outline-none focus:border-purple-500"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                        Hours (Timezone)
                      </label>
                      <input
                        type="number"
                        value={shiftHours}
                        onChange={(e) => setShiftHours(parseInt(e.target.value, 10) || 0)}
                        className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700/80 rounded-md text-sm text-white focus:outline-none focus:border-purple-500"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                        Minutes
                      </label>
                      <input
                        type="number"
                        value={shiftMinutes}
                        onChange={(e) => setShiftMinutes(parseInt(e.target.value, 10) || 0)}
                        className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700/80 rounded-md text-sm text-white focus:outline-none focus:border-purple-500"
                        placeholder="0"
                      />
                    </div>
                  </div>
                )}

                {/* Fixed Date Input */}
                {dateMode === 'fixed' && (
                  <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                    <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                      Target Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      value={fixedDateTime}
                      onChange={(e) => setFixedDateTime(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700/80 rounded-md text-sm text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>
                )}

                {/* Sequential Increments */}
                {dateMode === 'sequence' && (
                  <div className="space-y-3 p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                    <div>
                      <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                        Starting Date & Time (Optional)
                      </label>
                      <input
                        type="datetime-local"
                        value={fixedDateTime}
                        onChange={(e) => setFixedDateTime(e.target.value)}
                        placeholder="Keep first photo's date"
                        className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700/80 rounded-md text-sm text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                        Increment Interval (Seconds per photo)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="3600"
                        value={seqIntervalSec}
                        onChange={(e) => setSeqIntervalSec(parseInt(e.target.value, 10) || 1)}
                        className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700/80 rounded-md text-sm text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* TAB 2: CREATOR & PRESETS */}
          {activeTab === 'creator' && (
            <Card className="bg-zinc-900/40 border-zinc-800/80">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-purple-400" />
                    Photographer & Copyright Presets
                  </div>
                  <span className="text-[10px] text-emerald-400 font-mono">Auto-saved</span>
                </CardTitle>
                <CardDescription className="text-xs text-zinc-400">
                  Embed your copyright notice, photographer credit, and caption directly into EXIF Artist and Copyright fields.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                    Photographer / Artist Name
                  </label>
                  <input
                    type="text"
                    value={creator.artist}
                    onChange={(e) => updateCreatorField('artist', e.target.value)}
                    placeholder="e.g. Rahul Jena"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700/80 rounded-md text-sm text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                      Copyright Notice
                    </label>
                    {/* Quick Stamp Templates */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => stampCopyright('default')}
                        className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-all font-semibold"
                      >
                        Stamp © {new Date().getFullYear()}
                      </button>
                      <button
                        onClick={() => stampCopyright('ccby')}
                        className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-all font-semibold"
                      >
                        CC BY 4.0
                      </button>
                      <button
                        onClick={() => stampCopyright('clear')}
                        className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-all font-semibold"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={creator.copyright}
                    onChange={(e) => updateCreatorField('copyright', e.target.value)}
                    placeholder={`e.g. © ${new Date().getFullYear()} ${creator.artist || 'Creator'}. All rights reserved.`}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700/80 rounded-md text-sm text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                    Description / Caption / Headline
                  </label>
                  <textarea
                    rows={2}
                    value={creator.description}
                    onChange={(e) => updateCreatorField('description', e.target.value)}
                    placeholder="e.g. Archival family collection from Google Takeout export."
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700/80 rounded-md text-sm text-white focus:outline-none focus:border-purple-500 resize-none"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* TAB 3: LOCATION & PRIVACY */}
          {activeTab === 'location' && (
            <Card className="bg-zinc-900/40 border-zinc-800/80">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-purple-400" />
                  GPS Geolocation & Privacy
                </CardTitle>
                <CardDescription className="text-xs text-zinc-400">
                  Strip coordinates to protect home privacy, or inject custom coordinates into un-geotagged shots.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setLocationMode('keep')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      locationMode === 'keep'
                        ? 'border-purple-500 bg-purple-950/20 text-purple-200'
                        : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <div className="text-xs font-bold">Keep As-Is</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">Don't modify GPS</div>
                  </button>
                  <button
                    onClick={() => setLocationMode('strip')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      locationMode === 'strip'
                        ? 'border-rose-500 bg-rose-950/20 text-rose-200'
                        : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <div className="text-xs font-bold text-rose-400">Strip GPS (Privacy)</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">Remove all coords</div>
                  </button>
                  <button
                    onClick={() => setLocationMode('set')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      locationMode === 'set'
                        ? 'border-purple-500 bg-purple-950/20 text-purple-200'
                        : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <div className="text-xs font-bold">Set Coordinates</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">Inject Lat / Lng</div>
                  </button>
                </div>

                {locationMode === 'set' && (
                  <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                    <div>
                      <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                        Latitude
                      </label>
                      <input
                        type="text"
                        value={latitude}
                        onChange={(e) => setLatitude(e.target.value)}
                        placeholder="e.g. 28.6139"
                        className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700/80 rounded-md text-sm text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                        Longitude
                      </label>
                      <input
                        type="text"
                        value={longitude}
                        onChange={(e) => setLongitude(e.target.value)}
                        placeholder="e.g. 77.2090"
                        className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700/80 rounded-md text-sm text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Destination directory & Execution trigger */}
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-zinc-300 block">Output Destination</span>
                <span className="text-[11px] text-zinc-500">
                  {destDir ? `Saving directly into: ${(destDir as any).name}` : "Downloads automatically if no folder selected."}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePickDestFolder}
                className="border-zinc-800 hover:bg-zinc-800 text-xs font-semibold"
              >
                {destDir ? "Change Output Folder" : "Select Output Folder"}
              </Button>
            </div>

            {/* Run button */}
            <div className="pt-2 flex items-center gap-3">
              <Button
                onClick={handleRunBatch}
                disabled={isProcessing || photos.length === 0}
                className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold h-11 rounded-lg text-sm gap-2 shadow-lg shadow-purple-900/20"
              >
                <Play className="w-4 h-4 fill-current" />
                {isProcessing ? "Processing Batch..." : `Apply to ${photos.length} Photo${photos.length === 1 ? '' : 's'}`}
              </Button>

              {isProcessing && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => { abortRef.current = true }}
                  className="h-11 px-4"
                >
                  <Square className="w-4 h-4 fill-current" />
                </Button>
              )}
            </div>

            {/* Progress Bar */}
            {isProcessing && (
              <div className="space-y-1.5 pt-2">
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>{statusMsg}</span>
                  <span className="font-mono text-purple-400 font-bold">{progress}%</span>
                </div>
                <Progress value={progress} className="h-1.5 bg-zinc-800" />
              </div>
            )}

            {/* Downloads ready */}
            {!isProcessing && processedBlobs.length > 0 && !destDir && (
              <div className="pt-2">
                <Button
                  onClick={handleDownloadAll}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-9 gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download {processedBlobs.length} Processed Photos
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Right Preview Panel: Queued Photos & Computed Diff (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="bg-zinc-900/40 border-zinc-800/80 h-full flex flex-col">
            <CardHeader className="pb-3 border-b border-zinc-800/80">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <FileImage className="w-4 h-4 text-purple-400" />
                  Queued Photos ({photos.length})
                </CardTitle>
                <span className="text-[11px] text-zinc-500">Live Preview</span>
              </div>
            </CardHeader>
            <CardContent className="p-3 flex-1 flex flex-col">
              {photos.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-zinc-800 rounded-xl my-4">
                  <div className="p-3 rounded-full bg-zinc-900 text-zinc-600 mb-3">
                    <Upload className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-zinc-400">No photos loaded yet</p>
                  <p className="text-xs text-zinc-500 mt-1 max-w-[200px]">
                    Click "Select Files" or "Select Folder" above to queue photos for batch processing.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1 no-scrollbar flex-1">
                  {photos.map((item, idx) => {
                    const origDate = item.originalDate || new Date(item.file.lastModified)
                    const newDate = computeNewDate(origDate, idx)
                    const hasShift = origDate.getTime() !== newDate.getTime()

                    return (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80 flex flex-col gap-1.5 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-zinc-200 truncate max-w-[180px] font-medium">
                            {item.file.name}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono">
                            {(item.size / (1024 * 1024)).toFixed(1)} MB
                          </span>
                        </div>

                        {/* Dates preview */}
                        <div className="flex items-center justify-between text-[11px] pt-0.5">
                          <span className="text-zinc-500">
                            Orig: {origDate.toLocaleDateString()} {origDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className={`font-mono ${hasShift ? 'text-purple-400 font-bold' : 'text-zinc-400'}`}>
                            ➜ {newDate.toLocaleDateString()} {newDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        {/* Creator tag if set */}
                        {(creator.artist || creator.copyright) && (
                          <div className="text-[10px] text-zinc-400 truncate border-t border-zinc-900 pt-1">
                            {creator.artist && <span className="text-zinc-300 mr-2">👤 {creator.artist}</span>}
                            {creator.copyright && <span className="text-zinc-500 truncate">© {creator.copyright}</span>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  )
}
