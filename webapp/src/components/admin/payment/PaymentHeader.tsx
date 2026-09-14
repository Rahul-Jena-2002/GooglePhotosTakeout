export function PaymentHeader({
  originalActiveGateway,
}: Readonly<{ originalActiveGateway: string }>) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6 t-border">
      <div>
        <h1 className="text-3xl font-black tracking-tight t-heading">
          Universal Payment Gateway
        </h1>
        <p className="text-sm mt-1 t-text-muted">
          Manage merchant integrations, localized regional pricing tiers, promotions, campaigns, and dynamic coupons.
        </p>
      </div>
      
      <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl border text-xs font-semibold t-indigo-banner">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        Active Gateway: <strong className="uppercase">{originalActiveGateway}</strong>
      </div>
    </div>
  )
}
