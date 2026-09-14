export function CodeBlock({ code, label }: Readonly<{ code: string; label?: string }>) {
  return (
    <div className="relative group rounded-xl overflow-hidden border t-border-zinc">
      {label && (
        <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider border-b t-surface-muted">
          {label}
        </div>
      )}
      <pre className="p-4 text-[11px] font-mono overflow-x-auto leading-relaxed whitespace-pre-wrap break-all t-surface-pre">
        <code>{code}</code>
      </pre>
    </div>
  )
}
