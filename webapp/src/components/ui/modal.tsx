import React, { useEffect } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
}

const SIZE_CLASSES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  full: "max-w-full m-4 h-[calc(100vh-2rem)]",
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = "md"
}: ModalProps) {
  // Prevent body scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = "unset"
    }
    return () => {
      document.body.style.overflow = "unset"
    }
  }, [isOpen])

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/85 backdrop-blur-md"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
            className={`w-full bg-zinc-950 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-2xl relative z-10 flex flex-col ${SIZE_CLASSES[size]}`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-900 bg-zinc-950">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                {title || "Notification"}
              </h3>
              <button
                onClick={onClose}
                className="text-zinc-500 hover:text-zinc-300 p-1.5 rounded-md hover:bg-zinc-900 transition-colors focus:outline-none"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-grow p-6 overflow-y-auto max-h-[75vh] font-sans">
              {children}
            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}
