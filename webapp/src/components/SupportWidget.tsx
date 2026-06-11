import { useState, useRef, useEffect } from 'react'
import { LifeBuoy, X, MessageSquare, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { motion, AnimatePresence } from 'framer-motion'

export default function SupportWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const { user, userData } = useAuth()
  const widgetRef = useRef<HTMLDivElement>(null)

  const isPaid = userData?.plan && userData.plan !== 'free'

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (widgetRef.current && !widgetRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end" ref={widgetRef}>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="mb-4 w-80 bg-black/80 backdrop-blur-3xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] rounded-2xl overflow-hidden"
          >
            <div className="p-4 bg-indigo-500/10 border-b border-white/10 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <LifeBuoy className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-white">Help & Support</h3>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-white/50 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 space-y-3">
              <Link to="/support?tab=faq" onClick={() => setIsOpen(false)} className="flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/5">
                <div className="bg-indigo-500/20 p-2 rounded-md">
                  <ExternalLink className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <div className="text-sm font-medium">Read FAQ</div>
                  <div className="text-xs text-white/50">Quick answers</div>
                </div>
              </Link>
              
              <Link to="/support?tab=feedback" onClick={() => setIsOpen(false)} className="flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/5">
                <div className="bg-purple-500/20 p-2 rounded-md">
                  <MessageSquare className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <div className="text-sm font-medium">Give Feedback</div>
                  <div className="text-xs text-white/50">Share your thoughts</div>
                </div>
              </Link>
              
              {!user ? (
                <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-lg text-center">
                  <p className="text-xs text-red-200">Sign in to contact support</p>
                </div>
              ) : !isPaid ? (
                <Link to="/pricing" onClick={() => setIsOpen(false)} className="flex items-center gap-3 p-3 bg-indigo-500/5 hover:bg-indigo-500/10 rounded-lg transition-colors border border-indigo-500/20">
                  <div className="bg-indigo-500/20 p-2 rounded-md">
                    <LifeBuoy className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-indigo-300">Premium Support</div>
                    <div className="text-xs text-indigo-400/50">Upgrade required</div>
                  </div>
                </Link>
              ) : (
                <Link to="/support?tab=new" onClick={() => setIsOpen(false)} className="flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/5">
                  <div className="bg-indigo-500/20 p-2 rounded-md">
                    <MessageSquare className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">Open a Ticket</div>
                    <div className="text-xs text-white/50">We usually reply within 24h</div>
                  </div>
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 bg-gradient-to-tr from-indigo-600 to-purple-600 hover:opacity-90 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.4)] text-white transition-all transform hover:scale-105 active:scale-95"
      >
        {isOpen ? <X className="w-6 h-6" /> : <LifeBuoy className="w-6 h-6" />}
      </button>
    </div>
  )
}
