import { Terminal, FileText } from "lucide-react"
import { CopyButton } from "./CopyButton"
import { CodeBlock } from "./CodeBlock"

export function ConfigFilesSection({
  frontendEnvText,
  localServerEnvText,
  functionsConfigText,
  indexNowScriptText,
}: Readonly<{
  frontendEnvText: string
  localServerEnvText: string
  functionsConfigText: string
  indexNowScriptText: string
}>) {
  return (
    <>
      <div className="h-px t-divider" />
      <h2 className="text-[11px] font-bold uppercase tracking-widest flex items-center gap-2 t-text-subtle-label">
        <FileText className="w-3.5 h-3.5" /> Generated Config Files
      </h2>

      {/* webapp/.env (build-time) */}
      <div className="border rounded-xl p-5 space-y-3 shadow-sm t-card-zinc">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider t-text-secondary">
              webapp/.env — Build-time Variables
            </h3>
            <p className="text-xs mt-1 t-text-dim">
              Copy into <code className="px-1.5 py-0.5 rounded font-mono text-[10px] t-surface-code">webapp/.env</code> — baked into the static build, safe to expose.
            </p>
          </div>
          <CopyButton text={frontendEnvText} />
        </div>
        <CodeBlock code={frontendEnvText} />
      </div>

      {/* local-server .env */}
      <div className="border rounded-xl p-5 space-y-3 shadow-sm t-card-zinc">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 t-text-secondary">
              <Terminal className="w-3.5 h-3.5" /> functions/local-server.js — Runtime Environment
            </h3>
            <p className="text-xs mt-1 t-text-dim">
              These env vars are required to run <code className="px-1.5 py-0.5 rounded font-mono text-[10px] t-surface-code">node functions/local-server.js</code>. Add to <code className="px-1.5 py-0.5 rounded font-mono text-[10px] t-surface-code">webapp/.env</code> or export in your shell.
            </p>
          </div>
          <CopyButton text={localServerEnvText} />
        </div>
        <CodeBlock code={localServerEnvText} />
      </div>

      {/* Firebase Functions config */}
      <div className="border rounded-xl p-5 space-y-3 shadow-sm t-card-zinc">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider t-text-secondary">
              Firebase Functions Config (Deployed)
            </h3>
            <p className="text-xs mt-1 t-text-dim">
              Run once to configure deployed Cloud Functions. The functions read these at startup.
            </p>
          </div>
          <CopyButton text={functionsConfigText} />
        </div>
        <CodeBlock code={functionsConfigText} />
      </div>

      {/* IndexNow script config */}
      <div className="border rounded-xl p-5 space-y-3 shadow-sm t-card-zinc">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider t-text-secondary">
              IndexNow Script Update
            </h3>
            <p className="text-xs mt-1 t-text-dim">
              After saving your IndexNow Key above, update <code className="px-1.5 py-0.5 rounded font-mono text-[10px] t-surface-code">scripts/submit_indexnow.js</code> and the public verification file.
            </p>
          </div>
          <CopyButton text={indexNowScriptText} />
        </div>
        <CodeBlock code={indexNowScriptText} />
      </div>
    </>
  )
}
