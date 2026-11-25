import { Key, Eye, EyeOff, RefreshCw, Save } from "lucide-react"
import { GATEWAY_CREDENTIALS, type usePaymentCredentials } from "./usePaymentCredentials"

type CredentialFields = Pick<ReturnType<typeof usePaymentCredentials>, "mekKey" | "credentials" | "setCredentials" | "decryptedValues" | "visibleKeys" | "savingCreds" | "toggleVisibility" | "handleSaveCredential">

export function PaymentCredentialFields({ activeGateway, model }: { activeGateway: string; model: CredentialFields }) {
  const { mekKey, credentials, setCredentials, decryptedValues, visibleKeys, savingCreds, toggleVisibility, handleSaveCredential } = model
  return (
    <>
      <h2 className="text-lg font-bold flex items-center gap-2 t-heading">
        <Key className="w-5 h-5 text-indigo-500" />
        API Credentials for <span className="uppercase">{activeGateway}</span>
      </h2>
      <p className="text-xs mt-1 mb-6 t-text-muted">
        Configure keys and signature validators required for transaction initialization.
      </p>

      <div className="space-y-6">
        {(GATEWAY_CREDENTIALS[activeGateway] || []).map((def) => {
          const encryptedVal = credentials[def.id] || ""
          const isEncrypted = def.sensitive && encryptedVal.startsWith("enc:v1:")
          const decryptedVal = decryptedValues[def.id] || ""
          const displayVal = def.sensitive
            ? (isEncrypted ? (mekKey ? decryptedVal : "") : encryptedVal)
            : encryptedVal
          return (
            <div key={def.id} className="p-3 sm:p-4 rounded-xl border space-y-3 w-full min-w-0 t-border-alt">
              <div className="flex justify-between items-start w-full min-w-0 gap-2">
                <div className="min-w-0 flex-1">
                  <label className="text-xs font-extrabold block truncate t-heading-light">
                    {def.label}
                  </label>
                  <span className="text-[10px] block mt-0.5 t-text-subtle-hint">
                    {def.description}
                  </span>
                </div>
                {isEncrypted && (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border shrink-0"
                        >
                    {mekKey ? "🔓 Decrypted" : "🔒 Encrypted"}
                  </span>
                )}
              </div>

              <div className="flex gap-2 w-full min-w-0">
                <div className="relative flex-1 min-w-0">
                  <div className="flex items-center rounded-lg border focus-within:ring-1 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all overflow-hidden h-9 w-full min-w-0 t-input-subtle-card-2"
                  >
                    <input
                      type={def.sensitive && !visibleKeys[def.id] ? "password" : "text"}
                      disabled={isEncrypted && !mekKey}
                      placeholder={isEncrypted && !mekKey
                        ? "🔒 Locked — Enter MEK in banner above to decrypt"
                        : def.placeholder}
                      value={displayVal}
                      onChange={(e) => {
                        setCredentials(prev => ({ ...prev, [def.id]: e.target.value }))
                      }}
                      className="w-full min-w-0 flex-grow h-full px-3 border-none bg-transparent text-xs font-mono focus:outline-none disabled:opacity-60 t-text-primary"
                    />
                  </div>
                  {def.sensitive && (!(isEncrypted && !mekKey)) && (
                    <button
                      type="button"
                      onClick={() => toggleVisibility(def.id)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 hover:opacity-80 z-10"
                    >
                      {visibleKeys[def.id] ? <EyeOff className="w-4 h-4 text-zinc-500" /> : <Eye className="w-4 h-4 text-zinc-500" />}
                    </button>
                  )}
                </div>

                <button
                  disabled={savingCreds === def.id || (isEncrypted && !mekKey)}
                  onClick={() => handleSaveCredential(def, displayVal)}
                  className="h-9 px-4 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {savingCreds === def.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
