import React from "react"
import { Lock, Shield } from "lucide-react"

export function MekBanner({
  mek,
  mekInput,
  onMekInputChange,
  onMekInputKeyDown,
  onSubmit,
  onClear,
}: Readonly<{
  mek: string
  mekInput: string
  onMekInputChange: (val: string) => void
  onMekInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onSubmit: () => void
  onClear: () => void
}>) {
  if (!mek) {
    return (
      <div className="border rounded-xl p-5 flex gap-4 items-start shadow-sm t-banner-amber">
        <Lock className="w-5 h-5 mt-0.5 flex-shrink-0 t-amber-text" />
        <div className="flex-1 space-y-4">
          <div>
            <div className="text-sm font-bold t-amber-title">
              Master Encryption Key Required
            </div>
            <div className="text-xs mt-1 leading-relaxed t-amber-desc">
              Enter your 32-byte hex MEK to encrypt/decrypt sensitive keys. It is stored only in this session.
            </div>
          </div>
          <div className="flex gap-2 max-w-lg">
            <input
              type="password"
              placeholder="Enter 32-byte hex Master Encryption Key"
              value={mekInput}
              onChange={(e) => onMekInputChange(e.target.value)}
              onKeyDown={onMekInputKeyDown}
              className="flex-grow border rounded-lg px-3.5 py-2 text-xs font-mono transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 t-input-pure"
            />
            <button
              type="button"
              onClick={onSubmit}
              className="px-4 py-2 text-xs font-bold rounded-lg transition-all shadow-sm active:scale-95 t-btn-amber-solid hover:opacity-90"
            >
              Unlock
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="border rounded-xl p-4 flex gap-3 justify-between items-center shadow-sm t-badge-green">
      <div className="flex items-center gap-2 text-sm font-semibold t-green-text">
        <Shield className="w-4 h-4" />
        Master Encryption Key Active
      </div>
      <button
        type="button"
        onClick={onClear}
        className="px-2.5 py-1 text-xs font-bold rounded transition-all active:scale-95 shadow-sm t-badge-red hover:opacity-80"
      >
        Lock
      </button>
    </div>
  )
}
