import { useState, useEffect } from "react"
import { ExternalLink } from "lucide-react"
import { type KeyEntry, generateKey } from "./types"
import { decrypt } from "../../../lib/crypto"
import { useToastStore } from "../../../store/useToastStore"
import { KeyCardHeader } from "./KeyCardHeader"
import { KeyCardInputControl } from "./KeyCardInputControl"
import { KeyCardActions } from "./KeyCardActions"

export function KeyCard({
  entry,
  onSave,
  saving,
  mekKey,
}: Readonly<{
  entry: KeyEntry
  onSave: (id: string, value: string) => Promise<void>
  saving: string | null
  mekKey: CryptoKey | null
}>) {
  const [revealed, setRevealed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(entry.value)
  const [expanded, setExpanded] = useState(false)
  const [decrypted, setDecrypted] = useState<string>("")
  const [isOverwriting, setIsOverwriting] = useState(false)

  useEffect(() => {
    const loadValue = async () => {
      if (entry.sensitive && entry.value?.startsWith("enc:v1:") && mekKey) {
        try {
          const decVal = await decrypt(entry.value, mekKey)
          setDecrypted(decVal)
          setDraft(decVal)
        } catch (err) {
          console.warn("Key decryption skipped or failed with active MEK:", err)
          setDecrypted("")
          setDraft("")
        }
      } else {
        setDecrypted("")
        setDraft(entry.value)
      }
      setEditing(false)
      setIsOverwriting(false)
    }
    loadValue()
  }, [entry.value, mekKey, entry.sensitive])

  const displayValue = editing ? draft : (decrypted || entry.value || "")

  const handleSave = async () => {
    await onSave(entry.id, draft)
    setEditing(false)
  }

  const handleRotate = () => {
    const newKey = generateKey("tf")
    setDraft(newKey)
    setEditing(true)
    useToastStore.getState().addToast("New key generated — click Save to apply it.", "info", 3000)
  }

  const isEmpty = !entry.value
  const isSaving = saving === entry.id

  return (
    <div 
      className={`border rounded-xl overflow-hidden transition-all shadow-sm t-card-bg ${
        isEmpty ? "t-card-unsaved" : "t-border-zinc"
      }`}
    >
      <KeyCardHeader
        entry={entry}
        expanded={expanded}
        isEmpty={isEmpty}
        onToggle={() => setExpanded(p => !p)}
      />

      {expanded && (
        <div className="border-t px-5 py-4 space-y-4 t-card-surface">
          <p className="text-xs leading-relaxed t-text-desc">
            {entry.description}
          </p>

          {entry.link && (
            <a
              href={entry.link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] font-medium hover:underline transition-colors t-indigo-link"
            >
              <ExternalLink className="w-3 h-3" /> {entry.linkLabel}
            </a>
          )}

          <div className="text-[10px] font-mono t-text-dim">
            Firestore: <span className="t-text-secondary">{entry.firestorePath}</span> → <span className="t-text-body">{entry.firestoreField}</span>
          </div>

          <div className="space-y-2">
            <KeyCardInputControl
              entry={entry}
              displayValue={displayValue}
              revealed={revealed}
              isOverwriting={isOverwriting}
              mekKey={mekKey}
              onDraftChange={(val) => {
                setDraft(val)
                setEditing(true)
              }}
              onToggleReveal={() => setRevealed(p => !p)}
              onStartOverwrite={() => {
                setIsOverwriting(true)
                setDraft("")
                setEditing(true)
              }}
              onCancelOverwrite={() => {
                setIsOverwriting(false)
                setEditing(false)
                setDraft(decrypted || entry.value)
              }}
            />

            <KeyCardActions
              entry={entry}
              editing={editing}
              isSaving={isSaving}
              onRotate={handleRotate}
              onSave={handleSave}
            />
          </div>
        </div>
      )}
    </div>
  )
}
