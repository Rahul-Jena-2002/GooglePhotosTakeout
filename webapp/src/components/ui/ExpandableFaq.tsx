import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HelpCircle, X, ChevronRight, MessageCircle } from "lucide-react";

interface FaqItem {
  question: string;
  answer: string | React.ReactNode;
  tag: string;
}

export default function ExpandableFaq() {
  const [activeItem, setActiveItem] = useState<FaqItem | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const faqs: FaqItem[] = [
    {
      tag: "Problem",
      question: "Why do my Google Takeout photos lose their dates & GPS?",
      answer: "When you export your library from Google Takeout, Google strips the original metadata (such as the Date Taken, Camera Model, and GPS Coordinates) from the image/video files and writes it into separate matching .json sidecar files. When you import these photos directly into iCloud, Apple Photos, or other platforms, they read the stripped files, which defaults their creation dates to the download date and loses location data. TakeoutFix reads these JSON sidecars and merges the data back into the EXIF headers."
    },
    {
      tag: "Privacy",
      question: "Are my photos uploaded to your servers?",
      answer: "No. Never. The entire application runs locally inside your web browser using HTML5 File APIs. Your photos, videos, and JSON files never leave your computer and are never uploaded to any server. This guarantees 100% privacy and security for your personal archives."
    },
    {
      tag: "Limits",
      question: "Is there a limit on archive sizes?",
      answer: "Free accounts have a 1,000 files (1 GB) limit. Upgrading to Recovery Pass or Pro/Super Lifetime unlocks unlimited files and sizes, enabling you to fix hundreds of gigabytes at once."
    },
    {
      tag: "Billing",
      question: "What is your refund policy?",
      answer: (
        <>
          We want you to have a great experience with Takeout Fix. If you experience a genuine technical issue that prevents the software from working as described, and our support team is unable to resolve it, you may request a refund within <strong>7 days</strong> of purchase.
          <br /><br />
          For eligibility, exclusions, and the complete policy, please see our{" "}
          <a href="/refund" className="text-indigo-400 hover:text-indigo-300 font-bold underline">
            Refund Policy
          </a>.
        </>
      )
    }
  ];

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveItem(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Prevent scroll when modal is open
  useEffect(() => {
    if (activeItem) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [activeItem]);

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8 relative" ref={containerRef}>
      {/* GRID VIEW OF CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {faqs.map((faq, idx) => (
          <motion.div
            key={faq.question}
            layoutId={`card-container-${faq.question}`}
            onClick={() => setActiveItem(faq)}
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
            className="flex flex-col justify-between p-5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-900 rounded-lg cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-700 transition-all group h-32"
          >
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900/60 text-zinc-500 dark:text-zinc-400">
                {faq.tag}
              </span>
              <motion.h4 
                layoutId={`card-title-${faq.question}`}
                className="text-base font-semibold text-zinc-900 dark:text-white mt-2 leading-snug group-hover:text-black dark:group-hover:text-white transition-colors"
              >
                {faq.question}
              </motion.h4>
            </div>
            
            <div className="flex items-center gap-1 text-xs font-semibold text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-650 transition-colors">
              <span>Read details</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </motion.div>
        ))}
      </div>

      {/* OVERLAY MODAL */}
      <AnimatePresence>
        {activeItem && (
          <>
            {/* Backdrop blur overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveItem(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-md z-[999]"
            />

            {/* Expanded Card Modal */}
            <div className="fixed inset-0 flex items-center justify-center p-4 z-[1000] pointer-events-none">
              <motion.div
                layoutId={`card-container-${activeItem.question}`}
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
                className="w-full max-w-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-900 rounded-lg p-6 md:p-8 pointer-events-auto flex flex-col text-left relative overflow-hidden"
              >
                {/* Close Button */}
                <button
                  onClick={() => setActiveItem(null)}
                  className="absolute top-4 right-4 w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>

                {/* Wrap all children in motion.div for quick fade transition on close to prevent layout reflow during spring animation */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-col h-full"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900/60 text-zinc-650 dark:text-zinc-400">
                      {activeItem.tag}
                    </span>
                  </div>

                  <h3 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-white leading-tight pr-6">
                    {activeItem.question}
                  </h3>

                  <div className="mt-6 text-sm md:text-base text-zinc-650 dark:text-zinc-400 leading-relaxed space-y-4">
                    <p>{activeItem.answer}</p>
                  </div>
                  
                  <div className="mt-8 border-t border-zinc-150 dark:border-zinc-900 pt-6 flex flex-col gap-1.5 text-xs text-zinc-450 dark:text-zinc-500">
                    <div className="flex items-center gap-3">
                      <MessageCircle className="w-4 h-4 text-zinc-400" />
                      <span>Have more questions? Contact our help desk inside the dashboard.</span>
                    </div>
                    <div className="pl-7">
                      <span>Or email us directly: </span>
                      <a href="mailto:takeoutfix.support@gmail.com" className="text-indigo-400 hover:text-indigo-300 font-semibold underline">
                        takeoutfix.support@gmail.com
                      </a>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
