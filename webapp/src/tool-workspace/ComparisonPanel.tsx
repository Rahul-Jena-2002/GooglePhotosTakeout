/**
 * ComparisonPanel — Google Takeout JSON Sidecar vs Image EXIF Comparator.
 *
 * Provides a side-by-side comparative inspection between a photo/video
 * and its Google Photos companion .json metadata sidecar.
 */
import { useRef } from "react"
import { Scale, CheckCircle2, XCircle, FileImage, FileJson, ArrowRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"

interface ComparisonPanelProps {
  compMediaFile: File | null
  compJsonFile: File | null
  compResult: Record<string, any> | null
  handleCompFilesChange: (media: File | null, json: File | null) => void
}

export function ComparisonPanel({
  compMediaFile,
  compJsonFile,
  compResult,
  handleCompFilesChange,
}: ComparisonPanelProps) {
  const mediaInputRef = useRef<HTMLInputElement>(null)
  const jsonInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex-grow flex flex-col p-4 sm:p-6 bg-black text-zinc-200 overflow-y-auto max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="mb-6 border-b border-zinc-800 pb-5">
        <div className="flex items-center gap-2 mb-1">
          <Scale className="w-5 h-5 text-amber-400" />
          <h2 className="text-lg font-bold text-white tracking-wide uppercase">
            Sidecar vs. Media Comparator
          </h2>
          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
            EXIF Diff Tool
          </span>
        </div>
        <p className="text-xs text-zinc-400">
          Compare a Google Takeout JSON sidecar against its paired photo or video to verify timestamp and GPS alignment.
        </p>
      </div>

      {/* Dual File Pickers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Media File Picker */}
        <Card
          onClick={() => mediaInputRef.current?.click()}
          className="bg-zinc-950/60 border-zinc-800 hover:border-zinc-700 cursor-pointer transition-all"
        >
          <input
            ref={mediaInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleCompFilesChange(e.target.files[0], null)
              }
            }}
          />
          <CardHeader className="py-3 px-4 border-b border-zinc-800/80 bg-zinc-900/40">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
              <FileImage className="w-4 h-4 text-indigo-400" /> 1. Select Media File (Photo/Video)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 text-center">
            {compMediaFile ? (
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs">
                <span className="font-mono text-white truncate mr-2">{compMediaFile.name}</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              </div>
            ) : (
              <div className="text-xs text-zinc-400 py-3">Click or drop image / video here</div>
            )}
          </CardContent>
        </Card>

        {/* JSON File Picker */}
        <Card
          onClick={() => jsonInputRef.current?.click()}
          className="bg-zinc-950/60 border-zinc-800 hover:border-zinc-700 cursor-pointer transition-all"
        >
          <input
            ref={jsonInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleCompFilesChange(null, e.target.files[0])
              }
            }}
          />
          <CardHeader className="py-3 px-4 border-b border-zinc-800/80 bg-zinc-900/40">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
              <FileJson className="w-4 h-4 text-amber-400" /> 2. Select Google Takeout JSON Sidecar
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 text-center">
            {compJsonFile ? (
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs">
                <span className="font-mono text-white truncate mr-2">{compJsonFile.name}</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              </div>
            ) : (
              <div className="text-xs text-zinc-400 py-3">Click or drop companion .json file here</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Comparison Results Card */}
      {compResult && (
        <Card className="bg-zinc-950 border-zinc-800 mb-6">
          <CardHeader className="py-3 px-4 border-b border-zinc-800 bg-zinc-900/40">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center justify-between">
              <span>Metadata Alignment Matrix</span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                compResult.checks?.fileNameMatch ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
              }`}>
                {compResult.checks?.fileNameMatch ? '✓ Filenames Paired' : '✗ Filenames Mismatch'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Media File Data */}
              <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800">
                <div className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider mb-2">Media File (EXIF)</div>
                <div className="space-y-1.5 text-xs font-mono">
                  <div><span className="text-zinc-500">Name:</span> <span className="text-white">{compResult.media?.name}</span></div>
                  <div><span className="text-zinc-500">Size:</span> <span className="text-zinc-300">{compResult.media?.size}</span></div>
                  <div><span className="text-zinc-500">EXIF Date:</span> <span className="text-zinc-300">{compResult.media?.date}</span></div>
                  <div><span className="text-zinc-500">GPS:</span> <span className="text-zinc-300">{compResult.media?.gps}</span></div>
                </div>
              </div>

              {/* JSON Sidecar Data */}
              <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800">
                <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider mb-2">Google Photos Sidecar (JSON)</div>
                <div className="space-y-1.5 text-xs font-mono">
                  <div><span className="text-zinc-500">Title:</span> <span className="text-white">{compResult.json?.title}</span></div>
                  <div><span className="text-zinc-500">Photo Time:</span> <span className="text-zinc-300">{compResult.json?.time}</span></div>
                  <div><span className="text-zinc-500">Geo Coordinates:</span> <span className="text-zinc-300">{compResult.json?.gps}</span></div>
                </div>
              </div>
            </div>

            {/* Verdict */}
            <div className="p-3 rounded-lg bg-black border border-zinc-800/80 text-xs flex items-center justify-between">
              <span className="text-zinc-400">Restoration Verdict:</span>
              <span className="font-semibold text-white">
                {compResult.checks?.fileNameMatch
                  ? "✓ Companion JSON matches. Ready for binary EXIF header injection."
                  : "⚠ Potential mismatch. Ensure the sidecar corresponds to this photo."}
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
