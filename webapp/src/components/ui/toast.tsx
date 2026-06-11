import { useToastStore } from "../../store/useToastStore"
import { motion, AnimatePresence } from "framer-motion"
import { CheckCircle2, XCircle, AlertCircle, Info, X } from "lucide-react"

const TOAST_ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
}

const TOAST_STYLES = {
  success: "border-green-500/20 bg-zinc-950/80 text-green-400 shadow-[0_0_20px_rgba(34,197,94,0.1)] border-l-4 border-l-green-500",
  error: "border-red-500/20 bg-zinc-950/80 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.1)] border-l-4 border-l-red-500",
  warning: "border-amber-500/20 bg-zinc-950/80 text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.1)] border-l-4 border-l-amber-500",
  info: "border-indigo-500/20 bg-zinc-950/80 text-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.1)] border-l-4 border-l-indigo-500",
}

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = TOAST_ICONS[toast.type]
          const styles = TOAST_STYLES[toast.type]

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, y: -20 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className={`pointer-events-auto flex items-start gap-3.5 p-4 rounded-xl border backdrop-blur-md ${styles}`}
            >
              <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="flex-grow text-xs leading-normal font-sans font-medium pr-2 text-zinc-300">
                {toast.message}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5 rounded hover:bg-white/5 flex-shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
