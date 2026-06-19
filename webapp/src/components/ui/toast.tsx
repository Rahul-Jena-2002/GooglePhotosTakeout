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
  success: "bg-white border-[#d1fae5] shadow-[0_10px_30px_rgba(0,0,0,0.06)] dark:bg-[#18181b] dark:border-[#27272a] dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)]",
  error: "bg-white border-[#fee2e2] shadow-[0_10px_30px_rgba(0,0,0,0.06)] dark:bg-[#18181b] dark:border-[#27272a] dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)]",
  warning: "bg-white border-[#fef3c7] shadow-[0_10px_30px_rgba(0,0,0,0.06)] dark:bg-[#18181b] dark:border-[#27272a] dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)]",
  info: "bg-white border-[#e0e7ff] shadow-[0_10px_30px_rgba(0,0,0,0.06)] dark:bg-[#18181b] dark:border-[#27272a] dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)]",
}

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  return (
    <div className="fixed top-[80px] right-6 z-[9999] flex flex-col gap-3 max-w-sm w-[calc(100%-2rem)] pointer-events-none items-end">
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = TOAST_ICONS[toast.type]
          const styles = TOAST_STYLES[toast.type]
          const defaultTitle = toast.title || (toast.type === "error" ? "Error" : toast.type === "success" ? "Success" : "Notification")

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: "120%" }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: "120%" }}
              transition={{ type: "tween", ease: [0.175, 0.885, 0.32, 1.275], duration: 0.4 }}
              className={`pointer-events-auto flex items-start gap-3.5 p-4 rounded-xl border w-[320px] max-w-full text-left ${styles}`}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 select-none ${
                toast.type === "error" ? "text-[#ef4444] dark:text-[#f87171]" :
                toast.type === "success" ? "text-[#10b981] dark:text-[#34d399]" :
                toast.type === "warning" ? "text-[#f59e0b] dark:text-[#fbbf24]" :
                "text-[#6366f1] dark:text-[#818cf8]"
              }`} />
              <div className="flex-grow min-w-0 font-sans">
                <strong className="block text-sm font-bold text-[#111827] dark:text-white leading-tight">
                  {defaultTitle}
                </strong>
                <p className="text-xs font-medium text-[#4b5563] dark:text-[#9ca3af] mt-1 leading-relaxed">
                  {toast.message}
                </p>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
