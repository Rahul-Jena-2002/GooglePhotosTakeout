import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { auth } from "../firebase";
import { ArrowRight, ExternalLink, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

interface Ad {
  tag: string;
  title: string;
  description: string;
  ctaText: string;
  link: string;
  icon: React.ReactNode;
  isExternal?: boolean;
}

interface AdUnitProps {
  type?: "horizontal" | "vertical" | "square" | "auto" | "sponsor";
  slot?: string;
  format?: string;
  className?: string;
}

// 14 Amazon Affiliate Deals + 1 Native Feature
const ALL_ADS: Ad[] = [
  {
    tag: "Audio & Acoustics",
    title: "Sony WF-1000XM5 Noise-Cancelling Earbuds",
    description: "Industry-leading active noise cancellation with dual processors & high-res LDAC audio.",
    ctaText: "Shop on Amazon",
    link: "https://link.amazon/B0fvI8kmw",
    icon: <span className="text-xl">🎧</span>,
    isExternal: true,
  },
  {
    tag: "Mega Deals",
    title: "TCL 4K Smart TVs & QLED Home Theater",
    description: "Ultra HD 4K, Dolby Vision & Atmos Smart Google TVs at festival discount prices.",
    ctaText: "View on Amazon",
    link: "https://www.amazon.in/l/90035945031?_encoding=UTF8&pd_rd_w=NCj1g&content-id=amzn1.sym.3be33f4b-8098-4db8-a38d-e2b113f864fc&pf_rd_p=3be33f4b-8098-4db8-a38d-e2b113f864fc&pf_rd_r=RJ7YK4BR00PET909QD65&pd_rd_wg=nNftT&pd_rd_r=383f9cbf-9c0f-4097-b6ac-66893e4b62e7&ascsubtag=srctok-1b35a00b821e62a6&btn_type=ss&btn_ref=srctok-1b35a00b821e62a6&linkCode=ll2&tag=rjtools-21&linkId=90faced5521e12f691862e6d00baa08f&ref_=as_li_ss_tl",
    icon: <span className="text-xl">📺</span>,
    isExternal: true,
  },
  {
    tag: "Mobile Gear",
    title: "URBN Compact Fast-Charging Power Bank",
    description: "Pocket-sized 20W/22.5W two-way Type-C fast-charging power bank for all smartphones.",
    ctaText: "View on Amazon",
    link: "https://link.amazon/B01sl4CAl",
    icon: <span className="text-xl">⚡</span>,
    isExternal: true,
  },
  {
    tag: "Power Backup",
    title: "Stuffcool Major Ultra-Fast Power Bank",
    description: "Heavy-duty high-speed multi-device battery backup with Power Delivery support.",
    ctaText: "Explore Deal",
    link: "https://link.amazon/B08u5g1hB",
    icon: <span className="text-xl">🔋</span>,
    isExternal: true,
  },
  {
    tag: "Desk Setup",
    title: "AGARO 3-in-1 Fast Wireless Charging Station",
    description: "Clean desktop charging dock for iPhone / Android, smartwatch, and AirPods simultaneously.",
    ctaText: "Shop Now",
    link: "https://link.amazon/B0dwsdmBA",
    icon: <span className="text-xl">📱</span>,
    isExternal: true,
  },
  {
    tag: "PC Accessories",
    title: "URBN Type-C Multi-Port Hub & Display Adapter",
    description: "High-speed Type-C hub with 4K HDMI, USB 3.0 ports, and fast Power Delivery pass-through.",
    ctaText: "View on Amazon",
    link: "https://link.amazon/B06mCC0hf",
    icon: <span className="text-xl">🖥️</span>,
    isExternal: true,
  },
  {
    tag: "Lightning Deals",
    title: "Amazon Today's Lightning Deals & Clearance",
    description: "Limited-time flash savings and blockbuster discounts across tech, electronics & storage.",
    ctaText: "Claim Deals",
    link: "https://link.amazon/B04LYpDK1",
    icon: <span className="text-xl">⚡</span>,
    isExternal: true,
  },
  {
    tag: "Bestseller",
    title: "Amazon India #1 Bestsellers Showcase",
    description: "Discover the top-rated, bestselling electronics, storage cards & mobile accessories.",
    ctaText: "Explore Bestsellers",
    link: "https://link.amazon/B05LR6QOC",
    icon: <span className="text-xl">🏆</span>,
    isExternal: true,
  },
  {
    tag: "Instant Savings",
    title: "Amazon Extra Discount Coupons Store",
    description: "Save more with one-click instant digital coupons on gadgets, cables & tech essentials.",
    ctaText: "Collect Coupons",
    link: "https://link.amazon/B02UzByPT",
    icon: <span className="text-xl">🏷️</span>,
    isExternal: true,
  },
  {
    tag: "Travel & Luggage",
    title: "Safari Pentagon 360° Trolley Luggage",
    description: "Scratch-resistant lightweight hard casing with ultra-smooth 360-degree dual spinner wheels.",
    ctaText: "Check Price",
    link: "https://link.amazon/B0gW9AG0q",
    icon: <span className="text-xl">🧳</span>,
    isExternal: true,
  },
  {
    tag: "Travel Gear",
    title: "Safari Flintstone Hard-Body Luggage Bag",
    description: "Heavy-duty shock-absorbing travel suitcase engineered for maximum protection and durability.",
    ctaText: "View Luggage",
    link: "https://link.amazon/B0aww3ssz",
    icon: <span className="text-xl">✈️</span>,
    isExternal: true,
  },
  {
    tag: "Smart Home",
    title: "iBELL Smart Electric Kitchen Gadgets",
    description: "Premium energy-efficient appliances built for modern homes and quick smart cooking.",
    ctaText: "View Products",
    link: "https://link.amazon/B07iCtlgT",
    icon: <span className="text-xl">🍳</span>,
    isExternal: true,
  },
  {
    tag: "Eco Living",
    title: "Happi Planet Plant-Based Eco Cleaners",
    description: "100% natural, biodegradable home cleaning solutions safe for family, pets & planet.",
    ctaText: "Shop Eco Friendly",
    link: "https://link.amazon/B0csUWHld",
    icon: <span className="text-xl">🌿</span>,
    isExternal: true,
  },
  {
    tag: "Home Care",
    title: "Kleenest Pure Organic Cleaning Essentials",
    description: "Chemical-free certified non-toxic conscious cleaning supplies for a healthier home.",
    ctaText: "Check Details",
    link: "https://link.amazon/B09k90OO4",
    icon: <span className="text-xl">✨</span>,
    isExternal: true,
  },
  {
    tag: "TakeoutFix Pro",
    title: "Upgrade to TakeoutFix Super",
    description: "Faster processing • Unlimited archives • Metadata re-injection & zero wait times.",
    ctaText: "Upgrade Now",
    link: "/pricing",
    icon: <span className="text-xl">🚀</span>,
    isExternal: false,
  }
];

export default function AdUnit({ type = "auto", slot, className = "" }: AdUnitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [adIndex, setAdIndex] = useState<number>(0);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [isFading, setIsFading] = useState<boolean>(false);

  const { userData: contextUserData } = useAuth();
  const [localUserData, setLocalUserData] = useState<any>(null);

  // Synchronize authentication state to support static page embeds
  useEffect(() => {
    if (contextUserData) {
      setLocalUserData(contextUserData);
      return;
    }

    const loadLocalData = () => {
      try {
        const saved = localStorage.getItem("takeoutfix_user_data");
        if (saved) {
          setLocalUserData(JSON.parse(saved));
        }
      } catch (_) {}
    };

    loadLocalData();

    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        loadLocalData();
      } else {
        setLocalUserData(null);
      }
    });

    window.addEventListener("storage", loadLocalData);
    window.addEventListener("takeoutfix_user_sync", loadLocalData);

    return () => {
      unsubscribe();
      window.removeEventListener("storage", loadLocalData);
      window.removeEventListener("takeoutfix_user_sync", loadLocalData);
    };
  }, [contextUserData]);

  const activeUserData = contextUserData || localUserData;
  const isPaidPlan = activeUserData?.plan === 'super' || activeUserData?.plan === 'pro';
  const isAdFree = isPaidPlan && !activeUserData?.supportWithAds;

  // Initialize offset based on slot to diversify banners across the same page
  useEffect(() => {
    if (slot) {
      const idx = parseInt(slot, 10);
      if (!isNaN(idx)) {
        setAdIndex((idx * 3) % ALL_ADS.length);
        return;
      }
    }
    const randomIdx = Math.floor(Math.random() * ALL_ADS.length);
    setAdIndex(randomIdx);
  }, [slot]);

  // Handle smooth rotation
  const changeAd = (nextIndex: number) => {
    setIsFading(true);
    setTimeout(() => {
      setAdIndex(nextIndex);
      setIsFading(false);
    }, 150);
  };

  const handleNext = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    changeAd((adIndex + 1) % ALL_ADS.length);
  };

  const handlePrev = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    changeAd((adIndex - 1 + ALL_ADS.length) % ALL_ADS.length);
  };

  // Rotate every 30 seconds unless hovered
  useEffect(() => {
    if (isHovered) return;
    const interval = setInterval(() => {
      handleNext();
    }, 30000);

    return () => clearInterval(interval);
  }, [isHovered, adIndex]);

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

  const activeAd = ALL_ADS[adIndex];

  // Map requested layout to targeted formatting mode
  let resolvedLayout: "wide" | "square" | "compact" | "vertical" = "compact";
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

  const wrapperBaseClass = `w-full mx-auto bg-zinc-50/70 dark:bg-zinc-950/30 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl relative overflow-hidden group select-none transition-all duration-200 hover:border-zinc-300 dark:hover:border-zinc-700 ${className}`;
  
  const btnClass = "px-5 py-2 rounded-lg font-semibold text-xs border btn-outline-custom transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0 hover:scale-[1.02] active:scale-[0.98]";

  // Shared navigation controls header/footer
  const renderNavControls = () => (
    <div className="flex items-center gap-1.5 text-zinc-400 dark:text-zinc-500">
      <span className="text-[9px] font-mono font-medium opacity-70">
        {adIndex + 1}/{ALL_ADS.length}
      </span>
      <button 
        onClick={handlePrev}
        aria-label="Previous deal"
        className="w-5 h-5 flex items-center justify-center rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>
      <button 
        onClick={handleNext}
        aria-label="Next deal"
        className="w-5 h-5 flex items-center justify-center rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  const renderBadge = () => (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] font-bold tracking-wider uppercase text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 px-1.5 py-0.5 rounded flex items-center gap-1">
        <Sparkles className="w-2.5 h-2.5" />
        {activeAd.tag}
      </span>
      {activeAd.isExternal && (
        <span className="text-[8px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-800">
          Amazon Deal
        </span>
      )}
    </div>
  );

  // 1. HORIZONTAL WIDE BANNER VIEW (width >= 620px)
  if (resolvedLayout === "wide") {
    return (
      <div 
        ref={containerRef} 
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`${wrapperBaseClass} p-4 sm:p-5 flex flex-col gap-3`}
      >
        <div className="flex items-center justify-between border-b border-dashed border-zinc-200 dark:border-zinc-800 pb-2">
          <div className="flex items-center gap-2">
            {renderBadge()}
            <span className="text-[10px] text-zinc-450 dark:text-zinc-500 italic hidden sm:inline">
              {activeAd.isExternal ? "Featured Amazon deal (rotates every 30s)" : "TakeoutFix recommendation"}
            </span>
          </div>
          {renderNavControls()}
        </div>

        <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 transition-opacity duration-150 ${isFading ? "opacity-0" : "opacity-100"}`}>
          <div className="flex items-start gap-3.5 w-full sm:w-auto">
            <div className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shadow-sm shrink-0 text-xl">
              {activeAd.icon}
            </div>
            <div className="space-y-0.5 text-left flex-1 min-w-0">
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight truncate sm:whitespace-normal">{activeAd.title}</p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 max-w-xl leading-relaxed">{activeAd.description}</p>
            </div>
          </div>
          <div className="shrink-0 w-full sm:w-auto">
            <a 
              href={activeAd.link} 
              target={activeAd.isExternal ? "_blank" : undefined}
              rel={activeAd.isExternal ? "noopener noreferrer nofollow" : undefined}
              className="block w-full sm:w-auto"
            >
              <button className={btnClass}>
                <span>{activeAd.ctaText}</span>
                {activeAd.isExternal ? <ExternalLink className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
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
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`${wrapperBaseClass} p-4 flex flex-col gap-3 text-center`}
      >
        <div className="flex items-center justify-between border-b border-dashed border-zinc-200 dark:border-zinc-800 pb-2">
          {renderBadge()}
          {renderNavControls()}
        </div>

        <div className={`flex flex-col items-center justify-center py-2 space-y-3 transition-opacity duration-150 ${isFading ? "opacity-0" : "opacity-100"}`}>
          <div className="w-12 h-12 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shadow-sm text-2xl">
            {activeAd.icon}
          </div>
          <div className="space-y-1.5 px-1">
            <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 leading-snug">{activeAd.title}</p>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-relaxed line-clamp-3">{activeAd.description}</p>
          </div>
        </div>

        <div className="mt-auto pt-1">
          <a 
            href={activeAd.link}
            target={activeAd.isExternal ? "_blank" : undefined}
            rel={activeAd.isExternal ? "noopener noreferrer nofollow" : undefined}
            className="block w-full"
          >
            <button className={`${btnClass} w-full py-1.5 text-[11px]`}>
              <span>{activeAd.ctaText}</span>
              {activeAd.isExternal ? <ExternalLink className="w-3 h-3" /> : <ArrowRight className="w-3 h-3" />}
            </button>
          </a>
          <div className="mt-2 text-[9px] text-zinc-400 dark:text-zinc-500 italic">
            Rotates every 30 seconds
          </div>
        </div>
      </div>
    );
  }

  // 3. SQUARE CARD / GRID BOX VIEW (width 400px – 620px)
  if (resolvedLayout === "square") {
    return (
      <div 
        ref={containerRef} 
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`${wrapperBaseClass} p-4 flex flex-col justify-between text-center gap-3`}
      >
        <div className="flex items-center justify-between border-b border-dashed border-zinc-200 dark:border-zinc-800 pb-2">
          {renderBadge()}
          {renderNavControls()}
        </div>

        <div className={`flex flex-col items-center justify-center space-y-2.5 transition-opacity duration-150 ${isFading ? "opacity-0" : "opacity-100"}`}>
          <div className="w-11 h-11 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shadow-sm text-xl">
            {activeAd.icon}
          </div>
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 tracking-tight leading-snug">{activeAd.title}</h4>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-[260px] mx-auto">{activeAd.description}</p>
          </div>
        </div>

        <a 
          href={activeAd.link}
          target={activeAd.isExternal ? "_blank" : undefined}
          rel={activeAd.isExternal ? "noopener noreferrer nofollow" : undefined}
          className="block w-full mt-1"
        >
          <button className={`${btnClass} w-full`}>
            <span>{activeAd.ctaText}</span>
            {activeAd.isExternal ? <ExternalLink className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
          </button>
        </a>
      </div>
    );
  }

  // 4. COMPACT CARD VIEW (width < 400px mobile fallbacks)
  return (
    <div 
      ref={containerRef} 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`${wrapperBaseClass} p-3.5 flex flex-col justify-between gap-3 text-center`}
    >
      <div className="flex items-center justify-between border-b border-dashed border-zinc-200 dark:border-zinc-800 pb-1.5">
        {renderBadge()}
        {renderNavControls()}
      </div>

      <div className={`flex flex-col items-center space-y-1.5 transition-opacity duration-150 ${isFading ? "opacity-0" : "opacity-100"}`}>
        <div className="w-9 h-9 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shrink-0 text-lg">
          {activeAd.icon}
        </div>
        <div className="space-y-0.5">
          <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 tracking-tight leading-tight">{activeAd.title}</p>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-normal max-w-[220px] mx-auto line-clamp-2">{activeAd.description}</p>
        </div>
      </div>

      <a 
        href={activeAd.link}
        target={activeAd.isExternal ? "_blank" : undefined}
        rel={activeAd.isExternal ? "noopener noreferrer nofollow" : undefined}
        className="block w-full mt-0.5"
      >
        <button className={`${btnClass} w-full py-1.5 text-xs`}>
          <span>{activeAd.ctaText}</span>
          {activeAd.isExternal ? <ExternalLink className="w-3 h-3" /> : <ArrowRight className="w-3 h-3" />}
        </button>
      </a>
    </div>
  );
}
