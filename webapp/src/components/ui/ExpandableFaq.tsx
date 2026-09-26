import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { db } from "../../firebase";

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  tag: string;
}

const DEFAULT_FAQS: FaqItem[] = [
  {    id: "metadata-why",
    tag: "Problem",
    question: "Why do my Google Takeout photos lose their dates & GPS?",
    answer: "When you export your library from Google Takeout, Google strips the original metadata (such as the Date Taken, Camera Model, and GPS Coordinates) from the image/video files and writes it into separate matching .json sidecar files. When you import these photos directly into iCloud, Apple Photos, or other platforms, they read the stripped files, which defaults their creation dates to the download date and loses location data. TakeoutFix reads these JSON sidecars and merges the data back into the EXIF headers."
  },
  {    id: "privacy-servers",
    tag: "Privacy",
    question: "Are my photos safe? / Do you see my photos?",
    answer: "Yes, they are 100% safe. TakeoutFix runs entirely on your own computer. We never see, upload, or store your photos."
  },
  {    id: "archive-limits",
    tag: "Limits",
    question: "Is there a limit on archive sizes?",
    answer: "The browser tool handles standard archives directly on your machine. If you have a huge photo collection (over 50GB), our free desktop app is also available to process massive files without crashing."
  }
];

export default function ExpandableFaq() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [faqs, setFaqs] = useState<FaqItem[]>(DEFAULT_FAQS);

  // Load FAQs from Firestore, fall back to defaults
  useEffect(() => {
    let isMounted = true;
    import("firebase/firestore").then(({ doc, getDoc }) => {
      getDoc(doc(db, "settings", "faqs")).then((snap) => {
        if (!isMounted) return;
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data.items) && data.items.length > 0) {
            setFaqs(data.items);
          }
        }
      }).catch(() => {
        // On error, keep defaults quietly
      });
    }).catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

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
          <div
            key={faq.id}
            onClick={() => setActiveId(faq.id)}
            className="flex flex-col justify-between p-5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-900 rounded-lg cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors duration-200 group h-32"
          >
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900/60 text-zinc-500 dark:text-zinc-400">
                {faq.tag}
              </span>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-white mt-2 leading-snug group-hover:text-black dark:group-hover:text-white transition-colors">
                {faq.question}
              </h3>
            </div>
            
            <div className="flex items-center gap-1 text-xs font-semibold text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-650 transition-colors">
              <span>Read details ➔</span>
            </div>
          </div>
        ))}
      </div>

      {/* OVERLAY POPUP MODAL ARCHITECTURE */}
      {activeId && (() => {
        const activeFaq = faqs.find(f => f.id === activeId);
        if (!activeFaq) return null;

        return (
          <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
            
            {/* BACKDROP: Fades in to mask the background desktop workspace */}
            <div
              onClick={() => setActiveId(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md t-animate-fade-in"
            />

            {/* THE POPPING CONTAINER */}
            <div
              className="w-full max-w-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-900 rounded-2xl p-6 md:p-8 relative shadow-2xl overflow-hidden pointer-events-auto flex flex-col text-left t-animate-faq-modal"
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

              {/* Modal contents */}
              <div
                className="flex flex-col h-full t-animate-fade-in-fast"
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
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
