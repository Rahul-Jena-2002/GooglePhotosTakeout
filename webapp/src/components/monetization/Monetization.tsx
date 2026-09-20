import React, { useEffect, useState, useRef } from "react";
import {
  getMonetizationContent,
  getPlacementSlotIndex,
  getPageVisitSeed,
  getRotationTick,
} from "../../services/monetization/monetizationEngine";
import type { MonetizationResponse, ResolvedMonetizationItem } from "../../services/monetization/types";
import { useAuth } from "../../contexts/AuthContext";
import { auth } from "../../firebase";
import { ArrowRight, ExternalLink, Sparkles, ShieldCheck } from "lucide-react";
import { detectAdBlock } from "../../services/monetization/AdBlockDetector";

import { DEFAULT_AFFILIATE_LINKS, DEFAULT_AD_UNITS } from "../../services/monetization/defaultData";

export interface MonetizationProps {
  placement: string;
  layout?: "auto" | "horizontal" | "vertical" | "square" | "compact";
  className?: string;
  preview?: boolean;
}

function getInitialDefaultResponse(placementCode: string): MonetizationResponse {
  const isSidebar = placementCode.startsWith("SIDEBAR") || placementCode.startsWith("GUTTER");
  const slotIndex = getPlacementSlotIndex(placementCode);
  const rotationOffset = getPageVisitSeed() + getRotationTick();

  const affMatches = DEFAULT_AFFILIATE_LINKS.filter(
    (l) => l.placementCodes.length === 0 || l.placementCodes.includes(placementCode) || (isSidebar && l.placementCodes.includes("SIDEBAR"))
  );

  const affCandidate =
    affMatches.length > 0
      ? affMatches[(slotIndex + rotationOffset) % affMatches.length]
      : DEFAULT_AFFILIATE_LINKS[0];

  const adCandidate =
    DEFAULT_AD_UNITS.find(
      (u) => u.placementCodes.includes(placementCode) || (isSidebar && u.placementCodes.includes("SIDEBAR")) || u.placementCodes.length === 0
    ) || DEFAULT_AD_UNITS[0];

  return {
    placement: placementCode,
    enabled: true,
    mode: "BOTH",
    affiliate: affCandidate
      ? {
          id: affCandidate.id,
          type: "AFFILIATE",
          title: affCandidate.title,
          description: affCandidate.description,
          destinationUrl: affCandidate.destinationUrl,
          imageUrl: affCandidate.imageUrl,
          ctaText: affCandidate.ctaText,
          tag: affCandidate.tag,
          isExternal: affCandidate.isExternal,
          providerName: affCandidate.providerName,
        }
      : null,
    ad: adCandidate
      ? {
          id: adCandidate.id,
          type: "AD",
          title: adCandidate.name,
          adType: adCandidate.adType,
          embedCode: adCandidate.embedCode,
          imageUrl: adCandidate.imageUrl,
          destinationUrl: adCandidate.destinationUrl,
          ctaText: adCandidate.ctaText,
          providerName: adCandidate.providerName,
        }
      : null,
    empty: false,
  };
}

