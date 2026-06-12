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
  themeColor: string; // Dynamic background gradient classes
  btnColor: string; // Call-to-action button color matches theme
  badgeColor: string; // Sponsoring badge styling
}

interface AdUnitProps {
  type?: "horizontal" | "vertical" | "square" | "auto" | "sponsor";
  slot?: string;
  format?: string;
  className?: string;
}

export default function AdUnit({ type = "auto", className = "" }: AdUnitProps) {
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
      tag: "Premium Upgrade",
      title: "TakeoutFix Premium License",
      description: "Unlock unlimited file sizes, priority support desk, and ad-free local processing.",
      ctaText: "Upgrade Now",
      link: "/pricing",
      icon: <Key className="w-4 h-4 text-indigo-400" />,
      themeColor: "from-indigo-500/10 to-purple-500/10",
      btnColor: "bg-indigo-600 hover:bg-indigo-500 hover:shadow-indigo-500/15",
      badgeColor: "text-indigo-400 border-indigo-500/20 bg-indigo-500/5",
    },
    {
      tag: "Advanced Tool",
      title: "Interactive EXIF Inspector",
      description: "Instantly inspect dates, camera details, and embedded GPS coordinates directly in your browser.",
      ctaText: "Check EXIF",
      link: "/tool",
      icon: <ShieldCheck className="w-4 h-4 text-emerald-400" />,
      themeColor: "from-emerald-500/10 to-teal-500/10",
      btnColor: "bg-emerald-600 hover:bg-emerald-500 hover:shadow-emerald-500/15",
      badgeColor: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5",
    },
    {
      tag: "Disk Space",
      title: "Duplicate Space Finder",
      description: "Detect redundant files, double takeout downloads, and optimize your local directory storage.",
      ctaText: "Optimize Space",
      link: "/tool",
      icon: <RefreshCw className="w-4 h-4 text-amber-550" />,
      themeColor: "from-amber-500/10 to-orange-500/10",
      btnColor: "bg-amber-600 hover:bg-amber-500 hover:shadow-amber-500/15",
      badgeColor: "text-amber-500 border-amber-500/20 bg-amber-500/5",
    }
  ];

  // Rotate items randomly on load
  useEffect(() => {
    const randomIdx = Math.floor(Math.random() * ads.length);
    setAdIndex(randomIdx);
  }, []);

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

  // Base styling for modern dark-themed containers (which adapt dynamically to light overrides)
  const wrapperBaseClass = `w-full mx-auto bg-zinc-950/45 border border-zinc-900 rounded-2xl relative overflow-hidden group select-none transition-all duration-300 hover:border-zinc-800 shadow-lg ${className}`;

  // 1. HORIZONTAL WIDE BANNER VIEW (width >= 620px)
  if (resolvedLayout === "wide") {
    return (
      <div 
        ref={containerRef} 
        className={`${wrapperBaseClass} p-5 md:p-6 flex flex-col sm:flex-row items-center justify-between gap-6 hover:shadow-2xl hover:shadow-indigo-500/2`}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/[0.012] pointer-events-none"></div>
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-center shadow-inner shrink-0">
            {activeAd.icon}
          </div>
          <div className="space-y-1 text-left">
            <span className={`inline-block text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 border rounded-md ${activeAd.badgeColor}`}>
              {activeAd.tag}
            </span>
            <h4 className="text-sm font-bold text-white tracking-tight">{activeAd.title}</h4>
            <p className="text-[11px] text-zinc-400 max-w-xl leading-relaxed">{activeAd.description}</p>
          </div>
        </div>
        <div className="shrink-0 w-full sm:w-auto">
          <a href={activeAd.link} className="block w-full sm:w-auto">
            <button className={`w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-xs text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-lg outline-none border-0 ${activeAd.btnColor}`}>
              <span>{activeAd.ctaText}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </a>
        </div>
        <div className={`absolute inset-0 bg-gradient-to-r ${activeAd.themeColor} opacity-30 pointer-events-none`}></div>
      </div>
    );
  }

  // 2. VERTICAL COLUMN VIEW (strict sidebar overrides)
  if (resolvedLayout === "vertical") {
    return (
      <div 
        ref={containerRef} 
        className={`${wrapperBaseClass} p-6 max-w-[280px] min-h-[380px] flex flex-col justify-between text-center hover:shadow-2xl hover:shadow-indigo-500/2`}
      >
        <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold text-zinc-600 uppercase tracking-widest bg-zinc-900/60 px-2 py-0.5 border border-zinc-800/70 rounded-full">
          Sponsored Link
        </div>
        <div className="flex flex-col items-center justify-center pt-8 pb-4 space-y-4">
          <div className="w-12 h-12 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-center shadow-inner">
            {activeAd.icon}
          </div>
          <div className="space-y-2">
            <span className={`inline-block text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 border rounded-md ${activeAd.badgeColor}`}>
              {activeAd.tag}
            </span>
            <h4 className="text-sm font-bold text-white leading-snug">{activeAd.title}</h4>
            <p className="text-[11px] text-zinc-400 leading-relaxed max-w-[210px] mx-auto">{activeAd.description}</p>
          </div>
        </div>
        <a href={activeAd.link} className="block w-full">
          <button className={`w-full py-2.5 rounded-xl font-bold text-xs text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-lg outline-none border-0 ${activeAd.btnColor}`}>
            <span>{activeAd.ctaText}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </a>
        <div className={`absolute inset-0 bg-gradient-to-b ${activeAd.themeColor} opacity-40 pointer-events-none`}></div>
      </div>
    );
  }

  // 3. SQUARE CARD / GRID BOX VIEW (width 400px – 620px)
  if (resolvedLayout === "square") {
    return (
      <div 
        ref={containerRef} 
        className={`${wrapperBaseClass} p-6 max-w-[420px] aspect-[4/3] flex flex-col justify-between text-center hover:shadow-2xl hover:shadow-indigo-500/2`}
      >
        <div className="absolute top-4 left-4 text-[9px] font-bold text-zinc-600 uppercase tracking-widest">
          Recommended Resource
        </div>
        <div className="flex flex-col items-center justify-center pt-6 space-y-3">
          <div className="w-11 h-11 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-center shadow-inner">
            {activeAd.icon}
          </div>
          <div className="space-y-1.5">
            <span className={`inline-block text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 border rounded-md ${activeAd.badgeColor}`}>
              {activeAd.tag}
            </span>
            <h4 className="text-sm font-bold text-white tracking-tight">{activeAd.title}</h4>
            <p className="text-[11px] text-zinc-400 leading-relaxed max-w-[260px] mx-auto">{activeAd.description}</p>
          </div>
        </div>
        <a href={activeAd.link} className="block w-full">
          <button className={`w-full py-2.5 rounded-xl font-bold text-xs text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-lg outline-none border-0 ${activeAd.btnColor}`}>
            <span>{activeAd.ctaText}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </a>
        <div className={`absolute inset-0 bg-gradient-to-tr ${activeAd.themeColor} opacity-40 pointer-events-none`}></div>
      </div>
    );
  }

  // 4. COMPACT CARD VIEW (width < 400px mobile fallbacks)
  return (
    <div 
      ref={containerRef} 
      className={`${wrapperBaseClass} p-4 flex flex-col justify-between gap-4 text-center hover:shadow-xl`}
    >
      <div className="flex flex-col items-center space-y-2">
        <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800/80 flex items-center justify-center shrink-0">
          {activeAd.icon}
        </div>
        <div className="space-y-1">
          <span className={`inline-block text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 border rounded-md ${activeAd.badgeColor}`}>
            {activeAd.tag}
          </span>
          <h4 className="text-xs font-bold text-white tracking-tight">{activeAd.title}</h4>
          <p className="text-[10px] text-zinc-400 leading-normal max-w-[220px] mx-auto">{activeAd.description}</p>
        </div>
      </div>
      <a href={activeAd.link} className="block w-full">
        <button className={`w-full py-2 rounded-lg font-bold text-[10px] text-white flex items-center justify-center gap-1 transition-all cursor-pointer outline-none border-0 ${activeAd.btnColor}`}>
          <span>{activeAd.ctaText}</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </a>
      <div className={`absolute inset-0 bg-gradient-to-tr ${activeAd.themeColor} opacity-30 pointer-events-none`}></div>
    </div>
  );
}
