import { useState } from "react"
import { Copy, Check } from "lucide-react"

export function CopyButton({ text, small = false }: Readonly<{ text: string; small?: boolean }>) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!text}
      className={`flex items-center gap-1.5 font-bold rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed border t-card-raised hover:opacity-90 ${small ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-[11px]"}`}
    >
      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied!" : "Copy"}
    </button>
  )
}