export default function Monetization({
  placement,
  layout = "auto",
  className = "",
  preview = false,
}: MonetizationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [data, setData] = useState<MonetizationResponse | null>(() =>
    getInitialDefaultResponse(placement)
  );
  const [loading, setLoading] = useState(false);

  const { userData: contextUserData } = useAuth();
  const [localUserData, setLocalUserData] = useState<any>(null);

  // Sync auth state for static / client island pages
  useEffect(() => {
    if (contextUserData) {
      setLocalUserData(contextUserData);
      return;
    }

    const loadLocal = () => {
      try {
        const saved = localStorage.getItem("takeoutfix_user_data");
        if (saved) setLocalUserData(JSON.parse(saved));
      } catch (_) {}
    };

    loadLocal();
    const unsub = auth.onAuthStateChanged((u) => {
      if (u) loadLocal();
      else setLocalUserData(null);
    });

    window.addEventListener("storage", loadLocal);
    window.addEventListener("takeoutfix_user_sync", loadLocal);

    return () => {
      unsub();
      window.removeEventListener("storage", loadLocal);
      window.removeEventListener("takeoutfix_user_sync", loadLocal);
    };
  }, [contextUserData]);

  const activeUser = contextUserData || localUserData;
  const userPlan = activeUser?.plan || "free";
  const supportWithAds = !!activeUser?.supportWithAds;

  // Measure container width for responsive auto-layout
  useEffect(() => {
    if (!containerRef.current || layout !== "auto") return;
    const el = containerRef.current;
    const obs = new ResizeObserver((entries) => {
      if (entries && entries.length > 0) {
        setContainerWidth(entries[0].contentRect.width);
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [layout]);

  // Fetch monetization content for this placement
  useEffect(() => {
    let mounted = true;
    setLoading(true);

    getMonetizationContent(placement, {
      preview,
      userPlan,
      supportWithAds,
    })
      .then((res) => {
        if (mounted) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn("[Monetization] Error loading placement:", placement, err);
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [placement, preview, userPlan, supportWithAds]);

  // Universal 15-second rotation cycle listener: smoothly swap ads without flicker or loader
  useEffect(() => {
    let mounted = true;

    const handleAdRotate = () => {
      getMonetizationContent(placement, {
        preview,
        userPlan,
        supportWithAds,
      })
        .then((res) => {
          if (mounted) {
            setData(res);
          }
        })
        .catch((err) => {
          console.warn("[Monetization] Error rotating placement:", placement, err);
        });
    };

    window.addEventListener("takeoutfix_ad_rotate", handleAdRotate);
    return () => {
      mounted = false;
      window.removeEventListener("takeoutfix_ad_rotate", handleAdRotate);
    };
  }, [placement, preview, userPlan, supportWithAds]);

  const [adUnavailable, setAdUnavailable] = useState(false);
  const [affiliateUnavailable, setAffiliateUnavailable] = useState(false);

  useEffect(() => {
    setAdUnavailable(false);
    setAffiliateUnavailable(false);
  }, [data]);

  if (loading) {
    return (
      <div
        ref={containerRef}
        className={`w-full mx-auto py-2 flex items-center justify-center opacity-40 animate-pulse text-[11px] text-zinc-500 ${className}`}
      >
        <span className="w-2 h-2 rounded-full bg-zinc-400 mr-2 animate-ping" />
        Loading...
      </div>
    );
  }

  if (!data || !data.enabled || data.empty) {
    return null; // Gracefully collapse when disabled, exempt, or empty
  }

  const isAffiliateValid = (item?: ResolvedMonetizationItem | null): boolean => {
    if (!item) return false;
    if (!item.destinationUrl || item.destinationUrl.startsWith("/") || item.destinationUrl.includes("takeoutfix")) return false;
    return true;
  };

  const isAdValid = (item?: ResolvedMonetizationItem | null): boolean => {
    if (!item) return false;
    if (item.adType === "NATIVE" || item.adType === "IFRAME") {
      if (!item.destinationUrl || item.destinationUrl.startsWith("/") || item.destinationUrl.includes("takeoutfix")) return false;
    }
    return true;
  };

  const effectiveAffiliate =
    !affiliateUnavailable && isAffiliateValid(data.affiliate) ? data.affiliate : null;
  const effectiveAd =
    !adUnavailable && isAdValid(data.ad) ? data.ad : null;

  // If both are missing or empty, gracefully collapse banner entirely to prevent whitespace
  if (!effectiveAffiliate && !effectiveAd) {
    return null;
  }

  const hasBoth = !!(effectiveAffiliate && effectiveAd);
  const isCompact = layout === "compact";
  const isVertical = layout === "vertical" || isCompact;
  const adOpacity = data.adOpacity ?? 80;
  const adSize = data.adSize ?? "small";

  return (
    <div
      ref={containerRef}
      style={{ opacity: `var(--ad-opacity, ${adOpacity / 100})` }}
      className={`w-full mx-auto overflow-hidden hover:!opacity-100 transition-opacity duration-200 ${
        isCompact
          ? "rounded-xl border border-zinc-200/80 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 p-2 hover:border-zinc-300 dark:hover:border-zinc-700 shadow-xs"
          : isVertical
          ? "rounded-xl border border-zinc-200/80 dark:border-white/10 bg-white/70 dark:bg-zinc-800/40 p-2.5 hover:border-zinc-300 dark:hover:border-zinc-600 shadow-xs"
          : "my-3 rounded-2xl border border-zinc-200/90 dark:border-white/10 bg-white/90 dark:bg-zinc-900/70 p-3 shadow-sm backdrop-blur-xs hover:border-zinc-300 dark:hover:border-zinc-700"
      } ${className}`}
    >
      {hasBoth ? (
        // Mode = BOTH (Render side-by-side on desktop / stacked vertically when isVertical or on mobile)
        <div
          className={
            isVertical
              ? "flex flex-col gap-3 divide-y divide-zinc-200 dark:divide-zinc-800"
              : "grid grid-cols-1 md:grid-cols-2 gap-4 divide-y md:divide-y-0 md:divide-x divide-dashed divide-zinc-200 dark:divide-zinc-800"
          }
        >
          <div className="flex flex-col justify-between">
            <AffiliateCardItem
              key={effectiveAffiliate?.id || "aff"}
              item={effectiveAffiliate!}
              isVertical={isVertical}
              isCompact={isCompact}
              adSize={adSize}
              onUnavailable={() => setAffiliateUnavailable(true)}
            />
          </div>
          <div className={`${isVertical ? "pt-3" : "pt-4 md:pt-0 md:pl-4"} flex flex-col justify-between`}>
            <AdUnitItem
              key={effectiveAd?.id || "ad"}
              item={effectiveAd!}
              preview={preview}
              isCompact={isCompact}
              adSize={adSize}
              onUnavailable={() => setAdUnavailable(true)}
            />
          </div>
        </div>
      ) : effectiveAffiliate ? (
        // Mode = AFFILIATE_ONLY or Automatic Fallback to 100% Affiliate
        <AffiliateCardItem
          key={effectiveAffiliate.id}
          item={effectiveAffiliate}
          fullWidth
          isVertical={isVertical}
          isCompact={isCompact}
          adSize={adSize}
          onUnavailable={() => setAffiliateUnavailable(true)}
        />
      ) : effectiveAd ? (
        // Mode = ADS_ONLY or Automatic Fallback to 100% Ad
        <AdUnitItem
          key={effectiveAd.id}
          item={effectiveAd}
          fullWidth
          preview={preview}
          isCompact={isCompact}
          adSize={adSize}
          onUnavailable={() => setAdUnavailable(true)}
        />
      ) : null}
    </div>
  );
}

// ─── Subcomponent: Affiliate Item Renderer ──────────────────────────────────
function AffiliateCardItem({
  item,
  fullWidth = false,
  isVertical = false,
  isCompact = false,
  adSize = "small",
  onUnavailable,
}: {
  item: ResolvedMonetizationItem;
  fullWidth?: boolean;
  isVertical?: boolean;
  isCompact?: boolean;
  adSize?: "small" | "medium" | "large";
  onUnavailable?: () => void;
}) {
  // Never show internal website upsells/links in the monetization banner
  if (!item.destinationUrl || item.destinationUrl.startsWith("/") || item.destinationUrl.includes("takeoutfix")) {
    onUnavailable?.();
    return null;
  }

  if (isCompact) {
    return (
      <div className="flex flex-col gap-1.5 text-left w-full group">
        {/* Compact Header Tag */}
        <div className="flex items-center justify-between gap-1">
          <span className="text-[8.5px] font-bold tracking-wider uppercase text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800/60 px-1.5 py-0.5 rounded flex items-center gap-1">
            <Sparkles className="w-2 h-2" />
            {item.tag || "Featured Deal"}
          </span>
          {item.providerName && (
            <span className="text-[8px] font-medium uppercase text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800/80 px-1 py-0.5 rounded border border-zinc-200/50 dark:border-zinc-700/50">
              {item.providerName}
            </span>
          )}
        </div>

        {/* Compact Body: Thumbnail + Info */}
        <div className="flex items-center gap-2.5">
          {item.imageUrl ? (
            <a
              href={item.destinationUrl || "#"}
              target={item.isExternal ? "_blank" : undefined}
              rel={item.isExternal ? "noopener noreferrer nofollow" : undefined}
              className="block shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-white dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700 p-0.5"
            >
              <img
                src={item.imageUrl}
                alt={item.title || "Product"}
                className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = "none";
                }}
              />
            </a>
          ) : (
            <div className="shrink-0 w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-sm">
              🎁
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-blue-500 transition-colors">
              {item.title}
            </h4>
            {item.description && (
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 line-clamp-1 leading-tight mt-0.5">
                {item.description}
              </p>
            )}
            <div className="mt-1">
              <a
                href={item.destinationUrl || "#"}
                target={item.isExternal ? "_blank" : undefined}
                rel={item.isExternal ? "noopener noreferrer nofollow" : undefined}
                className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                <span>{item.ctaText || "Shop on Amazon"}</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isVertical) {
    const visualHeight = adSize === "large" ? "h-20" : adSize === "medium" ? "h-16" : "h-14";

    return (
      <div className="flex flex-col h-full justify-between gap-1.5 text-left w-full group">
        {/* Header Tag */}
        <div className="flex items-center justify-between gap-1">
          <span className="text-[8px] font-bold tracking-wider uppercase text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800/60 px-1.5 py-0.5 rounded flex items-center gap-1">
            <Sparkles className="w-2 h-2" />
            {item.tag || "Featured Recommendation"}
          </span>
          {item.providerName && (
            <span className="text-[7px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800/80 px-1 py-0.5 rounded border border-zinc-200/60 dark:border-zinc-700/60">
              {item.providerName}
            </span>
          )}
        </div>

        {/* Product Visual - Sleek, low-height compact thumbnail */}
        {item.imageUrl ? (
          <a
            href={item.destinationUrl || "#"}
            target={item.isExternal ? "_blank" : undefined}
            rel={item.isExternal ? "noopener noreferrer nofollow" : undefined}
            className="block w-full overflow-hidden rounded-lg bg-white dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-800 my-0.5 group-hover:border-zinc-300 dark:group-hover:border-zinc-700 transition-colors p-1"
          >
            <img
              src={item.imageUrl}
              alt={item.title || "Product"}
              className={`w-full ${visualHeight} object-contain group-hover:scale-105 transition-transform duration-300`}
              loading="lazy"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = "none";
              }}
            />
          </a>
        ) : (
          <div className="w-full h-10 rounded-lg bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-indigo-500/10 border border-zinc-200/60 dark:border-white/5 flex items-center justify-center text-sm my-0.5">
            🎁
          </div>
        )}

        {/* Content - 1 line title and 1 line description for minimal height */}
        <div className="space-y-0.5">
          <h4 className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight line-clamp-1 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            {item.title}
          </h4>
          {item.description && (
            <p className="text-[9.5px] text-zinc-500 dark:text-zinc-400 line-clamp-1 leading-tight">
              {item.description}
            </p>
          )}
        </div>

        {/* Action Button - Low profile */}
        <div className="pt-0.5">
          <a
            href={item.destinationUrl || "#"}
            target={item.isExternal ? "_blank" : undefined}
            rel={item.isExternal ? "noopener noreferrer nofollow" : undefined}
            className="block w-full"
          >
            <button className="w-full py-1 px-2 rounded-md text-[10px] font-semibold bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-950 transition-all flex items-center justify-center gap-1 shadow-2xs cursor-pointer active:scale-95">
              <span>{item.ctaText || "View on Amazon"}</span>
              {item.isExternal ? <ExternalLink className="w-2 h-2" /> : <ArrowRight className="w-2 h-2" />}
            </button>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full justify-between gap-3 text-left">
      {/* Header Tag */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold tracking-wider uppercase text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 px-1.5 py-0.5 rounded flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5" />
            {item.tag || "Featured Recommendation"}
          </span>
          {item.providerName && (
            <span className="text-[8px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-800">
              {item.providerName}
            </span>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className={`flex items-start gap-3 ${fullWidth ? "sm:items-center" : ""}`}>
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.title || "Affiliate product"}
            className="w-12 h-12 rounded-lg object-cover border border-zinc-200 dark:border-zinc-800 shrink-0"
            loading="lazy"
          />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shrink-0 text-lg">
            🎁
          </div>
        )}

        <div className="space-y-0.5 flex-1 min-w-0">
          <h4 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight line-clamp-1">
            {item.title}
          </h4>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
            {item.description}
          </p>
        </div>
      </div>

      {/* CTA Button */}
      <div className="mt-1">
        <a
          href={item.destinationUrl || "#"}
          target={item.isExternal ? "_blank" : undefined}
          rel={item.isExternal ? "noopener noreferrer nofollow" : undefined}
          className="inline-block w-full sm:w-auto"
        >
          <button className="w-full sm:w-auto px-4 py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 transition-all flex items-center justify-center gap-1.5 shadow-sm">
            <span>{item.ctaText || "View Deal"}</span>
            {item.isExternal ? <ExternalLink className="w-3 h-3" /> : <ArrowRight className="w-3 h-3" />}
          </button>
        </a>
      </div>
    </div>
  );
}

// ─── Subcomponent: Ad Unit Item Renderer ────────────────────────────────────
function AdUnitItem({
  item,
  fullWidth = false,
  onUnavailable,
  preview = false,
  isCompact = false,
  adSize = "small",
}: {
  item: ResolvedMonetizationItem;
  fullWidth?: boolean;
  onUnavailable?: () => void;
  preview?: boolean;
  isCompact?: boolean;
  adSize?: "small" | "medium" | "large";
}) {
  const adType = item.adType || "NATIVE";
  const embedRef = useRef<HTMLDivElement>(null);

  if (isCompact) {
    if (!item.destinationUrl || item.destinationUrl.startsWith("/") || item.destinationUrl.includes("takeoutfix")) {
      onUnavailable?.();
      return null;
    }
    return (
      <div className="flex flex-col gap-1.5 text-left w-full group">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[8.5px] font-bold tracking-wider uppercase text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800/60 px-1.5 py-0.5 rounded flex items-center gap-1">
            <ShieldCheck className="w-2 h-2" />
            Sponsored
          </span>
          {item.providerName && (
            <span className="text-[8px] font-medium uppercase text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800/80 px-1 py-0.5 rounded border border-zinc-200/50 dark:border-zinc-700/50">
              {item.providerName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          {item.imageUrl ? (
            <a
              href={item.destinationUrl || "#"}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="block shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-white dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700 p-0.5"
            >
              <img
                src={item.imageUrl}
                alt={item.title || "Ad"}
                className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                loading="lazy"
                onError={() => onUnavailable?.()}
              />
            </a>
          ) : null}
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-blue-500 transition-colors">
              {item.title}
            </h4>
            <div className="mt-1">
              <a
                href={item.destinationUrl || "#"}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                <span>{item.ctaText || "Learn More"}</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Trigger Google AdSense script push for responsive units
  useEffect(() => {
    if (adType === "HTML" || adType === "SCRIPT" || adType === "DISPLAY") {
      try {
        if (typeof window !== "undefined" && (window as any).adsbygoogle) {
          ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
        }
      } catch (_) {}
    }
  }, [adType, item.embedCode]);

  // Fallback Engine: Active detection of blocked or unfilled AdSense units
  useEffect(() => {
    if (preview) return; // In admin preview simulation, do not auto-collapse

    if (adType === "HTML" || adType === "SCRIPT" || adType === "DISPLAY") {
      // 1. Check AdBlocker status
      detectAdBlock().then((blocked) => {
        if (blocked) {
          onUnavailable?.();
        }
      });

      // 2. Check if embed container or ins tag is unfilled or empty
      const checkAdSenseFilled = () => {
        if (!embedRef.current) return;
        const ins = embedRef.current.querySelector("ins.adsbygoogle");
        if (ins) {
          const status = ins.getAttribute("data-ad-status");
          // Google AdSense explicitly tags unfilled slots
          if (status === "unfilled") {
            onUnavailable?.();
            return;
          }
          // If no iframe is injected and ins has no visual children/content
          const hasIframe = !!ins.querySelector("iframe");
          const hasChildren = ins.children.length > 0;
          if (!hasIframe && !hasChildren) {
            onUnavailable?.();
            return;
          }
        } else if (!embedRef.current.innerHTML.trim()) {
          onUnavailable?.();
        }
      };

      const isLocalhost =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

      // Give AdSense script a moment to load and inject (150ms on localhost, 800ms in production)
      const timer = setTimeout(checkAdSenseFilled, isLocalhost ? 150 : 800);

      let observer: MutationObserver | null = null;
      if (embedRef.current && typeof MutationObserver !== "undefined") {
        observer = new MutationObserver(() => {
          checkAdSenseFilled();
        });
        observer.observe(embedRef.current, {
          attributes: true,
          childList: true,
          subtree: true,
          attributeFilter: ["data-ad-status", "data-adsbygoogle-status", "style"],
        });
      }

      return () => {
        clearTimeout(timer);
        observer?.disconnect();
      };
    }
  }, [adType, preview, onUnavailable]);

  // HTML / Script / Embed Unit (e.g. Google AdSense auto / responsive unit)
  if (adType === "HTML" || adType === "SCRIPT" || adType === "DISPLAY") {
    return (
      <div className="flex flex-col h-full justify-between gap-2 text-left w-full min-h-[90px]">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold tracking-wider uppercase text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 px-1.5 py-0.5 rounded flex items-center gap-1">
            <ShieldCheck className="w-2.5 h-2.5" />
            Sponsored
          </span>
          {item.providerName && (
            <span className="text-[8px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-800">
              {item.providerName}
            </span>
          )}
        </div>

        {item.embedCode ? (
          <div
            ref={embedRef}
            className="w-full overflow-hidden rounded-lg my-1 min-h-[80px] flex items-center justify-center"
            dangerouslySetInnerHTML={{ __html: item.embedCode }}
          />
        ) : null}
      </div>
    );
  }

  // IFRAME Ad
  if (adType === "IFRAME") {
    if (!item.destinationUrl || item.destinationUrl.startsWith("/") || item.destinationUrl.includes("takeoutfix")) {
      onUnavailable?.();
      return null;
    }
    return (
      <div className="flex flex-col h-full justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold tracking-wider uppercase text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 px-1.5 py-0.5 rounded">
            Sponsored Ad
          </span>
        </div>
        <iframe
          src={item.destinationUrl}
          title={item.title || "Sponsor Ad"}
          className="w-full h-32 border-0 rounded-lg overflow-hidden"
          sandbox="allow-scripts allow-same-origin allow-popups"
          loading="lazy"
          onError={() => onUnavailable?.()}
        />
      </div>
    );
  }

  // IMAGE Banner
  if (adType === "IMAGE") {
    if (!item.imageUrl || !item.destinationUrl || item.destinationUrl.startsWith("/") || item.destinationUrl.includes("takeoutfix")) {
      onUnavailable?.();
      return null;
    }
    return (
      <div className="flex flex-col h-full justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold tracking-wider uppercase text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 px-1.5 py-0.5 rounded">
            Partner
          </span>
        </div>
        <a
          href={item.destinationUrl || "#"}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="block w-full overflow-hidden rounded-lg group"
        >
          <img
            src={item.imageUrl}
            alt={item.title || "Ad banner"}
            className="w-full object-cover max-h-36 rounded-lg border border-zinc-200 dark:border-zinc-800 transition-transform group-hover:scale-[1.01]"
            loading="lazy"
            onError={() => onUnavailable?.()}
          />
        </a>
      </div>
    );
  }

  // NATIVE Ad (Custom external sponsor card only)
  if (!item.destinationUrl || item.destinationUrl.startsWith("/") || item.destinationUrl.includes("takeoutfix")) {
    onUnavailable?.();
    return null;
  }

  return (
    <div className="flex flex-col h-full justify-between gap-3 text-left">
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] font-bold tracking-wider uppercase text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 px-1.5 py-0.5 rounded flex items-center gap-1">
          <ShieldCheck className="w-2.5 h-2.5" />
          Featured Partner
        </span>
        {item.providerName && (
          <span className="text-[8px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-800">
            {item.providerName}
          </span>
        )}
      </div>

      <div className={`flex items-start gap-3 ${fullWidth ? "sm:items-center" : ""}`}>
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.title || "Ad unit"}
            className="w-12 h-12 rounded-lg object-cover border border-zinc-200 dark:border-zinc-800 shrink-0"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = "none";
            }}
          />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shrink-0 text-lg">
            ⚡
          </div>
        )}

        <div className="space-y-0.5 flex-1 min-w-0">
          <h4 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight line-clamp-1">
            {item.title}
          </h4>
          {item.embedCode ? (
            <div
              className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: item.embedCode }}
            />
          ) : null}
        </div>
      </div>

      <div className="mt-1">
        <a
          href={item.destinationUrl || "#"}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-block w-full sm:w-auto"
        >
          <button className="w-full sm:w-auto px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all flex items-center justify-center gap-1.5 shadow-sm">
            <span>{item.ctaText || "Learn More"}</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </a>
      </div>
    </div>
  );
}
