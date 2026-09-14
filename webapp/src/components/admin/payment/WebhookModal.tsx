import { Link2, X, Copy } from "lucide-react"
import { useToastStore } from "../../../store/useToastStore"

export function WebhookModal({
  cloudFunctionUrl,
  onClose,
}: Readonly<{
  cloudFunctionUrl: string
  onClose: () => void
}>) {
  const hooks = [
    { gw: "Stripe", path: "/webhooks/stripe", desc: "For processing Stripe card checkout events" },
    { gw: "Dodo Payments", path: "/dodo-webhook", desc: "For processing live/test Dodo Payments subscription & upgrade checkouts" },
    { gw: "Lemon Squeezy", path: "/webhooks/lemonsqueezy", desc: "For Lemon Squeezy checkout webhooks" },
    { gw: "Paddle", path: "/webhooks/paddle", desc: "For Paddle checkout subscription events" },
  ]

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 t-card-modal">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b t-border">
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2 t-heading">
              <Link2 className="w-4 h-4 text-indigo-400" /> Webhook Endpoints Configuration
            </h3>
            <p className="text-[10px] text-zinc-550 font-medium mt-0.5">
              Configure these listener URLs in your payment dashboards to capture transactions and upgrades.
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer t-text-secondary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
          {hooks.map((x) => {
            const fullUrl = cloudFunctionUrl 
              ? `${cloudFunctionUrl.replace(/\/$/, "")}${x.path}` 
              : `https://us-central1-takeout-fix.cloudfunctions.net/geminiToolGateway${x.path}`

            return (
              <div key={x.gw} className="p-4 border rounded-xl space-y-2 t-banner-tint">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-[10px] uppercase tracking-wider t-text-contrast-dark-subtle">
                    {x.gw} Hook
                  </span>
                  <span className="text-[9px] text-zinc-500 font-medium">{x.desc}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 font-mono text-[10px] p-2 rounded-lg overflow-x-auto whitespace-nowrap text-indigo-400 select-all scrollbar-none border t-card">
                    {fullUrl}
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(fullUrl)
                      useToastStore.getState().addToast(`${x.gw} webhook URL copied!`, "success", 3000, "Copied")
                    }}
                    className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-all flex items-center justify-center flex-shrink-0 cursor-pointer"
                    title="Copy to clipboard"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Modal Footer */}
        <div className="flex justify-end px-6 py-4 border-t t-surface-subtle-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold rounded-xl border hover:opacity-90 transition-all cursor-pointer t-border-text-secondary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
