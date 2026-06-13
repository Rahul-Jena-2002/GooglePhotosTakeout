import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HelpCircle, X, ChevronRight, MessageCircle } from "lucide-react";

interface FaqItem {
  question: string;
  answer: string;
  tag: string;
}

export default function ExpandableFaq() {
  const [activeItem, setActiveItem] = useState<FaqItem | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const faqs: FaqItem[] = [
    {
      tag: "Privacy",
      question: "Are my photos uploaded to your servers?",
      answer: "No. Never. The entire application runs locally inside your web browser using HTML5 File APIs. Your photos, videos, and JSON files never leave your computer and are never uploaded to any server. This guarantees 100% privacy and security for your personal archives."
    },
    {
      tag: "Offline",
      question: "Does this work completely offline?",
      answer: "Yes! Once the web application has loaded in your browser, you can completely disconnect from the internet, turn on airplane mode, and process your Google Takeout archive. The matching, parsing, and EXIF injection logic run fully client-side on your local CPU."
    },
    {
      tag: "Technology",
      question: "How does the date recovery work?",
      answer: "Google Takeout exports photos with their original metadata stripped and placed in separate matching .json sidecar files. This causes matching errors when importing to iCloud or Google Photos. TakeoutFix reads these JSON sidecars, matches them to the corresponding photo files using fuzzy name matching, and injects the original date, GPS coordinates, and camera data directly back into the EXIF headers of your photos."
    },
    {
      tag: "Limits",
      question: "Is there a limit on archive sizes?",
      answer: "Our engine processes your archive locally chunk-by-chunk to prevent memory leaks and handle massive directories. Free accounts have a 1,000 files (1 GB) limit. Upgrading to Recovery Pass or Pro/Super Lifetime unlocks unlimited files and sizes, enabling you to fix hundreds of gigabytes at once."
    },
    {
      tag: "Compatibility",
      question: "What file formats are supported?",
      answer: "We support all standard photo and video formats including JPEG, PNG, HEIC, WebP, MP4, MOV, and M4V. Metadata matching is fully compatible with Google Takeout exports from any year, regardless of language."
    },
    {
      tag: "Billing",
      question: "What is your refund policy?",
      answer: "We offer a 100% Recovery Guarantee. If a verified technical issue prevents your photos from being restored, and our support desk is unable to resolve it, we will issue a full refund within 7 days of purchase. Refunds are not available for successfully completed recoveries or change of mind."
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
            key={idx}
            layoutId={`card-container-${faq.question}`}
            onClick={() => setActiveItem(faq)}
            className="flex flex-col justify-between p-6 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-900 rounded-lg cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-700 transition-all group h-44"
          >
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900/60 text-zinc-500 dark:text-zinc-400">
                {faq.tag}
              </span>
              <motion.h4 
                layoutId={`card-title-${faq.question}`}
                className="text-base font-semibold text-zinc-900 dark:text-white mt-4 leading-snug group-hover:text-black dark:group-hover:text-white transition-colors"
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
                className="w-full max-w-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-900 rounded-lg p-6 md:p-8 pointer-events-auto flex flex-col text-left relative overflow-hidden"
              >
                {/* Close Button */}
                <button
                  onClick={() => setActiveItem(null)}
                  className="absolute top-4 right-4 w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900/60 text-zinc-650 dark:text-zinc-400">
                    {activeItem.tag}
                  </span>
                </div>

                <motion.h3
                  layoutId={`card-title-${activeItem.question}`}
                  className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-white leading-tight pr-6"
                >
                  {activeItem.question}
                </motion.h3>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ delay: 0.15 }}
                  className="mt-6 text-sm md:text-base text-zinc-650 dark:text-zinc-400 leading-relaxed space-y-4"
                >
                  <p>{activeItem.answer}</p>
                </motion.div>
                
                <div className="mt-8 border-t border-zinc-150 dark:border-zinc-900 pt-6 flex items-center gap-3 text-xs text-zinc-450 dark:text-zinc-500">
                  <MessageCircle className="w-4 h-4 text-zinc-400" />
                  <span>Have more questions? Contact our help desk inside the dashboard.</span>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
