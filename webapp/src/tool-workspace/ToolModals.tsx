/**
 * ToolModals — all fixed-position modal overlays for ToolWorkspace.
 * Includes: QuotaAlert, PopupModal, CompareModal, PermissionModal, RestoreCompleteModal.
 */
import { AlertCircle, CheckCircle2, FolderUp, HardDrive, Play, X } from "lucide-react"
import { Button } from "../components/ui/button"

interface ToolModalsProps {
  // Quota Alert
  quotaAlert: { open: boolean; message: string } | null
  setQuotaAlert: (v: { open: boolean; message: string } | null) => void
  // Generic popup (ad-block / errors)
  popupModal: { title: string; message: string; type: 'error' | 'warning' } | null
  setPopupModal: (v: { title: string; message: string; type: 'error' | 'warning' } | null) => void
  // Compare methods explanation modal
  showCompareModal: boolean
  setShowCompareModal: (v: boolean) => void
  // Permission grant modal
  modalContext: 'source' | 'destination' | null
  setModalContext: (v: 'source' | 'destination' | null) => void
  handleModalConfirm: () => void
  // Restore complete modal
  showRestoreComplete: boolean
  restoreCompleteStats: { scanned: number; matched: number; unmatched: number; errors: number }
  onRestoreAnother: () => void
  onRestoreCompleteDismiss: () => void
}

