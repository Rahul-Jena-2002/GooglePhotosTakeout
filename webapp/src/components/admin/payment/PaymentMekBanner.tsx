import { Lock, Check } from "lucide-react"

export function PaymentMekBanner({
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
  return (
    <div className="p-5 rounded-2xl border transition-all t-callout-amber">
      {!mek ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div className="flex gap-3">
            <Lock className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold t-amber-highlight">
                Credentials Locked (No Session Key)
              </h4>
              <p className="text-xs mt-0.5 t-amber-sub">
                Enter your 32-byte hex MEK to decrypt and edit sensitive keys. Secrets will not be readable otherwise.
              </p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <input
              type="password"
              placeholder="Enter 32-byte hex key..."
              className="px-3.5 py-1.5 rounded-lg border text-xs font-mono w-full sm:w-64 focus:outline-none t-input-pure"
              value={mekInput}
              onChange={(e) => onMekInputChange(e.target.value)}
              onKeyDown={onMekInputKeyDown}
            />
            <button
              onClick={onSubmit}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-black bg-amber-500 hover:bg-amber-400 transition-colors"
            >
              Unlock
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between items-stretch sm:items-start">
          <div className="flex gap-3">
            <Check className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-emerald-500">
                Credentials Decrypted &amp; Unlocked
              </h4>
              <p className="text-xs mt-0.5 t-amber-muted">
                Active session key is active. Saving sensitive inputs will encrypt them dynamically.
              </p>
            </div>
          </div>
          <button
            onClick={onClear}
            className="w-full sm:w-auto px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-500 transition-colors text-center"
          >
            Lock Session
          </button>
        </div>
      )}
    </div>
  )
}
