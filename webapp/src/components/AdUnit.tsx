import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { auth, db } from "../firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { ArrowRight, ShieldCheck, Key, RefreshCw } from "lucide-react";

interface Ad {
  tag: string;
  title: string;
  description: string;
  ctaText: string;
  link: string;
  icon: React.ReactNode;
}

interface AdUnitProps {
  type?: "horizontal" | "vertical" | "square" | "auto" | "sponsor";
  slot?: string;
  format?: string;
  className?: string;
}

export default function AdUnit({ type = "auto", slot, className = "" }: AdUnitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [adIndex, setAdIndex] = useState<number>(0);

  const { userData: contextUserData } = useAuth();
  const [localUserData, setLocalUserData] = useState<any>(null);

  // Synchronize authentication state to support static page embeds
  useEffect(() => {
    if (contextUserData) {
      setLocalUserData(contextUserData);
      return;
    }

    try {
      const saved = localStorage.getItem("takeoutfix_user_data");
      if (saved) {
        setLocalUserData(JSON.parse(saved));
      }
    } catch (_) {}

    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const unsubDoc = onSnapshot(userDocRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            const fullData = {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName,
              photoURL: user.photoURL,
              ...data
            };
            setLocalUserData(fullData);
            try {
              localStorage.setItem("takeoutfix_user_data", JSON.stringify(fullData));
            } catch (_) {}
          }
        }, (err) => console.error("AdUnit Firestore error:", err));

        return () => unsubDoc();
      } else {
        setLocalUserData(null);
        try {
          localStorage.removeItem("takeoutfix_user_data");
        } catch (_) {}
      }
    });

    return () => unsubscribe();
  }, [contextUserData]);

  const activeUserData = contextUserData || localUserData;
  const isAdFree = activeUserData?.plan === "super" && !activeUserData?.supportWithAds;

  // List of premium internal feature promotions to rotate
  const ads: Ad[] = [
    {
      tag: "Upgrade to Premium",
      title: "Upgrade to Premium",
      description: "Faster processing • Larger archives • Priority support",
      ctaText: "Upgrade Now",
      link: "/pricing",
      icon: <span className="text-xl">🚀</span>,
    },
    {
      tag: "Privacy First",
      title: "Privacy First",
      description: "Your photos never leave your device.",
      ctaText: "Learn More",
      link: "/how-it-works",
      icon: <span className="text-xl">🔒</span>,
    },
    {
      tag: "Large Archives",
      title: "Need to restore thousands of files?",
      description: "Premium handles large Google Takeout archives.",
      ctaText: "Upgrade Now",
      link: "/pricing",
      icon: <span className="text-xl">⭐</span>,
    },
    {
      tag: "Did you know?",
      title: "Did you know?",
      description: "Google Takeout often strips metadata links during export. TakeoutFix rebuilds them locally.",
      ctaText: "How It Works",
      link: "/how-it-works",
      icon: <span className="text-xl">💡</span>,
    }
  ];

  // Rotate items randomly on load or pick based on slot
  useEffect(() => {
    if (slot) {
      const idx = parseInt(slot, 10);
      if (!isNaN(idx) && idx >= 1 && idx <= ads.length) {
        setAdIndex(idx - 1);
        return;
      }
    }
    const randomIdx = Math.floor(Math.random() * ads.length);
    setAdIndex(randomIdx);
  }, [slot]);

  // Set up container-query style ResizeObserver for the "auto" layout mode
  useEffect(() => {
    if (!containerRef.current || type !== "auto") return;

    const currentElem = containerRef.current;
    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width } = entries[0].contentRect;
      setContainerWidth(width);
    });

    observer.observe(currentElem);
    return () => observer.disconnect();
  }, [type]);

  // If the user has an ad-free plan (Super) and has not opted to support with ads, render nothing
  if (isAdFree) {
    return <div className="py-1 opacity-0 select-none pointer-events-none" />;
  }

  const activeAd = ads[adIndex];

  // Map requested layout to targeted formatting mode
  let resolvedLayout: "wide" | "square" | "compact" | "vertical" = "compact";

  // Support legacy "sponsor" type mappings to "compact"
  const resolvedType = type === "sponsor" ? "compact" : type;

  if (resolvedType === "horizontal") {
    resolvedLayout = "wide";
  } else if (resolvedType === "vertical") {
    resolvedLayout = "vertical";
  } else if (resolvedType === "square") {
    resolvedLayout = "square";
  } else if (resolvedType === "compact") {
    resolvedLayout = "compact";
  } else {
    if (containerWidth >= 620) {
      resolvedLayout = "wide";
    } else if (containerWidth >= 400) {
      resolvedLayout = "square";
    } else {
      resolvedLayout = "compact";
    }
  }

  // Base styling for minimal card containers (adapting to light/dark themes, dashed border)
  const wrapperBaseClass = `w-full mx-auto bg-zinc-50/50 dark:bg-zinc-950/20 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl relative overflow-hidden group select-none transition-all duration-150 hover:border-zinc-300 dark:hover:border-zinc-700 ${className}`;
  
  const btnClass = "px-6 py-2 rounded-lg font-semibold text-xs border btn-outline-custom transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0";

  // 1. HORIZONTAL WIDE BANNER VIEW (width >= 620px)
  if (resolvedLayout === "wide") {
    return (
      <div 
        ref={containerRef} 
        className={`${wrapperBaseClass} p-5 md:p-6 flex flex-col gap-4`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-dashed border-zinc-200 dark:border-zinc-800 pb-2.5 gap-2">
          <span className="text-[9px] font-bold tracking-widest uppercase text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-900/60 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 w-fit">
            Sponsor Area
          </span>
          <span className="text-[10px] text-zinc-450 dark:text-zinc-500 italic text-left">
            While we're waiting for ads to appear, here's a premium feature you might like:
          </span>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shadow-inner shrink-0 text-xl">
              {activeAd.icon}
            </div>
            <div className="space-y-1 text-left">
              <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">{activeAd.title}</h4>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 max-w-xl leading-relaxed">{activeAd.description}</p>
            </div>
          </div>
          <div className="shrink-0 w-full sm:w-auto">
            <a href={activeAd.link} className="block w-full sm:w-auto">
              <button className={btnClass}>
                <span>{activeAd.ctaText}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </a>
          </div>
        </div>
      </div>
    );
  }

  // 2. VERTICAL COLUMN VIEW (sidebar context: covers the width available)
  if (resolvedLayout === "vertical") {
    return (
      <div 
        ref={containerRef} 
        className={`${wrapperBaseClass} p-5 flex flex-col gap-4 text-center`}
      >
        <div className="flex flex-col items-center border-b border-dashed border-zinc-200 dark:border-zinc-800 pb-2.5 gap-1.5">
          <span className="text-[9px] font-bold tracking-widest uppercase text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-900/60 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 w-fit">
            Sponsor Area
          </span>
          <span className="text-[10px] text-zinc-450 dark:text-zinc-500 italic leading-tight">
            While we're waiting for ads to appear, here's a premium feature you might like:
          </span>
        </div>
        <div className="flex flex-col items-center justify-center pt-2 pb-2 space-y-4">
          <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shadow-inner text-xl">
            {activeAd.icon}
          </div>
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-snug">{activeAd.title}</h4>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-[240px] mx-auto">{activeAd.description}</p>
          </div>
        </div>
        <a href={activeAd.link} className="block w-full mt-auto">
          <button className={btnClass}>
            <span>{activeAd.ctaText}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </a>
      </div>
    );
  }

  // 3. SQUARE CARD / GRID BOX VIEW (width 400px – 620px)
  if (resolvedLayout === "square") {
    return (
      <div 
        ref={containerRef} 
        className={`${wrapperBaseClass} p-5 flex flex-col justify-between text-center gap-4`}
      >
        <div className="flex flex-col items-center border-b border-dashed border-zinc-200 dark:border-zinc-800 pb-2.5 gap-1.5">
          <span className="text-[9px] font-bold tracking-widest uppercase text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-900/60 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 w-fit">
            Sponsor Area
          </span>
          <span className="text-[10px] text-zinc-455 dark:text-zinc-500 italic leading-tight">
            While we're waiting for ads to appear, here's a premium feature you might like:
          </span>
        </div>
        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="w-11 h-11 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shadow-inner text-xl">
            {activeAd.icon}
          </div>
          <div className="space-y-1.5">
            <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">{activeAd.title}</h4>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-[260px] mx-auto">{activeAd.description}</p>
          </div>
        </div>
        <a href={activeAd.link} className="block w-full">
          <button className={btnClass}>
            <span>{activeAd.ctaText}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </a>
      </div>
    );
  }

  // 4. COMPACT CARD VIEW (width < 400px mobile fallbacks)
  return (
    <div 
      ref={containerRef} 
      className={`${wrapperBaseClass} p-4 flex flex-col justify-between gap-4 text-center`}
    >
      <div className="flex flex-col items-center border-b border-dashed border-zinc-200 dark:border-zinc-800 pb-2 gap-1.5">
        <span className="text-[9px] font-bold tracking-widest uppercase text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-900/60 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 w-fit">
          Sponsor Area
        </span>
        <span className="text-[9px] text-zinc-455 dark:text-zinc-500 italic leading-tight">
          While we're waiting for ads to appear, here's a premium feature you might like:
        </span>
      </div>
      <div className="flex flex-col items-center space-y-2">
        <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shrink-0 text-xl">
          {activeAd.icon}
        </div>
        <div className="space-y-1">
          <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">{activeAd.title}</h4>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-normal max-w-[220px] mx-auto">{activeAd.description}</p>
        </div>
      </div>
      <a href={activeAd.link} className="block w-full">
        <button className={btnClass}>
          <span>{activeAd.ctaText}</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </a>
    </div>
  );
}
