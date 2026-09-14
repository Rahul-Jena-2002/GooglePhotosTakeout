import { Key, DollarSign, Tag, Gift } from "lucide-react"

export function PaymentNavTabs({
  activeTab,
  onSelectTab,
}: Readonly<{
  activeTab: string
  onSelectTab: (tab: string) => void
}>) {
  const tabs = [
    { id: "providers", label: "Gateway Credentials", shortLabel: "Credentials", icon: Key },
    { id: "pricing", label: "Regional Pricing & Sync", shortLabel: "Regional Pricing", icon: DollarSign },
    { id: "campaigns", label: "Campaign Manager", shortLabel: "Campaigns", icon: Tag },
    { id: "coupons", label: "Coupon Manager", shortLabel: "Coupons", icon: Gift },
  ]

  return (
    <>
      {/* Mobile Select Tab Selector (Scrollable pills row) */}
      <div className="md:hidden mb-6 overflow-x-auto whitespace-nowrap scrollbar-none pb-2 border-b t-border">
        <div className="flex gap-2">
          {tabs.map((t) => {
            const isActive = activeTab === t.id
            return (
              <button
                key={t.id}
                onClick={() => onSelectTab(t.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border ${
                  isActive ? "t-tab-active" : "t-tab-inactive"
                }`}
              >
                {t.shortLabel}
              </button>
            )
          })}
        </div>
      </div>

      {/* Desktop/Tablet Tab Bar */}
      <div className="hidden md:flex border-b overflow-x-auto whitespace-nowrap scrollbar-none mb-6 t-border">
        {tabs.map((t) => {
          const Icon = t.icon
          const isActive = activeTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => onSelectTab(t.id)}
              className={`flex items-center gap-2 px-6 py-3 border-b-2 text-xs font-bold transition-all ${
                isActive ? "t-subtab-active" : "t-subtab-inactive"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          )
        })}
      </div>
    </>
  )
}
