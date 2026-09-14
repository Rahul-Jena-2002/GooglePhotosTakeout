import { Zap } from "lucide-react"

export function InfoBanner() {
  return (
    <div className="border rounded-xl p-4 flex gap-3 items-start shadow-sm t-surface-banner-subtle">
      <Zap className="w-4 h-4 mt-0.5 flex-shrink-0 t-text-dim" />
      <div className="text-xs leading-relaxed space-y-1.5 t-text-desc">
        <p>
          <span className="font-semibold t-heading-light">Runtime keys</span>{' '}
          (gateway, API keys, Dodo secrets) are updated live without rebuilding.
        </p>
        <p>
          <span className="font-semibold t-heading-light">Build-time keys</span>{' '}
          (Firebase API key, Sentry DSN) require a new frontend build (<code className="px-1 py-0.5 rounded font-mono text-[10px] t-surface-code">npm run build</code>) to take effect.
        </p>
      </div>
    </div>
  )
}
