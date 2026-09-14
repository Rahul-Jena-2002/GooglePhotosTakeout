import { CATEGORIES, type KeyEntry } from "./types"
import { KeyCard } from "./KeyCard"

export function KeysByCategory({
  loading,
  activeCategory,
  entries,
  saving,
  mekKey,
  onSave,
}: Readonly<{
  loading: boolean
  activeCategory: string
  entries: KeyEntry[]
  saving: string | null
  mekKey: CryptoKey | null
  onSave: (id: string, value: string) => Promise<void>
}>) {
  if (loading) {
    return (
      <div className="flex items-center gap-3 text-zinc-500 py-12 justify-center">
        <div className="w-4 h-4 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
        Loading keys from Firestore...
      </div>
    )
  }

  const activeCategories = activeCategory === "All" ? CATEGORIES : [activeCategory]

  return (
    <div className="space-y-6">
      {activeCategories.map(cat => {
        const catEntries = entries.filter(e => e.category === cat)
        if (catEntries.length === 0) return null
        const catConfigured = catEntries.filter(e => Boolean(e.value)).length

        return (
          <div key={cat}>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-[11px] font-bold uppercase tracking-widest t-text-subtle-label">
                {cat}
              </h2>
              <div className="flex-grow h-px t-divider" />
              <span className="text-[10px] font-mono t-text-dim">
                {catConfigured}/{catEntries.length} set
              </span>
            </div>
            <div className="space-y-3">
              {catEntries.map(entry => (
                <KeyCard
                  key={entry.id}
                  entry={entry}
                  onSave={onSave}
                  saving={saving}
                  mekKey={mekKey}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
