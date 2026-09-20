import { useState, useEffect } from "react";
import { useAuth, AuthProvider, REGION_PRICING_CONFIGS, formatPrice, resolveComparisonRowValues, type ComparisonRow } from "../../contexts/AuthContext";
import { ArrowRight } from "lucide-react";
import { db } from "../../firebase";
import { doc, getDoc, collection, query, where, getDocs, onSnapshot } from "firebase/firestore";
import { useToastStore } from "../../store/useToastStore";

const renderFormattedText = (text: string) => {
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

const getTableCellStyle = (val: string, plan: 'free' | 'recovery_pass' | 'pro' | 'super') => {
  const lowerVal = val.toLowerCase().trim();
  
  if (lowerVal === "—" || lowerVal === "-" || !lowerVal) {
    return "text-zinc-400 dark:text-zinc-650 font-normal";
  }

  // Devices and partial matching rates (e.g. up to 90% or up to 90.8%*) should be flat black/white
  if (lowerVal.includes("device") || lowerVal.includes("90") || lowerVal.includes("%*") || lowerVal.includes("matching")) {
    return "text-black dark:text-white font-bold";
  }
  
  if (plan === 'super') {
    if (
      lowerVal.includes("unlimited") || 
      lowerVal.includes("enabled") || 
      lowerVal.includes("included") || 
      lowerVal.includes("complete") || 
      lowerVal.includes("100%")
    ) {
      return "text-emerald-600 dark:text-emerald-400 font-bold";
    }
    return "text-amber-600 dark:text-amber-500 font-bold";
  }
  
  if (plan === 'pro') {
    if (
      lowerVal.includes("unlimited") || 
      lowerVal.includes("enabled") || 
      lowerVal.includes("included") || 
      lowerVal.includes("complete") || 
      lowerVal.includes("100%")
    ) {
      // Unlocked pro limits - blue (no emerald green)
      return "text-blue-600 dark:text-blue-400 font-bold";
    }
    // Capacity or size limits (e.g., 50 GB) - blue
    const isBold = /\d/.test(lowerVal) || lowerVal.length > 2;
    return `${isBold ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-zinc-700 dark:text-zinc-300'}`;
  }
  
  const isBold = lowerVal.includes("device") || /\d/.test(lowerVal);
  return `${isBold ? 'font-bold text-zinc-900 dark:text-zinc-200' : 'text-zinc-700 dark:text-zinc-300'}`;
};

function PricingPageContent() {
  const { userData, region, campaigns, pricingTiers, featuresConfig, tierThresholds, recoveryPassHours, refundPolicy, comparisonRows, telemetryAccuracy, enablePricingAndPayments } = useAuth();
  const isPricingLoading = Object.keys(pricingTiers).length === 0;

  const [comparisonRowsLocal, setComparisonRowsLocal] = useState<ComparisonRow[] | null>(null);
  const [refundPolicyLocal, setRefundPolicyLocal] = useState<string | null>(null);
  const activeComparisonRows = comparisonRowsLocal || comparisonRows;
  const activeRefundPolicy = refundPolicyLocal ?? refundPolicy;

  const [isPromoActiveLocal, setIsPromoActiveLocal] = useState(false);
  const [timeLeftStr, setTimeLeftStr] = useState("");
  const [activeCoupons, setActiveCoupons] = useState<Record<string, string>>({});
  const [activeCouponDiscountsLocal, setActiveCouponDiscountsLocal] = useState<Record<string, number>>({});

  // ─── Limited-Time Unlimited Free Tier Promo (Overrides All Other Banners) ───
  const [isFreePromoActive, setIsFreePromoActive] = useState(false);
  const [freePromoEndsAt, setFreePromoEndsAt] = useState<number | null>(null);
  const [freePromoTimeLeft, setFreePromoTimeLeft] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "global"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.comparisonRows && Array.isArray(data.comparisonRows)) {
          setComparisonRowsLocal(data.comparisonRows);
        }
        if (data.refundPolicy !== undefined) {
          setRefundPolicyLocal(data.refundPolicy);
        }
        const promo = data.freeUnlimitedPromo;
        if (promo && promo.enabled && promo.endsAt && Date.now() < promo.endsAt) {
          setIsFreePromoActive(true);
          setFreePromoEndsAt(promo.endsAt);
        } else {
          setIsFreePromoActive(false);
          setFreePromoEndsAt(null);
        }
      }
    }, (err) => {
      console.error("Failed to listen to global promo settings:", err);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!isFreePromoActive || !freePromoEndsAt) {
      setFreePromoTimeLeft("");
      return;
    }
    const updateCountdown = () => {
      const diff = freePromoEndsAt - Date.now();
      if (diff <= 0) {
        setIsFreePromoActive(false);
        setFreePromoTimeLeft("");
        return;
      }
      const totalSecs = Math.floor(diff / 1000);
      const days = Math.floor(totalSecs / 86400);
      const hours = Math.floor((totalSecs % 86400) / 3600);
      const mins = Math.floor((totalSecs % 3600) / 60);
      const pad = (n: number) => String(n).padStart(2, '0');
      let str = `${pad(days)}d : ${pad(hours)}h : ${pad(mins)}m`;
      setFreePromoTimeLeft(str);
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [isFreePromoActive, freePromoEndsAt]);

  useEffect(() => {
    const checkPromoActive = () => {
      if (!campaigns || !campaigns.isEnabled || campaigns.status !== 'ACTIVE') {
        setIsPromoActiveLocal(false);
        return;
      }

      if (campaigns.isGlobal === false && campaigns.targetRegions && Array.isArray(campaigns.targetRegions)) {
        if (!campaigns.targetRegions.includes(region)) {
          setIsPromoActiveLocal(false);
          return;
        }
      }
      
      const condition = campaigns.expirationType || 'NONE';
      const now = Date.now();
      
      let timeConditionMet = true;
      let diff = 0;
      if (campaigns.expirationDateTime) {
        const expiryTime = campaigns.expirationDateTime.seconds 
          ? campaigns.expirationDateTime.seconds * 1000 
          : new Date(campaigns.expirationDateTime).getTime();
        timeConditionMet = now < expiryTime;
        diff = expiryTime - now;
      }
      
      let capConditionMet = true;
      if (campaigns.maxPurchaseLimit !== null && campaigns.maxPurchaseLimit !== undefined) {
        const current = campaigns.currentPurchaseCount ?? 0;
        capConditionMet = current < campaigns.maxPurchaseLimit;
      }
      
      let active = false;
      if (condition === 'NONE') active = true;
      else if (condition === 'TIME_ONLY') active = timeConditionMet;
      else if (condition === 'PURCHASE_LIMIT_ONLY') active = capConditionMet;
      else if (condition === 'BOTH') active = timeConditionMet && capConditionMet;
      
      setIsPromoActiveLocal(active);

      if (active && (condition === 'TIME_ONLY' || condition === 'BOTH') && diff > 0) {
        const totalSecs = Math.floor(diff / 1000);
        const days = Math.floor(totalSecs / 86400);
        const hours = Math.floor((totalSecs % 86400) / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        const pad = (n: number) => String(n).padStart(2, '0');
        let str = `${pad(days)}d : ${pad(hours)}h : ${pad(mins)}m`;
        setTimeLeftStr(str);
      } else {
        setTimeLeftStr("");
      }
    };

    checkPromoActive();
    const interval = setInterval(checkPromoActive, 1000);
    return () => clearInterval(interval);
  }, [campaigns]);

  useEffect(() => {
    const lookupCoupons = async () => {
      try {
        const couponsSnap = await getDocs(
          query(collection(db, "coupons"), where("active", "==", true))
        );
        const activeMap: Record<string, string> = {};
        const discountsMap: Record<string, number> = {};
        
        for (const couponDoc of couponsSnap.docs) {
          const couponData = couponDoc.data();
          
          if (couponData.campaignId) {
            const campaignDoc = await getDoc(doc(db, "campaigns", couponData.campaignId));
            if (!campaignDoc.exists()) continue;
            const campaignData = campaignDoc.data();
            if (campaignData.status !== "ACTIVE" || !campaignData.isEnabled) continue;
            
            const now = Date.now();
            const expType = campaignData.expirationType || "NONE";
            
            let timeOk = true;
            if ((expType === "TIME_ONLY" || expType === "BOTH") && campaignData.expirationDateTime) {
              const expMs = campaignData.expirationDateTime.seconds 
                ? campaignData.expirationDateTime.seconds * 1000 
                : new Date(campaignData.expirationDateTime).getTime();
              timeOk = now < expMs;
            }
            if (!timeOk) continue;
            
            let capOk = true;
            if ((expType === "PURCHASE_LIMIT_ONLY" || expType === "BOTH") && campaignData.maxPurchaseLimit != null) {
              capOk = (campaignData.currentPurchaseCount ?? 0) < campaignData.maxPurchaseLimit;
            }
            if (!capOk) continue;
          } else {
            const now = Date.now();
            if (couponData.validFrom) {
              const fromMs = couponData.validFrom.seconds ? couponData.validFrom.seconds * 1000 : new Date(couponData.validFrom).getTime();
              if (now < fromMs) continue;
            }
            if (couponData.validUntil) {
              const untilMs = couponData.validUntil.seconds ? couponData.validUntil.seconds * 1000 : new Date(couponData.validUntil).getTime();
              if (now > untilMs) continue;
            }
            if (couponData.usageLimit != null && (couponData.usedCount ?? 0) >= couponData.usageLimit) continue;
          }

          const targetsSnap = await getDocs(collection(db, "coupons", couponDoc.id, "targets"));
          targetsSnap.docs.forEach(t => {
            const td = t.data();
            if (td.regionCode === region) {
              activeMap[td.planCode] = couponData.couponCode;
              discountsMap[td.planCode] = Number(couponData.discountValue || 0);
            }
          });
        }
        
        setActiveCoupons(activeMap);
        setActiveCouponDiscountsLocal(discountsMap);
      } catch (err) {
        console.warn("Pricing coupons lookup failed:", err);
      }
    };
    
    lookupCoupons();
  }, [region, campaigns]);

  const REGION_DOC_IDS: Record<string, string> = {
    in: "India",
    cn: "China",
    jp: "Japan",
    eu: "Europe",
    t1: "Tier 1",
    t2: "Tier 2",
    t3: "US (Tier 3)",
    t4: "Tier 4"
  };

  const docId = REGION_DOC_IDS[region] || REGION_DOC_IDS.t3;
  const firestoreConfig = pricingTiers[docId];
  const staticConfig = REGION_PRICING_CONFIGS[region] || REGION_PRICING_CONFIGS.t3;
  
  const currency = firestoreConfig?.currency_code || staticConfig.currency;
  const symbol = firestoreConfig?.currency_symbol || staticConfig.symbol;

  const recoveryPassBase = firestoreConfig?.recovery_pass?.current ?? staticConfig.recoveryPass;
  const proBase = firestoreConfig?.pro_lifetime?.current ?? staticConfig.finalPro;
  const superBase = firestoreConfig?.super_lifetime?.current ?? staticConfig.finalSuper;
  const priceIncludesTax = firestoreConfig?.price_includes_tax ?? false;

  const getDiscountPct = (planKey: string) => {
    if (!isPromoActiveLocal) return 0;
    return activeCouponDiscountsLocal[planKey] || 0;
  };

  const recoveryDisc = getDiscountPct('recovery_pass');
  const proDisc = getDiscountPct('pro');
  const superDisc = getDiscountPct('super');

  // Recovery prices
  const recoveryCurrentVal = recoveryPassBase * (1 - recoveryDisc / 100);
  const formattedRecoveryCurrent = formatPrice(symbol, recoveryCurrentVal, currency);
  const formattedRecoveryWas = formatPrice(symbol, recoveryPassBase, currency);
  const showRecoveryDiscount = recoveryDisc > 0;

  // Pro prices
  const proCurrentVal = proBase * (1 - proDisc / 100);
  const formattedProCurrent = formatPrice(symbol, proCurrentVal, currency);
  const formattedProWas = formatPrice(symbol, proBase, currency);
  const showProDiscount = proDisc > 0;

  // Super prices
  const superCurrentVal = superBase * (1 - superDisc / 100);
  const formattedSuperCurrent = formatPrice(symbol, superCurrentVal, currency);
  const formattedSuperWas = formatPrice(symbol, superBase, currency);
  const showSuperDiscount = superDisc > 0;

  const bannerText = `🎉 ${campaigns?.campaignName || "Founding Member Pricing"} — ${campaigns?.currentPurchaseCount ?? 0} / ${campaigns?.maxPurchaseLimit ?? 200} slots claimed. Lock in your lifetime price before slots are gone!`;

  const formatMB = (mb: number) => {
    if (mb === 0) return "unlimited";
    if (mb >= 1024) {
      const gb = mb / 1024;
      return gb % 1 === 0 ? `${gb.toFixed(0)}GB` : `${gb.toFixed(1)}GB`;
    }
    return `${mb}MB`;
  };

  const formatLimitText = (maxFiles: number, maxSizeMB: number) => {
    if (maxFiles === 0 && maxSizeMB === 0) {
      return "unlimited files & storage";
    }
    if (maxFiles === 0) {
      return `unlimited files up to ${formatMB(maxSizeMB)}`;
    }
    if (maxSizeMB === 0) {
      return `${maxFiles.toLocaleString()} files with unlimited storage`;
    }
    return `${maxFiles.toLocaleString()} files or ${formatMB(maxSizeMB)}`;
  };

  const getFreeSubheading = () => {
    return "100% Free & Private — Unlimited browser-based restoration";
  };

  const getRecoverySubheading = () => {
    const raw = featuresConfig?.subheadings?.recovery_pass || 'Unlimited file restoration for 24 hours';
    return raw
      .replace(/\{hours\}/g, String(recoveryPassHours))
      .replace(/\b24\s*(hours|hour)\b/gi, `${recoveryPassHours} hours`)
      .replace(/\b24-hour\b/gi, `${recoveryPassHours}-hour`);
  };

  const getProSubheading = () => {
    if (!tierThresholds?.pro) return featuresConfig?.subheadings?.pro || 'Unlimited photos and videos. 2 devices. Lifetime.';
    const { maxFiles, maxSizeMB } = tierThresholds.pro;
    if (maxFiles === 0 && maxSizeMB === 0) {
      return featuresConfig?.subheadings?.pro || 'Unlimited photos and videos. 2 devices. Lifetime.';
    }
    return `Up to ${formatLimitText(maxFiles, maxSizeMB)} photos and videos. 2 devices. Lifetime.`;
  };

  const getSuperSubheading = () => {
    if (!tierThresholds?.super) return featuresConfig?.subheadings?.super || 'Unlimited + duplicate finder, before/after logs, ad-free. 3 devices. Lifetime.';
    const { maxFiles, maxSizeMB } = tierThresholds.super;
    if (maxFiles === 0 && maxSizeMB === 0) {
      return featuresConfig?.subheadings?.super || 'Unlimited + duplicate finder, before/after logs, ad-free. 3 devices. Lifetime.';
    }
    return `Up to ${formatLimitText(maxFiles, maxSizeMB)} + duplicate finder, before/after logs, ad-free. 3 devices. Lifetime.`;
  };

  const formatFeatureText = (text: string, planKey: string) => {
    if (!text || typeof text !== 'string') return text || "";
    if (planKey === 'free') {
      if (text.toLowerCase().includes('250 files') || text.toLowerCase().includes('500mb') || text.toLowerCase().includes('limit')) {
        return "Unlimited photos & videos in your browser";
      }
    }
    if (!tierThresholds?.[planKey]) return text;
    const { maxFiles, maxSizeMB } = tierThresholds[planKey];
    
    if (planKey === 'free' && text.toLowerCase().includes('250 files') && text.toLowerCase().includes('500mb')) {
      return "Unlimited photos & videos in your browser";
    }
    if (planKey === 'recovery_pass') {
      return text
        .replace(/\{hours\}/g, String(recoveryPassHours))
        .replace(/\b24\s*(hours|hour)\b/gi, `${recoveryPassHours} hours`)
        .replace(/\b24-hour\b/gi, `${recoveryPassHours}-hour`);
    }
    return text;
  };

  if (!enablePricingAndPayments) {
    return (
      <div className="w-full max-w-5xl mx-auto px-6 py-20 font-sans text-center">
        {/* Trust badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-6">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          100% Free &amp; Open Community Edition
        </div>

        <h1 className="text-4xl md:text-6xl font-black mb-6 text-zinc-900 dark:text-white tracking-tight">
          No Paywalls. No Pricing.<br />
          <span className="text-emerald-500">100% Free &amp; Unlimited.</span>
        </h1>

        <p className="text-base md:text-lg text-zinc-600 dark:text-zinc-300 max-w-2xl mx-auto leading-relaxed mb-10">
          We believe building trust is everything. Google Takeout separates your photos from their dates and locations. TakeoutFix reconnects them and restores all your photos and videos completely on your computer for free.
        </p>

        {/* Feature Grid */}
        <div className="grid sm:grid-cols-3 gap-6 mb-12 text-left">
          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-md">
            <div className="text-2xl mb-2">⚡</div>
            <h3 className="text-base font-bold text-white mb-1.5">Unlimited Restorations</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              No artificial limits. Restore small family folders or massive 50GB+ Google Takeout libraries easily.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-md">
            <div className="text-2xl mb-2">🔒</div>
            <h3 className="text-base font-bold text-white mb-1.5">100% Local Privacy</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Zero cloud uploads. Everything is processed directly inside your browser so your personal pictures never leave your device.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-md">
            <div className="text-2xl mb-2">🎯</div>
            <h3 className="text-base font-bold text-white mb-1.5">Original Dates &amp; Locations</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Puts your pictures back in chronological order with original camera timestamps, GPS locations, and descriptions intact.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <a href="/tool">
            <button className="btn-monochrome-primary px-8 h-14 font-bold text-sm rounded-xl cursor-pointer shadow-lg hover:scale-105 transition-all">
              Launch Free Web Studio &rarr;
            </button>
          </a>
          <a href="/download">
            <button className="btn-monochrome-secondary px-8 h-14 font-bold text-sm rounded-xl cursor-pointer hover:bg-white/10 transition-all">
              Download Free Desktop App
            </button>
          </a>
        </div>

        <div className="mt-16 pt-8 border-t border-white/5 text-xs text-zinc-500">
          Want to support continued development? Sponsor us on <a href="https://github.com/sponsors" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">GitHub Sponsors</a> or share TakeoutFix with friends.
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-6 py-16 font-sans select-none">
      <div className="text-center mb-12 flex flex-col items-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-4 text-zinc-900 dark:text-white tracking-tight font-semibold">
          Simple Pricing
        </h1>
        <p className="text-lg text-zinc-650 dark:text-zinc-300 max-w-2xl mx-auto leading-relaxed">
          Every plan works completely on your computer to restore your photos safely and privately.
        </p>
      </div>

      {/* ─── BANNER SECTION: Free Unlimited Promo OVERRIDES Every Other Banner ─── */}
      {isFreePromoActive ? (
        <div className="mb-12 max-w-2xl mx-auto bg-gradient-to-b from-emerald-50/90 via-emerald-50/40 to-white dark:from-emerald-950/40 dark:via-zinc-900/40 dark:to-zinc-900/60 border-2 border-emerald-400/50 dark:border-emerald-500/40 backdrop-blur-md rounded-2xl p-7 text-center flex flex-col gap-4 items-center shadow-lg shadow-emerald-500/10 animate-in fade-in zoom-in-95 duration-300">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs font-black uppercase tracking-wider border border-emerald-300 dark:border-emerald-500/40 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-600 dark:bg-emerald-400 animate-ping" />
            Special Limited-Time Event
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-zinc-950 dark:text-white tracking-tight">
            🎉 100% Free Unlimited Restoration is Live!
          </h2>
          <p className="text-sm md:text-base text-zinc-750 dark:text-zinc-300 max-w-lg leading-relaxed font-medium">
            All file count and storage limits have been lifted for all Free accounts! Enjoy unlimited photo and video restoration with zero cost.
          </p>
          {freePromoTimeLeft && (
            <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-xl bg-white dark:bg-zinc-950 border border-emerald-300/80 dark:border-emerald-500/40 shadow-sm font-mono text-xs md:text-sm">
              <span className="text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-1.5">
                <span>⏳</span> Special Offer Ends in:
              </span>
              <span className="text-zinc-950 dark:text-white font-black tracking-wider bg-emerald-100/70 dark:bg-zinc-900 px-2.5 py-0.5 rounded border border-emerald-200 dark:border-zinc-800">
                {freePromoTimeLeft}
              </span>
            </div>
          )}
          <a
            href="/tool"
            className="mt-1 inline-flex items-center gap-2 px-7 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-zinc-950 font-black text-sm transition-all cursor-pointer shadow-md hover:shadow-emerald-500/25 hover:scale-105 active:scale-95"
          >
            Start Unlimited Free Fix <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      ) : isPromoActiveLocal ? (
        <div className="mb-12 max-w-xl mx-auto bg-gradient-to-r from-indigo-50/80 via-purple-50/80 to-indigo-50/80 dark:from-indigo-500/10 dark:via-purple-500/10 dark:to-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 backdrop-blur-md rounded-2xl p-5 text-center flex flex-col gap-3.5 items-center shadow-sm">
          <span className="text-sm font-bold text-indigo-800 dark:text-indigo-400">
            {bannerText}
          </span>
          {Object.keys(activeCoupons).length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
              <span className="text-zinc-600 dark:text-zinc-400 font-medium">Active Coupons (click to copy):</span>
              {Object.entries(activeCoupons).map(([planKey, code]) => {
                const codeStr = String(code);
                const planLabel = planKey === 'recovery_pass' ? 'Recovery' : planKey === 'pro' ? 'Pro' : 'Super';
                const colorClass = planKey === 'recovery_pass' 
                  ? 'text-zinc-800 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-750' 
                  : planKey === 'pro'
                    ? 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 hover:bg-blue-100 dark:hover:bg-blue-500/25'
                    : 'text-amber-800 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20 hover:bg-amber-100 dark:hover:bg-amber-500/25';
                return (
                  <button
                    key={planKey}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      navigator.clipboard.writeText(codeStr);
                      useToastStore.getState().addToast(`Coupon code ${codeStr} copied!`, "success", 3000, "Copied");
                    }}
                    className={`px-2.5 py-1 rounded-lg font-mono font-bold border ${colorClass} transition-colors cursor-pointer select-none inline-flex items-center gap-1`}
                    title={`Copy ${planLabel} coupon code`}
                  >
                    <span>{planLabel}: {codeStr}</span>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16 items-stretch">
        
        {/* FREE PLAN */}
        <div className={`flex flex-col bg-white dark:bg-zinc-900/50 border ${isFreePromoActive ? 'border-emerald-500/50 dark:border-emerald-500/40 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500/20' : 'border-zinc-200 dark:border-zinc-800'} rounded-2xl p-6 h-full justify-between hover:border-zinc-300 dark:hover:border-zinc-700 shadow-sm transition-all relative overflow-hidden`}>
          {isFreePromoActive && (
            <div className="absolute top-0 right-0 bg-emerald-500 text-black text-[9px] font-black uppercase px-3 py-1 rounded-bl-xl tracking-wider">
              Unlimited Event
            </div>
          )}
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white font-semibold flex items-center gap-2">
                {featuresConfig?.headings?.free || 'Free'}
                {isFreePromoActive && (
                  <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    Unlimited
                  </span>
                )}
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-1">{getFreeSubheading()}</p>
            </div>
            <div className="space-y-6">
              <div>
                {isPricingLoading ? (
                  <div className="h-10 w-24 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse my-1"></div>
                ) : (
                <div className="text-4xl font-bold text-zinc-900 dark:text-white">{symbol}0</div>
                )}
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                  100% Free &amp; Private. Restore dates, GPS and EXIF headers locally in your browser with zero file uploads.
                </p>
              </div>
              <div className="space-y-2.5">
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-widest font-bold mb-1">Includes</div>
                <ul className="space-y-2 text-xs text-zinc-700 dark:text-zinc-300">
                  {(featuresConfig?.free || []).map((feat, idx) => (
                    <li key={idx} className="flex items-center gap-1.5">
                      <span className="text-emerald-500 dark:text-green-400 font-bold">✓</span>
                      <span className={feat.isBold ? 'font-bold text-zinc-900 dark:text-white' : ''}>{renderFormattedText(formatFeatureText(feat.text, 'free'))}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-8">
            <a href="/tool" className="w-full">
              <button className={`w-full py-3 rounded-xl font-bold text-xs cursor-pointer transition-all ${isFreePromoActive ? 'bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold shadow-md' : 'btn-monochrome-primary'}`}>
                {isFreePromoActive ? 'Start Unlimited Free Fix' : 'Start Free Fix'}
              </button>
            </a>
          </div>
        </div>

        {/* RECOVERY PASS */}
        <div className="flex flex-col bg-white dark:bg-zinc-900/50 border border-cyan-500/40 dark:border-cyan-500/30 rounded-2xl p-6 h-full justify-between hover:border-cyan-500/70 shadow-sm transition-all">
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 font-semibold">{featuresConfig?.headings?.recovery_pass || 'Recovery Pass'}</h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-1">{getRecoverySubheading()}</p>
            </div>
            <div className="space-y-6">
              <div>
                {isPricingLoading ? (
                  <div className="h-10 w-36 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse my-1"></div>
                ) : (
                <div className="flex items-baseline flex-wrap gap-2">
                  <span className="text-4xl font-bold text-zinc-900 dark:text-white">{formattedRecoveryCurrent}</span>
                  {(showRecoveryDiscount || activeCoupons['recovery_pass']) && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {showRecoveryDiscount && <span className="text-sm text-zinc-500 line-through font-medium">{formattedRecoveryWas}</span>}
                      {showRecoveryDiscount && <span className="text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded-md">{recoveryDisc}% OFF</span>}
                      {activeCoupons['recovery_pass'] && (
                        <span 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigator.clipboard.writeText(activeCoupons['recovery_pass']);
                            useToastStore.getState().addToast(`Coupon code ${activeCoupons['recovery_pass']} copied!`, "success", 3000, "Copied");
                          }}
                          className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded-md cursor-pointer hover:bg-indigo-500/20 transition-all select-none inline-flex items-center gap-1"
                          title="Click to copy coupon code"
                        >
                          Code: {activeCoupons['recovery_pass']}
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                          </svg>
                        </span>
                      )}
                    </div>
                  )}
                </div>
                )}

                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-2.5 leading-relaxed">Unlimited file restoration for {recoveryPassHours} hours from purchase. Repeatable.</p>
                {priceIncludesTax && (
                  <span className="inline-flex items-center gap-1 mt-1.5 text-[9px] font-bold text-emerald-500 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md">
                    ✓ incl. tax
                  </span>
                )}
              </div>
              <div className="space-y-2.5">
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-widest font-bold mb-1">Everything in Free plus:</div>
                <ul className="space-y-2 text-xs text-zinc-700 dark:text-zinc-300">
                  {(featuresConfig?.recovery_pass || []).map((feat, idx) => (
                    <li key={idx} className={`flex items-center gap-1.5${idx === 0 ? ' recovery-pass-highlight' : ''}`}>
                      <span className="text-cyan-600 dark:text-cyan-400 font-bold">✓</span>
                      <span className={feat.isBold ? 'font-bold text-cyan-600 dark:text-cyan-400' : ''}>{renderFormattedText(formatFeatureText(feat.text, 'recovery_pass'))}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-8">
            {userData?.plan === 'recovery_pass' && (userData as any)?.expiresAt && Date.now() < (userData as any).expiresAt ? (
              <a href={`/checkout?plan=recovery_pass&region=${region}`} className="w-full" target="_blank" rel="noopener noreferrer">
                <button className="btn-recovery-cyan w-full py-3 rounded-xl font-bold text-xs cursor-pointer transition-all">Extend Recovery Pass</button>
              </a>
            ) : (
              <a href={`/checkout?plan=recovery_pass&region=${region}`} className="w-full" target="_blank" rel="noopener noreferrer">
                <button className="btn-recovery-cyan w-full py-3 rounded-xl font-bold text-xs cursor-pointer transition-all">Get Recovery Pass</button>
              </a>
            )}
          </div>
        </div>

        {/* PRO LIFETIME */}
        <div className="flex flex-col bg-white dark:bg-zinc-900/50 border-2 border-blue-500 dark:border-blue-500 rounded-2xl p-6 h-full relative justify-between scale-105 hover:border-blue-600 dark:hover:border-blue-400 transition-all shadow-xl shadow-blue-500/10">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">
            Most Popular
          </div>
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-blue-600 dark:text-blue-400 font-semibold">{featuresConfig?.headings?.pro || 'Pro Lifetime'}</h2>
              <p className="text-blue-600/80 dark:text-blue-300 text-xs mt-1">{getProSubheading()}</p>
            </div>
            <div className="space-y-6">
              <div>
                {isPricingLoading ? (
                  <div className="h-10 w-36 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse my-1"></div>
                ) : (
                <div className="flex items-baseline flex-wrap gap-2">
                  <span className="text-4xl font-bold text-zinc-900 dark:text-white">{formattedProCurrent}</span>
                  {(showProDiscount || activeCoupons['pro']) && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {showProDiscount && <span className="text-sm text-zinc-500 line-through font-medium">{formattedProWas}</span>}
                      {showProDiscount && <span className="text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded-md">{proDisc}% OFF</span>}
                      {activeCoupons['pro'] && (
                        <span 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigator.clipboard.writeText(activeCoupons['pro']);
                            useToastStore.getState().addToast(`Coupon code ${activeCoupons['pro']} copied!`, "success", 3000, "Copied");
                          }}
                          className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded-md cursor-pointer hover:bg-indigo-500/20 transition-all select-none inline-flex items-center gap-1"
                          title="Click to copy coupon code"
                        >
                          Code: {activeCoupons['pro']}
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                          </svg>
                        </span>
                      )}
                    </div>
                  )}
                </div>
                )}

                {( (isPromoActiveLocal && proDisc > 0) || activeCoupons['pro'] ) && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {isPromoActiveLocal && proDisc > 0 && campaigns?.maxPurchaseLimit && (
                      <div className="text-[10px] text-blue-500 dark:text-blue-400 font-bold bg-blue-500/10 border border-blue-500/20 rounded-lg p-1.5 inline-block">
                        🔥 Claims: {campaigns?.currentPurchaseCount ?? 0} / {campaigns?.maxPurchaseLimit} claimed
                      </div>
                    )}
                    {isPromoActiveLocal && proDisc > 0 && timeLeftStr && (
                      <div className="text-[10px] text-blue-500 dark:text-blue-400 font-bold bg-blue-500/10 border border-blue-500/20 rounded-lg p-1.5 inline-block">
                        ⏳ Expires in: {timeLeftStr}
                      </div>
                    )}

                  </div>
                )}

                <p className="text-[11px] text-blue-600 dark:text-blue-300 mt-2.5 leading-relaxed font-medium">Use forever · On up to 2 devices</p>
                {priceIncludesTax && (
                  <span className="inline-flex items-center gap-1 mt-1.5 text-[9px] font-bold text-emerald-500 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md">
                    ✓ incl. tax
                  </span>
                )}
              </div>
              <div className="space-y-2.5">
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-widest font-bold mb-1">Everything in Pass plus:</div>
                <ul className="space-y-2 text-xs text-zinc-700 dark:text-zinc-300">
                  {(featuresConfig?.pro || []).map((feat, idx) => (
                    <li key={idx} className={`flex items-center gap-1.5 font-semibold${idx === 0 ? ' text-blue-600 dark:text-blue-400' : ''}`}>
                      <span className="text-blue-600 dark:text-blue-400 font-bold">✓</span>
                      <span className={feat.isBold ? 'font-bold text-blue-600 dark:text-blue-400' : ''}>{renderFormattedText(formatFeatureText(feat.text, 'pro'))}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-8">
            <a href={`/checkout?plan=pro&region=${region}`} className="w-full" target="_blank" rel="noopener noreferrer">
              <button className="btn-pro-blue w-full py-3 rounded-xl font-bold text-xs cursor-pointer transition-all">Go Pro</button>
            </a>
          </div>
        </div>

        {/* SUPER LIFETIME */}
        <div className="flex flex-col bg-white dark:bg-zinc-900/50 border border-amber-500/40 dark:border-amber-500/30 rounded-2xl p-6 h-full justify-between hover:border-amber-500/70 shadow-sm transition-all">
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-amber-600 dark:text-amber-500 font-semibold">{featuresConfig?.headings?.super || 'Super Lifetime'}</h2>
              <p className="text-amber-600/80 dark:text-amber-300 text-xs mt-1">{getSuperSubheading()}</p>
            </div>
            <div className="space-y-6">
              <div>
                {isPricingLoading ? (
                  <div className="h-10 w-36 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse my-1"></div>
                ) : (
                <div className="flex items-baseline flex-wrap gap-2">
                  <span className="text-4xl font-bold text-zinc-900 dark:text-white">{formattedSuperCurrent}</span>
                  {(showSuperDiscount || activeCoupons['super']) && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {showSuperDiscount && <span className="text-sm text-zinc-500 line-through font-medium">{formattedSuperWas}</span>}
                      {showSuperDiscount && <span className="text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded-md">{superDisc}% OFF</span>}
                      {activeCoupons['super'] && (
                        <span 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigator.clipboard.writeText(activeCoupons['super']);
                            useToastStore.getState().addToast(`Coupon code ${activeCoupons['super']} copied!`, "success", 3000, "Copied");
                          }}
                          className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded-md cursor-pointer hover:bg-indigo-500/20 transition-all select-none inline-flex items-center gap-1"
                          title="Click to copy coupon code"
                        >
                          Code: {activeCoupons['super']}
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                          </svg>
                        </span>
                      )}
                    </div>
                  )}
                </div>
                )}

                {( (isPromoActiveLocal && superDisc > 0) || activeCoupons['super'] ) && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {isPromoActiveLocal && superDisc > 0 && campaigns?.maxPurchaseLimit && (
                      <div className="text-[10px] text-amber-500 dark:text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 rounded-lg p-1.5 inline-block">
                        🔥 Claims: {campaigns?.currentPurchaseCount ?? 0} / {campaigns?.maxPurchaseLimit} claimed
                      </div>
                    )}
                    {isPromoActiveLocal && superDisc > 0 && timeLeftStr && (
                      <div className="text-[10px] text-amber-500 dark:text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 rounded-lg p-1.5 inline-block">
                        ⏳ Expires in: {timeLeftStr}
                      </div>
                    )}

                  </div>
                )}

                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2.5 leading-relaxed font-medium">Use forever · On up to 3 devices</p>
                {priceIncludesTax && (
                  <span className="inline-flex items-center gap-1 mt-1.5 text-[9px] font-bold text-emerald-500 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md">
                    ✓ incl. tax
                  </span>
                )}
              </div>
              <div className="space-y-2.5">
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-widest font-bold mb-1">Everything in Pro plus:</div>
                <ul className="space-y-2 text-xs text-zinc-700 dark:text-zinc-300">
                  {(featuresConfig?.super || []).map((feat, idx) => (
                    <li key={idx} className={`flex items-center gap-1.5 font-semibold${idx === 0 ? ' text-amber-600 dark:text-amber-500' : ''}`}>
                      <span className="text-amber-600 dark:text-amber-500 font-bold">✓</span>
                      <span className={feat.isBold ? 'font-bold text-amber-600 dark:text-amber-500' : ''}>{renderFormattedText(formatFeatureText(feat.text, 'super'))}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-8">
            <a href={`/checkout?plan=super&region=${region}`} className="w-full" target="_blank" rel="noopener noreferrer">
              <button className="btn-super-orange w-full py-3 rounded-xl font-bold text-xs cursor-pointer transition-all">Go Super</button>
            </a>
          </div>
        </div>

      </div>

      {/* ─── GITHUB SPONSORS & FREEMIUM COMMUNITY CARD ─── */}
      <div className="my-14 max-w-4xl mx-auto">
        <div className="rounded-2xl bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-indigo-500/10 border border-pink-500/20 dark:border-pink-500/30 p-8 text-center flex flex-col items-center gap-4 relative overflow-hidden backdrop-blur-md shadow-sm">
          <div className="w-12 h-12 rounded-full bg-pink-500/15 border border-pink-500/30 flex items-center justify-center text-pink-500 text-2xl shadow-sm">
            ❤️
          </div>
          <div className="space-y-2 max-w-2xl">
            <h2 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">
              Free, Private & Community Supported
            </h2>
            <p className="text-xs md:text-sm text-zinc-650 dark:text-zinc-300 leading-relaxed">
              TakeoutFix’s in-browser restoration tool is <strong>100% free and runs entirely on your local device</strong> without sending photos to any server. If this tool rescued your family albums and saved you days of manual work, consider supporting independent development on GitHub Sponsors!
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <a
              href="https://github.com/sponsors/Rahul-Jena-2002"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs transition-all shadow-md hover:scale-105 active:scale-95 cursor-pointer"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16">
                <path d="m8 14.25.345.666a.75.75 0 0 1-.69 0l-.008-.004-.018-.01a7.152 7.152 0 0 1-.31-.17 22.055 22.055 0 0 1-3.434-2.414C2.045 10.731 0 8.35 0 5.5 0 2.836 2.086 1 4.75 1 6.275 1 7.57 1.83 8 3.088 8.43 1.83 9.725 1 11.25 1 13.914 1 16 2.836 16 5.5c0 2.85-2.045 5.231-3.885 6.818a22.066 22.066 0 0 1-3.434 2.414 7.27 7.27 0 0 1-.31.17l-.018.01-.008.004-.002.001Z" />
              </svg>
              <span>Sponsor on GitHub</span>
            </a>
            <a
              href="https://github.com/Rahul-Jena-2002/GooglePhotosTakeout"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 font-semibold text-xs transition-all hover:bg-zinc-800 dark:hover:bg-zinc-100 cursor-pointer shadow-sm"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
              </svg>
              <span>Star Repository</span>
            </a>
          </div>
        </div>
      </div>



      {/* DETAILED COMPARISON TABLE */}
      <div className="mt-32">
        <h2 className="text-3xl font-bold text-center mb-12 text-zinc-900 dark:text-white font-semibold">Compare Plans</h2>
        <div className="overflow-x-auto bg-zinc-50 dark:bg-zinc-950/20 border border-zinc-200 dark:border-zinc-900 rounded-2xl">
          <table className="w-full text-left border-collapse min-w-[800px] text-sm text-zinc-700 dark:text-zinc-300">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-900 bg-zinc-100/40 dark:bg-zinc-950/40">
                <th className="py-4 px-6 font-semibold text-zinc-500 dark:text-zinc-400 w-1/3 sticky left-0 bg-white dark:bg-[#0A0A0A] z-20 shadow-[2px_0_5px_rgba(0,0,0,0.04)] dark:shadow-[2px_0_5px_rgba(0,0,0,0.4)]">Feature</th>
                <th className="py-4 px-6 font-bold text-center text-zinc-900 dark:text-zinc-300">Free</th>
                <th className="py-4 px-6 font-bold text-center text-zinc-900 dark:text-zinc-300">Single Pass</th>
                <th className="py-4 px-6 font-bold text-center text-indigo-600 dark:text-indigo-400">Pro Lifetime</th>
                <th className="py-4 px-6 font-bold text-center text-amber-600 dark:text-amber-500">Super Lifetime</th>
              </tr>
            </thead>
            <tbody>
              {activeComparisonRows.map((row, idx) => {
                const resolved = resolveComparisonRowValues(row, tierThresholds, telemetryAccuracy);
                const freeVal = resolved.free;
                const recoveryVal = resolved.recovery_pass;
                const proVal = resolved.pro;
                const superVal = resolved.super;

                return (
                  <tr key={idx} className="border-b border-zinc-200 dark:border-zinc-900 hover:bg-zinc-100/30 dark:hover:bg-white/[0.01]">
                    <td className="py-4 px-6 font-medium text-zinc-900 dark:text-white sticky left-0 bg-white dark:bg-[#0A0A0A] z-10 shadow-[2px_0_5px_rgba(0,0,0,0.04)] dark:shadow-[2px_0_5px_rgba(0,0,0,0.4)]">
                      {renderFormattedText(row.featureName)}
                    </td>
                    <td className={`py-4 px-6 text-center ${getTableCellStyle(freeVal, 'free')}`}>
                      {renderFormattedText(freeVal)}
                    </td>
                    <td className={`py-4 px-6 text-center ${getTableCellStyle(recoveryVal, 'recovery_pass')}`}>
                      {renderFormattedText(recoveryVal)}
                    </td>
                    <td className={`py-4 px-6 text-center ${getTableCellStyle(proVal, 'pro')}`}>
                      {renderFormattedText(proVal)}
                    </td>
                    <td className={`py-4 px-6 text-center ${getTableCellStyle(superVal, 'super')}`}>
                      {renderFormattedText(superVal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 text-center mt-3 px-4">
          * Recovery accuracy based on standard Google Takeout exports with complete JSON sidecar files. Results may vary with partial or corrupted exports.
        </p>
      </div>

      <div className="mt-20 w-full max-w-5xl mx-auto text-center">
        <h2 className="text-2xl font-bold mb-8 text-zinc-900 dark:text-white font-semibold">Plan Limits & Guarantee Conditions</h2>
        
        <div className="bg-zinc-50 dark:bg-zinc-950/45 border border-zinc-200 dark:border-zinc-900 p-8 sm:p-10 rounded-2xl space-y-8 shadow-sm">
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider mb-3">Enforcement of Limits</h3>
            <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed max-w-3xl mx-auto">
              Limits on <strong>Free</strong> ({tierThresholds?.free?.maxFiles === 0 ? "Unlimited" : `${tierThresholds?.free?.maxFiles.toLocaleString()} files`}/{tierThresholds?.free?.maxSizeMB === 0 ? "Unlimited" : (tierThresholds?.free?.maxSizeMB >= 1024 ? `${(tierThresholds?.free?.maxSizeMB / 1024).toFixed(0)} GB` : `${tierThresholds?.free?.maxSizeMB} MB`)}) and <strong>Recovery Pass</strong> ({tierThresholds?.recovery_pass?.maxFiles === 0 ? "Unlimited" : `${tierThresholds?.recovery_pass?.maxFiles.toLocaleString()} files`}/{tierThresholds?.recovery_pass?.maxSizeMB === 0 ? "Unlimited" : (tierThresholds?.recovery_pass?.maxSizeMB >= 1024 ? `${(tierThresholds?.recovery_pass?.maxSizeMB / 1024).toFixed(0)} GB` : `${tierThresholds?.recovery_pass?.maxSizeMB} MB`)}) are enforced on a <strong>"whichever comes first"</strong> basis. You can access your account seamlessly across your devices.
            </p>
          </div>
          
          <div className="border-t border-zinc-200 dark:border-zinc-900 pt-6">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider mb-3">Photo Matching & Recovery Accuracy*</h3>
            <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed max-w-3xl mx-auto">
              * Recovery accuracy based on standard Google Takeout exports with complete JSON sidecar files. Results may vary with partial or corrupted exports.
            </p>
          </div>

          <div className="border-t border-zinc-200 dark:border-zinc-900 pt-6">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider mb-3">7-Day Refund Policy</h3>
            <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed max-w-3xl mx-auto whitespace-pre-wrap">
              {renderFormattedText(activeRefundPolicy)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PricingPage() {
  return (
    <AuthProvider>
      <PricingPageContent />
    </AuthProvider>
  );
}
