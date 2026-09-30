/**
 * ExifViewerPanel — Deep EXIF, Camera IFD, and GPS Metadata Viewer.
 *
 * Allows inspecting any photo's internal headers, camera settings,
 * exposure, aperture, ISO, timestamps, and GPS coordinates with map links.
 */
import React, { useRef } from "react"
import { Eye, MapPin, Camera, Info, UploadCloud, FileImage, ExternalLink } from "lucide-react"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"

interface ExifViewerPanelProps {
  viewerFile: File | null
  viewerExif: Record<string, any> | null
  viewerLoading: boolean
  handleViewerFileChange: (file: File) => void
}

export function ExifViewerPanel({
  viewerFile,
  viewerExif,
  viewerLoading,
  handleViewerFileChange,
}: ExifViewerPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleViewerFileChange(e.dataTransfer.files[0])
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const lat = viewerExif?.gpsInfo?.["Latitude"]
  const lon = viewerExif?.gpsInfo?.["Longitude"]
  const hasGps = Boolean(lat && lon)

  return (
    <div className="flex-grow flex flex-col p-4 sm:p-6 bg-white dark:bg-[#0D0E12] text-zinc-900 dark:text-zinc-100 transition-colors overflow-y-auto max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="mb-6 border-b border-zinc-200 dark:border-zinc-800 pb-5">
        <div className="flex items-center gap-2 mb-1">
          <Eye className="w-5 h-5 text-zinc-700 dark:text-zinc-300" />
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white tracking-wide uppercase">
            EXIF &amp; GPS Metadata Inspector
          </h2>
          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 font-bold">
            Binary Header Analyzer
          </span>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Inspect embedded EXIF IFD headers, camera hardware specs, capture dates, and GPS coordinates.
        </p>
      </div>

      {/* Dropzone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileInputRef.current?.click()}
        className="mb-6 p-8 rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-950/60 hover:bg-zinc-100/50 dark:hover:bg-zinc-900/40 text-center cursor-pointer transition-all"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleViewerFileChange(e.target.files[0])
            }
          }}
        />
        <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 flex items-center justify-center mx-auto mb-3">
          <UploadCloud className="w-6 h-6" />
        </div>
        <div className="text-sm font-bold text-zinc-900 dark:text-white">
          {viewerFile ? viewerFile.name : "Drop a photo or video here to inspect EXIF"}
        </div>
        <p className="text-xs text-zinc-500 mt-1">
          Supports JPEG, Apple HEIC, PNG, WebP, MP4, and QuickTime MOV. 100% client-side.
        </p>
      </div>

      {viewerLoading && (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-2 border-zinc-900 dark:border-zinc-100 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">Parsing binary EXIF IFDs...</span>
        </div>
      )}

      {viewerExif && !viewerLoading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* File Info */}
          <Card className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 shadow-sm">
            <CardHeader className="py-3 px-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                <FileImage className="w-4 h-4 text-zinc-500" /> File Information
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2 text-xs font-mono">
              {Object.entries(viewerExif.fileInfo || {}).map(([k, v]) => (
                <div key={k} className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-900">
                  <span className="text-zinc-500">{k}</span>
                  <span className="text-zinc-900 dark:text-white font-semibold truncate max-w-[180px]">{String(v)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Camera Info */}
          <Card className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 shadow-sm">
            <CardHeader className="py-3 px-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                <Camera className="w-4 h-4 text-zinc-500" /> Camera &amp; Capture
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2 text-xs font-mono">
              {Object.keys(viewerExif.cameraInfo || {}).length === 0 ? (
                <div className="text-zinc-400 dark:text-zinc-600 italic py-2">No camera IFD found</div>
              ) : (
                Object.entries(viewerExif.cameraInfo).map(([k, v]) => (
                  <div key={k} className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-900">
                    <span className="text-zinc-500">{k}</span>
                    <span className="text-zinc-900 dark:text-white font-semibold truncate max-w-[180px]">{String(v)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* GPS Info */}
          <Card className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 shadow-sm">
            <CardHeader className="py-3 px-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-zinc-500" /> GPS Geolocation
                </span>
                {hasGps && (
                  <a
                    href={`https://www.google.com/maps?q=${lat},${lon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-zinc-900 dark:text-zinc-100 hover:underline flex items-center gap-1 font-bold"
                  >
                    Open Map <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2 text-xs font-mono">
              {!hasGps ? (
                <div className="text-zinc-400 dark:text-zinc-600 italic py-2">No GPS coordinates recorded in EXIF</div>
              ) : (
                Object.entries(viewerExif.gpsInfo).map(([k, v]) => (
                  <div key={k} className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-900">
                    <span className="text-zinc-500">{k}</span>
                    <span className="text-zinc-900 dark:text-white font-semibold">{String(v)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
