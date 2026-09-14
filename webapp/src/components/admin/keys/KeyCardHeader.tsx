import { Lock, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react"
import { type KeyEntry, maskValue } from "./types"

function formatPreview(entry: KeyEntry): string {
  if (!entry.value) return ""
  if (entry.sensitive) return maskValue(entry.value)
  const preview = entry.value.slice(0, 60)
  return entry.value.length > 60 ? `${preview}…` : preview
}

export function KeyCardHeader({
  entry,
  expanded,
  isEmpty,
  onToggle,
}: Readonly<{
  entry: KeyEntry
  expanded: boolean
  isEmpty: boolean
  onToggle: () => void
}>) {
  return (
    <button
      type="button"
      className="w-full text-left px-5 py-4 flex items-start gap-4 cursor-pointer select-none transition-colors t-card-bg hover:bg-zinc-50 dark:hover:bg-zinc-900"
      onClick={onToggle}
    >
      <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
        isEmpty ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
      }`} />

      <div className="flex-grow min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold t-heading-light">
            {entry.label}
          </span>
          {entry.sensitive && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border t-surface-badge">
              <Lock className="w-2.5 h-2.5" /> Secret
            </span>
          )}
          {isEmpty && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border t-badge-amber">
              <AlertTriangle className="w-2.5 h-2.5" /> Not Set
            </span>
          )}
        </div>
        {!expanded && entry.value && (
          <div className="mt-1 font-mono text-[11px] truncate t-text-muted">
            {formatPreview(entry)}
          </div>
        )}
      </div>

      <div className="flex-shrink-0 mt-1 t-text-dim">
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </div>
    </button>
  )
}
