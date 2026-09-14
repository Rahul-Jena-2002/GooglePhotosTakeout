import React from "react"
import { Lock, Eye, EyeOff } from "lucide-react"
import { type KeyEntry } from "./types"

export function KeyCardInputControl({
  entry,
  displayValue,
  revealed,
  isOverwriting,
  mekKey,
  onDraftChange,
  onToggleReveal,
  onStartOverwrite,
  onCancelOverwrite,
}: Readonly<{
  entry: KeyEntry
  displayValue: string
  revealed: boolean
  isOverwriting: boolean
  mekKey: CryptoKey | null
  onDraftChange: (val: string) => void
  onToggleReveal: () => void
  onStartOverwrite: () => void
  onCancelOverwrite: () => void
}>) {
  const isEncryptedLocked = entry.sensitive && entry.value?.startsWith("enc:v1:") && !mekKey && !isOverwriting

  if (isEncryptedLocked) {
    return (
      <div className="flex gap-2 w-full">
        <div className="flex-grow border rounded-lg px-4 py-2.5 text-xs font-mono flex items-center gap-2 h-10 select-none t-surface-dim">
          <Lock className="w-3.5 h-3.5 t-text-faint" />
          🔒 Encrypted — Enter MEK to unlock or click Overwrite
        </div>
        <button
          type="button"
          onClick={onStartOverwrite}
          className="px-3 py-2 border rounded-lg text-xs font-bold transition-all whitespace-nowrap active:scale-95 text-[11px] t-card-raised-input hover:opacity-90"
        >
          Overwrite
        </button>
      </div>
    )
  }

  const inputType = revealed || !entry.sensitive ? "text" : "password"
  const placeholder = entry.placeholder.startsWith("sk_") ? entry.placeholder.substring(8) : entry.placeholder

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value
    if ((entry.id === "dodo_api_key" && val.startsWith("sk_live_")) || (entry.id === "dodo_test_api_key" && val.startsWith("sk_test_"))) {
      val = val.substring(8)
    }
    onDraftChange(val)
  }

  return (
    <div className="relative w-full">
      <div className="flex items-center rounded-lg border focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all overflow-hidden h-10 t-input-pure-border">
        <input
          type={inputType}
          value={displayValue}
          onChange={handleInputChange}
          placeholder={placeholder}
          className="flex-grow h-full px-3 border-none bg-transparent text-xs font-mono focus:outline-none t-text-primary"
        />
      </div>
      {isOverwriting && (
        <button
          type="button"
          onClick={onCancelOverwrite}
          className="absolute right-12 top-1/2 -translate-y-1/2 text-[10px] font-bold text-red-500 hover:underline z-10"
        >
          Cancel
        </button>
      )}
      {entry.sensitive && (
        <button
          type="button"
          onClick={onToggleReveal}
          className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors z-10 t-text-dim hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  )
}
