import { RefreshCw, Save } from "lucide-react"
import { type KeyEntry } from "./types"
import { CopyButton } from "./CopyButton"

export function KeyCardActions({
  entry,
  editing,
  isSaving,
  onRotate,
  onSave,
}: Readonly<{
  entry: KeyEntry
  editing: boolean
  isSaving: boolean
  onRotate: () => void
  onSave: () => void
}>) {
  return (
    <div className="flex gap-2 flex-wrap">
      <CopyButton text={entry.value} />

      {entry.id === "gateway_api_key" && (
        <button
          type="button"
          onClick={onRotate}
          className="flex items-center gap-1.5 px-3 py-1.5 border text-[11px] font-bold rounded-lg transition-all active:scale-95 t-card-raised hover:opacity-90"
        >
          <RefreshCw className="w-3 h-3" /> Generate New
        </button>
      )}

      {editing && (
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-bold rounded-lg transition-all disabled:opacity-50 ml-auto shadow-sm active:scale-95 t-btn-inverted hover:opacity-90"
        >
          {isSaving ? (
            <span className="w-3 h-3 border border-zinc-500 border-t-white dark:border-t-zinc-950 rounded-full animate-spin" />
          ) : (
            <Save className="w-3 h-3" />
          )}
          Save
        </button>
      )}
    </div>
  )
}
