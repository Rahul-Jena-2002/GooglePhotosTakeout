import { Key, Shield, AlertTriangle } from "lucide-react"

export function KeysHeader({
  totalKeys,
  missingKeys,
}: Readonly<{ totalKeys: number; missingKeys: number }>) {
  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 t-heading">
          <Key className="w-6 h-6 t-text-secondary" /> Keys &amp; Secrets
        </h1>
        <p className="text-sm mt-1 t-text-secondary">
          All sensitive keys are stored in Firestore — never hardcoded in source or build bundles.
        </p>
      </div>
      <div
        className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-bold shadow-sm ${
          missingKeys === 0 ? "t-pill-health-good" : "t-pill-health-warn"
        }`}
      >
        {missingKeys === 0 ? (
          <><Shield className="w-4 h-4" /> All {totalKeys} keys configured</>
        ) : (
          <><AlertTriangle className="w-4 h-4" /> {missingKeys} of {totalKeys} keys missing</>
        )}
      </div>
    </div>
  )
}
