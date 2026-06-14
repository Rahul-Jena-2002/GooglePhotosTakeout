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
      tag: "Problem",
      question: "Why do my Google Takeout photos lose their dates & GPS?",
      answer: "When you export your library from Google Takeout, Google strips the original metadata (such as the Date Taken, Camera Model, and GPS Coordinates) from the image/video files and writes it into separate matching .json sidecar files. When you import these photos directly into iCloud, Apple Photos, or other platforms, they read the stripped files, which defaults their creation dates to the download date and loses location data. TakeoutFix reads these JSON sidecars and merges the data back into the EXIF headers."
    },
    {
      tag: "Restoration",
      question: "What metadata parameters does TakeoutFix recover and restore?",
      answer: "TakeoutFix recovers and merges a wide range of metadata: (1) GPS Location: Latitude, Longitude, and Altitude. (2) Timestamps: Date Taken, Modification Date, and Digitized Date. (3) Descriptions: Custom descriptions or titles you added in Google Photos. (4) Camera Info: Camera Make, Model, and Lens settings where available."
    },
    {
      tag: "Formats",
      question: "What file formats are supported for restoration?",
      answer: "We support a comprehensive list of formats: (1) Images: JPEG, JPG, PNG, HEIC, WEBP, GIF, TIFF. (2) Videos: MP4, MOV, M4V, AVI, GP3, WebM. The tool automatically matches the corresponding .json sidecar regardless of the format."
    },
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
      tag: "Performance",
      question: "How do you handle giant photo archives (e.g. 100GB+ libraries)?",
      answer: "Our engine processes your archive locally chunk-by-chunk using background Web Workers and a sequential worker pool. This prevents browser tabs from crashing due to V8 engine heap memory limits (which typically crash on array buffers larger than 4GB). We handle directories with hundreds of thousands of files by processing them sequentially in chunks with yielding to the browser event loop."
    },
    {
      tag: "Matching",
      question: "How does the fuzzy matching engine match JSON sidecars to photos?",
      answer: "Google Takeout often mutates file names (e.g. truncating 'photo_name_long_etc.jpg' to 'photo_name_lon.jpg.json' or adding suffixes like '-edited' or '(1)'). TakeoutFix implements a fuzzy-matching heuristic algorithm that matches modified file names back to their correct sidecars, achieving a 99.9% match rate compared to basic script tools that fail on truncated names."
    },
    {
      tag: "Limits",
      question: "Is there a limit on archive sizes?",
      answer: "Free accounts have a 1,000 files (1 GB) limit. Upgrading to Recovery Pass or Pro/Super Lifetime unlocks unlimited files and sizes, enabling you to fix hundreds of gigabytes at once."
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
