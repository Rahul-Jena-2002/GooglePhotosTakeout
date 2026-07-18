import React, { useState, useEffect } from "react";
import { useAuth, AuthProvider, REGION_PRICING_CONFIGS, formatPrice } from "../contexts/AuthContext";
import { ArrowRight, Key, ShieldCheck, RefreshCw, Sparkles } from "lucide-react";
import AdUnit from "../components/AdUnit";
import { db } from "../firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { useToastStore } from "../store/useToastStore";

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

  // Devices and partial matching rates (e.g. up to 90%) should be flat black/white
  if (lowerVal.includes("device") || lowerVal.includes("90%")) {
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
  const { user, userData, region, campaigns, activeCampaignDiscounts, getPlanPriceValue, pricingTiers, featuresConfig, tierThresholds, recoveryPassHours, refundPolicy, comparisonRows } = useAuth();
  const isPricingLoading = Object.keys(pricingTiers).length === 0;

  const formatThresholdLimit = (maxSizeMB?: number, maxFiles?: number) => {
    const sizeVal = maxSizeMB ?? 0;
    const filesVal = maxFiles ?? 0;
    if (sizeVal === 0 && filesVal === 0) return "Unlimited";
    const sizeStr = sizeVal === 0 ? "Unlimited" : (sizeVal >= 1024 ? `${(sizeVal / 1024).toFixed(0)} GB` : `${sizeVal} MB`);
    const filesStr = filesVal === 0 ? "Unlimited files" : `${filesVal.toLocaleString()} files`;
    return `${sizeStr} (${filesStr})`;
  };

  const [isPromoActiveLocal, setIsPromoActiveLocal] = useState(false);
  const [timeLeftStr, setTimeLeftStr] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [activeCoupons, setActiveCoupons] = useState<Record<string, string>>({});
  const [activeCouponDiscountsLocal, setActiveCouponDiscountsLocal] = useState<Record<string, number>>({});

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
        const hours = Math.floor(totalSecs / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        const secs = totalSecs % 60;
        
        let str = "";
        if (hours > 0) str += `${hours}h `;
        str += `${mins}m ${secs}s`;
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

  const isUpgrading = userData?.plan === 'recovery_pass';

  // Recovery prices
  const recoveryCurrentVal = recoveryPassBase * (1 - recoveryDisc / 100);
  const formattedRecoveryCurrent = formatPrice(symbol, recoveryCurrentVal, currency);
  const formattedRecoveryWas = formatPrice(symbol, recoveryPassBase, currency);
  const showRecoveryDiscount = recoveryDisc > 0;

  // Pro prices
  const proCurrentValOriginal = proBase * (1 - proDisc / 100);
  const proCurrentVal = isUpgrading ? Math.max(0, proCurrentValOriginal - recoveryCurrentVal) : proCurrentValOriginal;
  const formattedProCurrent = formatPrice(symbol, proCurrentVal, currency);
  const formattedProWas = formatPrice(symbol, proBase, currency);
  const showProDiscount = proDisc > 0;

  // Super prices
  const superCurrentValOriginal = superBase * (1 - superDisc / 100);
  const superCurrentVal = isUpgrading ? Math.max(0, superCurrentValOriginal - recoveryCurrentVal) : superCurrentValOriginal;
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
    if (!tierThresholds?.free) return featuresConfig?.subheadings?.free || 'Free up to 250 files or 500MB';
    const { maxFiles, maxSizeMB } = tierThresholds.free;
    return `Free up to ${formatLimitText(maxFiles, maxSizeMB)}`;
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
    return `Up to ${formatLimitText(maxFiles, maxSizeMB)}. 2 devices. Lifetime.`;
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
    if (!tierThresholds?.[planKey]) return text;
    const { maxFiles, maxSizeMB } = tierThresholds[planKey];
    
    if (planKey === 'free' && text.toLowerCase().includes('250 files') && text.toLowerCase().includes('500mb')) {
      return `Free up to ${formatLimitText(maxFiles, maxSizeMB)}`;
    }
    if (planKey === 'recovery_pass') {
      return text
        .replace(/\{hours\}/g, String(recoveryPassHours))
        .replace(/\b24\s*(hours|hour)\b/gi, `${recoveryPassHours} hours`)
        .replace(/\b24-hour\b/gi, `${recoveryPassHours}-hour`);
    }
    return text;
  };

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

      {isPromoActiveLocal && (
        <div className="mb-12 max-w-xl mx-auto bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-indigo-500/10 border border-indigo-500/20 backdrop-blur-md rounded-2xl p-5 text-center flex flex-col gap-3.5 items-center">
          <span className="text-sm font-semibold text-indigo-400">
            {bannerText}
          </span>
          {Object.keys(activeCoupons).length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
              <span className="text-zinc-400 font-medium">Active Coupons (click to copy):</span>
              {Object.entries(activeCoupons).map(([planKey, code]) => {
                const planLabel = planKey === 'recovery_pass' ? 'Recovery' : planKey === 'pro' ? 'Pro' : 'Super';
                const colorClass = planKey === 'recovery_pass' 
                  ? 'text-zinc-300 bg-zinc-800 border-zinc-700 hover:bg-zinc-750' 
                  : planKey === 'pro'
                    ? 'text-blue-400 bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/25'
                    : 'text-amber-400 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/25';
                return (
                  <button
                    key={planKey}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      navigator.clipboard.writeText(code);
                      useToastStore.getState().addToast(`Coupon code ${code} copied!`, "success", 3000, "Copied");
                    }}
                    className={`px-2.5 py-1 rounded-lg font-mono font-bold border ${colorClass} transition-colors cursor-pointer select-none inline-flex items-center gap-1`}
                    title={`Copy ${planLabel} coupon code`}
                  >
                    <span>{planLabel}: {code}</span>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16 items-stretch">
        
        {/* FREE PLAN */}
        <div className="flex flex-col bg-zinc-950/45 border border-zinc-900 rounded-2xl p-6 h-full justify-between hover:border-zinc-800 transition-all">
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white font-semibold">{featuresConfig?.headings?.free || 'Free'}</h2>
              <p className="text-zinc-550 text-xs mt-1">{getFreeSubheading()}</p>
            </div>
            <div className="space-y-6">
              <div>
                {isPricingLoading ? (
                  <div className="h-10 w-24 bg-zinc-900 rounded animate-pulse my-1"></div>
                ) : (
                <div className="text-4xl font-bold text-white">{symbol}0</div>
                )}
                <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">Test with a small set of photos to see how it works.</p>
              </div>
              <div className="space-y-2.5">
                <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold mb-1">Includes</div>
                <ul className="space-y-2 text-xs text-zinc-300">
                  {(featuresConfig?.free || []).map((feat, idx) => (
                    <li key={idx} className="flex items-center gap-1.5">
                      <span className="text-green-400 font-bold">✓</span>
                      <span className={feat.isBold ? 'font-bold text-white' : ''}>{renderFormattedText(formatFeatureText(feat.text, 'free'))}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-8">
            <a href="/tool" className="w-full">
              <button className="btn-monochrome-primary w-full py-3 rounded-xl font-bold text-xs cursor-pointer transition-all">Start Free Fix</button>
            </a>
          </div>
        </div>

        {/* RECOVERY PASS */}
        <div className="flex flex-col bg-zinc-950/45 border border-cyan-500/30 rounded-2xl p-6 h-full justify-between hover:border-cyan-500/50 transition-all">
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-cyan-400 font-semibold">{featuresConfig?.headings?.recovery_pass || 'Recovery Pass'}</h2>
              <p className="text-zinc-500 text-xs mt-1">{getRecoverySubheading()}</p>
            </div>
            <div className="space-y-6">
              <div>
                {isPricingLoading ? (
                  <div className="h-10 w-36 bg-zinc-900 rounded animate-pulse my-1"></div>
                ) : (
                <div className="flex items-baseline flex-wrap gap-2">
                  <span className="text-4xl font-bold text-white">{formattedRecoveryCurrent}</span>
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



                <p className="text-[11px] text-zinc-400 mt-2.5 leading-relaxed">Unlimited file restoration for 24 hours from purchase. Repeatable.</p>
                {priceIncludesTax && (
                  <span className="inline-flex items-center gap-1 mt-1.5 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md">
                    ✓ incl. tax
                  </span>
                )}
              </div>
              <div className="space-y-2.5">
                <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold mb-1">Everything in Free plus:</div>
                <ul className="space-y-2 text-xs text-zinc-300">
                  {(featuresConfig?.recovery_pass || []).map((feat, idx) => (
                    <li key={idx} className={`flex items-center gap-1.5${idx === 0 ? ' recovery-pass-highlight' : ''}`}>
                      <span className="text-cyan-400 font-bold">✓</span>
                      <span className={feat.isBold ? 'font-bold text-cyan-pricing-highlight' : ''}>{renderFormattedText(formatFeatureText(feat.text, 'recovery_pass'))}</span>
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
        <div className="flex flex-col bg-zinc-950/45 border border-blue-500/30 rounded-2xl p-6 h-full relative justify-between scale-105 hover:border-blue-500/50 transition-all shadow-xl shadow-blue-500/5">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white-force text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">
            Most Popular
          </div>
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-blue-500 dark:text-blue-400 font-semibold">{featuresConfig?.headings?.pro || 'Pro Lifetime'}</h2>
              <p className="text-blue-400 dark:text-blue-350 text-xs mt-1">{getProSubheading()}</p>
            </div>
            <div className="space-y-6">
              <div>
                {isPricingLoading ? (
                  <div className="h-10 w-36 bg-zinc-900 rounded animate-pulse my-1"></div>
                ) : (
                <div className="flex items-baseline flex-wrap gap-2">
                  <span className="text-4xl font-bold text-white">{formattedProCurrent}</span>
                  {(showProDiscount || activeCoupons['pro'] || userData?.plan === 'recovery_pass') && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {userData?.plan === 'recovery_pass' && (
                        <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md animate-pulse">
                          Upgrade: Save {formattedRecoveryCurrent}
                        </span>
                      )}
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
                      <div className="text-[10px] text-blue-400 font-bold bg-blue-500/10 border border-blue-500/20 rounded-lg p-1.5 inline-block">
                        🔥 Claims: {campaigns?.currentPurchaseCount ?? 0} / {campaigns?.maxPurchaseLimit} claimed
                      </div>
                    )}
                    {isPromoActiveLocal && proDisc > 0 && timeLeftStr && (
                      <div className="text-[10px] text-blue-400 font-bold bg-blue-500/10 border border-blue-500/20 rounded-lg p-1.5 inline-block">
                        ⏳ Expires in: {timeLeftStr}
                      </div>
                    )}

                  </div>
                )}

                <p className="text-[11px] text-blue-500 dark:text-blue-300 mt-2.5 leading-relaxed">Use forever · On up to 2 devices</p>
                {priceIncludesTax && (
                  <span className="inline-flex items-center gap-1 mt-1.5 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md">
                    ✓ incl. tax
                  </span>
                )}
              </div>
              <div className="space-y-2.5">
                <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold mb-1">Everything in Pass plus:</div>
                <ul className="space-y-2 text-xs text-zinc-350 dark:text-zinc-300">
                  {(featuresConfig?.pro || []).map((feat, idx) => (
                    <li key={idx} className={`flex items-center gap-1.5 font-semibold${idx === 0 ? ' text-blue-500 dark:text-blue-400' : ''}`}>
                      <span className="text-blue-500 dark:text-blue-400 font-bold">✓</span>
                      <span className={feat.isBold ? 'font-bold text-blue-500 dark:text-blue-400' : ''}>{renderFormattedText(formatFeatureText(feat.text, 'pro'))}</span>
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
        <div className="flex flex-col bg-zinc-950/45 border border-amber-500/30 rounded-2xl p-6 h-full justify-between hover:border-amber-500/50 transition-all">
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-amber-500 font-semibold">{featuresConfig?.headings?.super || 'Super Lifetime'}</h2>
              <p className="text-amber-300 text-xs mt-1">{getSuperSubheading()}</p>
            </div>
            <div className="space-y-6">
              <div>
                {isPricingLoading ? (
                  <div className="h-10 w-36 bg-zinc-900 rounded animate-pulse my-1"></div>
                ) : (
                <div className="flex items-baseline flex-wrap gap-2">
                  <span className="text-4xl font-bold text-white">{formattedSuperCurrent}</span>
                  {(showSuperDiscount || activeCoupons['super'] || userData?.plan === 'recovery_pass') && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {userData?.plan === 'recovery_pass' && (
                        <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md animate-pulse">
                          Upgrade: Save {formattedRecoveryCurrent}
                        </span>
                      )}
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
                      <div className="text-[10px] text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 rounded-lg p-1.5 inline-block">
                        🔥 Claims: {campaigns?.currentPurchaseCount ?? 0} / {campaigns?.maxPurchaseLimit} claimed
                      </div>
                    )}
                    {isPromoActiveLocal && superDisc > 0 && timeLeftStr && (
                      <div className="text-[10px] text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 rounded-lg p-1.5 inline-block">
                        ⏳ Expires in: {timeLeftStr}
                      </div>
                    )}

                  </div>
                )}

                <p className="text-[11px] text-amber-400 mt-2.5 leading-relaxed">Use forever · On up to 3 devices</p>
                {priceIncludesTax && (
                  <span className="inline-flex items-center gap-1 mt-1.5 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md">
                    ✓ incl. tax
                  </span>
                )}
              </div>
              <div className="space-y-2.5">
                <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold mb-1">Everything in Pro plus:</div>
                <ul className="space-y-2 text-xs text-zinc-350 dark:text-zinc-300">
                  {(featuresConfig?.super || []).map((feat, idx) => (
                    <li key={idx} className={`flex items-center gap-1.5 font-semibold${idx === 0 ? ' text-amber-500' : ''}`}>
                      <span className="text-amber-500 font-bold">✓</span>
                      <span className={feat.isBold ? 'font-bold text-amber-500' : ''}>{renderFormattedText(formatFeatureText(feat.text, 'super'))}</span>
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

      <div className="w-full max-w-4xl mx-auto px-4 my-12">
        <AdUnit type="horizontal" />
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
              {comparisonRows.map((row, idx) => {
                const isLimitRow = row.isDynamicLimit;
                const freeVal = isLimitRow ? formatThresholdLimit(tierThresholds?.free?.maxSizeMB, tierThresholds?.free?.maxFiles) : row.free;
                const recoveryVal = isLimitRow ? formatThresholdLimit(tierThresholds?.recovery_pass?.maxSizeMB, tierThresholds?.recovery_pass?.maxFiles) : row.recovery_pass;
                const proVal = isLimitRow 
                  ? (tierThresholds?.pro?.maxSizeMB === 0 && tierThresholds?.pro?.maxFiles === 0 ? "Unlimited" : formatThresholdLimit(tierThresholds?.pro?.maxSizeMB, tierThresholds?.pro?.maxFiles))
                  : row.pro;
                const superVal = isLimitRow 
                  ? (tierThresholds?.super?.maxSizeMB === 0 && tierThresholds?.super?.maxFiles === 0 ? "Unlimited" : formatThresholdLimit(tierThresholds?.super?.maxSizeMB, tierThresholds?.super?.maxFiles))
                  : row.super;

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
      </div>

      <div className="mt-20 max-w-2xl mx-auto text-center">
        <h2 className="text-2xl font-bold mb-8 text-zinc-900 dark:text-white font-semibold">Plan Limits & Guarantee Conditions</h2>
        
        <div className="bg-zinc-50 dark:bg-zinc-950/45 border border-zinc-200 dark:border-zinc-900 p-8 rounded-2xl space-y-8">
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider mb-3">Enforcement of Limits</h3>
            <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed max-w-md mx-auto">
              Limits on <strong>Free</strong> ({tierThresholds?.free?.maxFiles === 0 ? "Unlimited" : `${tierThresholds?.free?.maxFiles.toLocaleString()} files`}/{tierThresholds?.free?.maxSizeMB === 0 ? "Unlimited" : (tierThresholds?.free?.maxSizeMB >= 1024 ? `${(tierThresholds?.free?.maxSizeMB / 1024).toFixed(0)} GB` : `${tierThresholds?.free?.maxSizeMB} MB`)}) and <strong>Recovery Pass</strong> ({tierThresholds?.recovery_pass?.maxFiles === 0 ? "Unlimited" : `${tierThresholds?.recovery_pass?.maxFiles.toLocaleString()} files`}/{tierThresholds?.recovery_pass?.maxSizeMB === 0 ? "Unlimited" : (tierThresholds?.recovery_pass?.maxSizeMB >= 1024 ? `${(tierThresholds?.recovery_pass?.maxSizeMB / 1024).toFixed(0)} GB` : `${tierThresholds?.recovery_pass?.maxSizeMB} MB`)}) are enforced on a <strong>"whichever comes first"</strong> basis. Device limits are tied to your browser installation environment. Paid lifetime licenses allow activation on up to 2 or 3 separate devices simultaneously.
            </p>
          </div>
          
          <div className="border-t border-zinc-200 dark:border-zinc-900 pt-6">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider mb-3">7-Day Refund Policy</h3>
            <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed max-w-md mx-auto whitespace-pre-wrap">
              {renderFormattedText(refundPolicy)}
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
