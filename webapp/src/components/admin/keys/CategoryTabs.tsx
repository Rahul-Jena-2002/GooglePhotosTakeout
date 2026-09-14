import { CATEGORIES, type KeyEntry } from "./types"

export function CategoryTabs({
  activeCategory,
  entries,
  onSelectCategory,
}: Readonly<{
  activeCategory: string
  entries: KeyEntry[]
  onSelectCategory: (cat: string) => void
}>) {
  const allTabs = ["All", ...CATEGORIES]

  return (
    <div className="flex gap-2 flex-wrap border-b pb-3 t-border-zinc">
      {allTabs.map(cat => {
        const count = cat === "All"
          ? entries.length
          : entries.filter(e => e.category === cat).length
        const missingCount = cat === "All"
          ? entries.filter(e => !e.value).length
          : entries.filter(e => e.category === cat && !e.value).length
        const isActive = activeCategory === cat

        return (
          <button
            key={cat}
            type="button"
            onClick={() => onSelectCategory(cat)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
              isActive ? "t-btn-inverted" : "t-surface-badge hover:opacity-90"
            }`}
          >
            {cat}
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              missingCount > 0 ? "bg-amber-500/20 text-amber-500 font-bold" : "opacity-60"
            }`}>
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