export function ToolModals({
  quotaAlert,
  setQuotaAlert,
  popupModal,
  setPopupModal,
  showCompareModal,
  setShowCompareModal,
  modalContext,
  setModalContext,
  handleModalConfirm,
  showRestoreComplete,
  restoreCompleteStats,
  onRestoreAnother,
  onRestoreCompleteDismiss,
}: ToolModalsProps) {
  return (
    <>
      {/* ── Quota Alert ─────────────────────────────────────────────────── */}
      {quotaAlert && quotaAlert.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="bg-zinc-950 border border-white/10 p-8 rounded-2xl max-w-md w-full text-center relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 left-0 right-0 h-1 bg-zinc-800 dark:bg-zinc-200"></div>
            <AlertCircle className="w-12 h-12 text-zinc-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Restoration Limit Reached</h3>
            <p className="text-zinc-400 text-sm mb-6 leading-relaxed">{quotaAlert.message}</p>
            <div className="space-y-3">
              <a href="/pricing">
                <Button className="btn-monochrome-primary w-full font-bold h-12 rounded-lg border-0 shadow-none transition-all duration-150 cursor-pointer">
                  Upgrade Plan
                </Button>
              </a>
              <Button
                onClick={() => setQuotaAlert(null)}
                className="btn-monochrome-primary w-full h-12 font-bold rounded-lg border-0 shadow-none transition-all duration-150 cursor-pointer"
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Generic Popup (ad-block / error) ────────────────────────────── */}
      {popupModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none">
          <div className="bg-zinc-950 border border-white/10 p-8 rounded-2xl max-w-md w-full text-center relative overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className={`absolute top-0 left-0 right-0 h-1 ${popupModal.type === 'error' ? 'bg-red-500' : 'bg-amber-500'}`}></div>
            <AlertCircle className={`w-12 h-12 ${popupModal.type === 'error' ? 'text-red-500/80' : 'text-amber-500/80'} mx-auto mb-4`} />
            <h3 className="text-xl font-bold text-white mb-2">{popupModal.title}</h3>
            <p className="text-zinc-400 text-sm mb-6 leading-relaxed whitespace-pre-line">{popupModal.message}</p>
            <div>
              <Button
                onClick={() => setPopupModal(null)}
                className="btn-monochrome-primary w-full h-12 font-bold rounded-lg border-0 shadow-none transition-all duration-150 cursor-pointer"
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Compare Restore Methods modal ─────────────────────────────── */}
      {showCompareModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-white/10 p-6 sm:p-8 rounded-3xl max-w-2xl w-full relative overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-350">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>

            <button
              onClick={() => setShowCompareModal(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-black text-white mb-2 flex items-center gap-2">
              <span>Comparing Restore Methods</span>
            </h3>
            <p className="text-zinc-400 text-xs mb-6">
              Google Takeout separates original metadata into standalone <code className="bg-white/5 px-1 py-0.5 rounded text-[10px] text-indigo-300 font-mono">.json</code> sidecar records. Here is how our engine handles them:
            </p>

            <div className="space-y-4 mb-6 text-left">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="bg-white/[0.01] border border-white/5 p-4 rounded-xl space-y-1.5">
                  <h4 className="font-bold text-zinc-200 flex items-center gap-1.5">
                    <span className="text-emerald-400">⚡</span> Regular Restore (External Link)
                  </h4>
                  <p className="text-zinc-450 leading-relaxed">
                    Keeps the photo and JSON separate but pairs them side-by-side in your restored directory. It streams files instantly without loading media bytes into heap memory.
                  </p>
                  <p className="text-[10px] text-emerald-450 font-bold">Fastest processing speed.</p>
                </div>
                <div className="bg-white/[0.01] border border-white/5 p-4 rounded-xl space-y-1.5">
                  <h4 className="font-bold text-zinc-200 flex items-center gap-1.5">
                    <span className="text-indigo-400">🌀</span> Deep Restore (Internal Injection)
                  </h4>
                  <p className="text-zinc-450 leading-relaxed">
                    Reads, decodes, and forces dates and GPS coordinates directly inside the image EXIF binary headers. Photos become self-contained, repair is permanent.
                  </p>
                  <p className="text-[10px] text-indigo-400 font-bold">Universal compatibility across all devices and drives.</p>
                </div>
              </div>

              <div className="overflow-x-auto border border-white/5 rounded-xl bg-black/20">
                <table className="w-full text-[11px] text-zinc-400 border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/[0.02] text-left text-zinc-300 font-bold">
                      <th className="p-3">Feature</th>
                      <th className="p-3">Regular Restore</th>
                      <th className="p-3 text-indigo-300">Deep Restore</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-medium">
                    <tr>
                      <td className="p-3 font-semibold text-white">Date &amp; Time</td>
                      <td className="p-3">Yes (Updates file system)</td>
                      <td className="p-3 text-zinc-350">Yes (Injects EXIF)</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-white">GPS Locations</td>
                      <td className="p-3">Yes (Pairs companion JSON)</td>
                      <td className="p-3 text-zinc-350">Yes (Injects EXIF)</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-white">Portability</td>
                      <td className="p-3 text-red-400/80">Low (Moving can lose tags)</td>
                      <td className="p-3 text-emerald-400/80">Universal (Embedded)</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-white">Processing Speed</td>
                      <td className="p-3 text-emerald-400/80 font-bold">Extremely Fast</td>
                      <td className="p-3 text-amber-500/80">Slower (Rewrites Files)</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-white">Log Indicator</td>
                      <td className="p-3 font-mono text-[10px]">`[RESTORED] (Linked)`</td>
                      <td className="p-3 font-mono text-[10px] text-indigo-300">`[DEEP INJECTED] (Embedded)`</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={() => setShowCompareModal(false)}
                className="btn-monochrome-primary w-24 h-10 font-bold rounded-lg border-0 shadow-none transition-all duration-150 cursor-pointer"
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Permission Grant modal (source / destination) ─────────────── */}
      {modalContext && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-white/10 p-6 sm:p-8 rounded-2xl max-w-md w-full text-left relative overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-purple-600"></div>

            <button
              onClick={() => setModalContext(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                {modalContext === 'source' ? (
                  <FolderUp className="w-5 h-5" />
                ) : (
                  <HardDrive className="w-5 h-5" />
                )}
              </div>
              <h3 className="text-lg font-bold text-white">
                {modalContext === 'source' ? 'Grant Folder Read Access' : 'Grant Folder Write Access'}
              </h3>
            </div>

            <p className="text-zinc-300 text-xs leading-relaxed mb-4">
              {modalContext === 'source'
                ? "To start scanning, TakeoutFix needs permission to view and parse the files inside your Google Takeout folder."
                : "TakeoutFix needs permission to write, create, and save your newly restored photos directly into this destination folder."
              }
            </p>

            <div className="bg-white/[0.02] border border-white/5 p-3 rounded-xl text-[10px] text-zinc-400 leading-relaxed mb-6">
              {modalContext === 'source' ? (
                <>
                  <span className="font-bold text-zinc-300 block mb-0.5">Read-Only Safety</span>
                  Your original Google Takeout files will not be changed, modified, or deleted in any way.
                </>
              ) : (
                <>
                  <span className="font-bold text-amber-500 block mb-0.5">Overwrite Protection</span>
                  Please select an empty folder to keep your restored library clean and prevent overwriting existing files.
                </>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <Button
                onClick={() => setModalContext(null)}
                className="btn-monochrome-secondary h-9 text-xs px-4 font-bold rounded-lg transition-all border border-white/10 hover:bg-white/5 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                onClick={handleModalConfirm}
                className="btn-monochrome-primary h-9 text-xs px-4 font-bold rounded-lg transition-all border-0"
              >
                Grant Access
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Restore Complete Modal ───────────────────────────────────────── */}
      {showRestoreComplete && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-white/10 p-8 rounded-2xl max-w-md w-full text-center relative overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Monochrome top bar — same as quota / permission modals */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-zinc-800 dark:bg-zinc-200"></div>

            {/* Dismiss X */}
            <button
              onClick={onRestoreCompleteDismiss}
              className="absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/10 transition-all duration-150 cursor-pointer"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            {/* Icon — same style as other modals */}
            <div className="w-14 h-14 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-7 h-7 text-white/80" />
            </div>

            {/* Title */}
            <h3 className="text-xl font-bold text-white mb-2">Restoration Complete</h3>

            {/* Hero number */}
            <div className="mb-5">
              <div className="text-5xl font-black text-white tracking-tighter">
                {restoreCompleteStats.scanned.toLocaleString()}
              </div>
              <div className="text-zinc-500 text-[11px] font-semibold uppercase tracking-widest mt-1.5">
                files processed
              </div>
            </div>

            {/* Stat pills — monochrome, no colors */}
            <div className="flex items-center justify-center gap-2 mb-6 flex-wrap">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold bg-white/[0.04] border border-white/10 text-zinc-300">
                <span className="text-white/50">✓</span>
                <span>{restoreCompleteStats.matched.toLocaleString()} Restored</span>
              </div>
              {restoreCompleteStats.unmatched > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold bg-white/[0.04] border border-white/10 text-zinc-400">
                  <span className="text-white/30">—</span>
                  <span>{restoreCompleteStats.unmatched.toLocaleString()} Unmatched</span>
                </div>
              )}
              {restoreCompleteStats.errors > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold bg-white/[0.04] border border-white/10 text-zinc-400">
                  <span className="text-white/30">✕</span>
                  <span>{restoreCompleteStats.errors.toLocaleString()} Errors</span>
                </div>
              )}
            </div>

            {/* Description */}
            <p className="text-zinc-500 text-xs mb-6 leading-relaxed">
              Metadata has been embedded. Dates, GPS, and timestamps are now restored in your files.
            </p>

            {/* Action buttons */}
            <div className="space-y-3">
              <Button
                onClick={onRestoreAnother}
                className="btn-monochrome-primary w-full h-12 font-bold rounded-lg border-0 shadow-none transition-all duration-150 cursor-pointer flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" /> Restore Another Archive
              </Button>
              <Button
                onClick={onRestoreCompleteDismiss}
                className="btn-monochrome-primary w-full h-10 font-bold rounded-lg border-0 shadow-none transition-all duration-150 cursor-pointer"
              >
                View Results & Logs
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
