import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { db } from "../../firebase";

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  tag: string;
}

const DEFAULT_FAQS: FaqItem[] = [
  {
    id: "metadata-why",
    tag: "Problem",
    question: "Why do my Google Takeout photos lose their dates & GPS?",
    answer: "When you export your library from Google Takeout, Google strips the original metadata (such as the Date Taken, Camera Model, and GPS Coordinates) from the image/video files and writes it into separate matching .json sidecar files. When you import these photos directly into iCloud, Apple Photos, or other platforms, they read the stripped files, which defaults their creation dates to the download date and loses location data. TakeoutFix reads these JSON sidecars and merges the data back into the EXIF headers."
  },
  {
    id: "privacy-servers",
    tag: "Privacy",
    question: "Are my photos uploaded to your servers?",
    answer: "No. Never. The entire application runs locally inside your web browser using HTML5 File APIs. Your photos, videos, and JSON files never leave your computer and are never uploaded to any server. This guarantees 100% privacy and security for your personal archives."
  },
  {
    id: "archive-limits",
    tag: "Limits",
    question: "Is there a limit on archive sizes?",
    answer: "Free accounts have a 250 files (500 MB) limit. Upgrading to Recovery Pass (up to 3,000 files / 3 GB) or Pro/Super Lifetime unlocks unlimited files and sizes, enabling you to fix your entire library."
  },
  {
    id: "refund-policy",
    tag: "Billing",
    question: "What is your refund policy?",
    answer: "We want you to have a great experience with Takeout Fix. If you experience a genuine technical issue that prevents the software from working as described, and our support team is unable to resolve it, you may request a refund within 7 days of purchase. See our Refund Policy page for full details."
  }
];

export default function ExpandableFaq() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [faqs, setFaqs] = useState<FaqItem[]>(DEFAULT_FAQS);

  // Load FAQs from Firestore, fall back to defaults
  useEffect(() => {
    let unsub: (() => void) | null = null;
    import("firebase/firestore").then(({ doc, onSnapshot }) => {
      unsub = onSnapshot(doc(db, "settings", "faqs"), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data.items) && data.items.length > 0) {
            setFaqs(data.items);
          }
        }
      }, () => {
        // On error, keep defaults
      });
    }).catch(err => {
      console.warn("Failed to load FAQs from Firestore dynamically:", err);
    });

    return () => {
      if (unsub) unsub();
    };
  }, []);

  const macOsSpring = {
    type: "spring",
    stiffness: 300,
    damping: 28,
    mass: 1
  };

  // Renders **bold**, *italic*, and <u>underline</u> markers as JSX elements
  const renderBoldText = (text: string) => {
    if (!text) return "";
    const regex = /(\*\*.*?\*\*|\*.*?\*|<u>.*?<\/u>)/g;
    const parts = text.split(regex);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index} className="font-bold">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={index} className="italic">{part.slice(1, -1)}</em>;
      }
      if (part.startsWith('<u>') && part.endsWith('</u>')) {
        return <u key={index}>{part.slice(3, -4)}</u>;
      }
      return part;
    });
  };

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveId(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Prevent scroll and hide footer when modal is open
  useEffect(() => {
    const root = document.documentElement;
    if (activeId) {
      document.body.style.overflow = "hidden";
      root.classList.add("faq-modal-open");
    } else {
      document.body.style.overflow = "unset";
      root.classList.remove("faq-modal-open");
    }
    return () => {
      document.body.style.overflow = "unset";
      root.classList.remove("faq-modal-open");
    };
  }, [activeId]);

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8 relative">
      {/* GRID VIEW OF CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {faqs.map((faq) => (
          <motion.div
            key={faq.id}
            layoutId={`faq-card-${faq.id}`}
            onClick={() => setActiveId(faq.id)}
            className="flex flex-col justify-between p-5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-900 rounded-lg cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors duration-200 group h-32"
          >
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900/60 text-zinc-500 dark:text-zinc-400">
                {faq.tag}
              </span>
              <h4 className="text-base font-semibold text-zinc-900 dark:text-white mt-2 leading-snug group-hover:text-black dark:group-hover:text-white transition-colors">
                {faq.question}
              </h4>
            </div>
            
            <div className="flex items-center gap-1 text-xs font-semibold text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-650 transition-colors">
              <span>Read details ➜</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* OVERLAY POPUP MODAL ARCHITECTURE */}
      <AnimatePresence>
        {activeId && (() => {
          const activeFaq = faqs.find(f => f.id === activeId);
          if (!activeFaq) return null;

          return (
            <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
              
              {/* BACKDROP: Fades in to mask the background desktop workspace */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setActiveId(null)}
                className="absolute inset-0 bg-black/60 backdrop-blur-md"
              />

              {/* THE POPPING CONTAINER: Morphs out from the static button into a floating panel */}
              <motion.div
                layoutId={`faq-card-${activeFaq.id}`}
                transition={macOsSpring}
                initial={{ filter: "blur(4px)" }}
                animate={{ filter: "blur(0px)" }}
                exit={{ filter: "blur(4px)" }}
                className="w-full max-w-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-900 rounded-2xl p-6 md:p-8 relative shadow-2xl overflow-hidden pointer-events-auto flex flex-col text-left"
              >
                {/* Native Apple close window circle button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveId(null);
                  }}
                  className="absolute top-4 right-4 w-6 h-6 rounded-full bg-zinc-150 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                {/* Wrap modal contents to fade out immediately on exit, preventing layout warp stutter */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-col h-full"
                >
                  {/* Popup Badge */}
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900/60 text-zinc-650 dark:text-zinc-400">
                      {activeFaq.tag}
                    </span>
                  </div>

                  {/* Popup Title */}
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-white pr-8 mb-4">
                    {activeFaq.question}
                  </h3>

                  {/* Popup Answer Payload */}
                  <div className="mt-2 text-sm md:text-base text-zinc-650 dark:text-zinc-400 leading-relaxed">
                    <p>{renderBoldText(activeFaq.answer)}</p>
                  </div>
                </motion.div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
