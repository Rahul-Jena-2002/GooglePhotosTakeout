import React, { useState, useEffect } from "react";
import { useAuth, AuthProvider, REGION_PRICING_CONFIGS, formatPrice } from "../contexts/AuthContext";
import { ArrowRight, Key, ShieldCheck, RefreshCw, Sparkles } from "lucide-react";
import AdUnit from "../components/AdUnit";
import { db } from "../firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { useToastStore } from "../store/useToastStore";

function PricingPageContent() {
  const { region, campaigns, activeCampaignDiscounts, getPlanPriceValue, pricingTiers, featuresConfig } = useAuth();

  const [isPromoActiveLocal, setIsPromoActiveLocal] = useState(false);
  const [timeLeftStr, setTimeLeftStr] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [activeCoupons, setActiveCoupons] = useState<Record<string, string>>({});

  useEffect(() => {
    const checkPromoActive = () => {
      if (!campaigns || !campaigns.isEnabled || campaigns.status !== 'ACTIVE') {
        setIsPromoActiveLocal(false);
        return;
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
            }
          });
        }
        
        setActiveCoupons(activeMap);
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
    const disc = activeCampaignDiscounts?.[planKey];
    if (!disc || disc.discountValue <= 0) return 0;
    if (disc.discountType === 'PERCENTAGE') return disc.discountValue;
    return 0;
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

  return (
    <div className="w-full max-w-7xl mx-auto px-6 py-16 font-sans select-none">
      <div className="text-center mb-12 flex flex-col items-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-4 text-white tracking-tight font-semibold">
          Simple Pricing
        </h1>
        <p className="text-lg text-zinc-300 max-w-2xl mx-auto leading-relaxed">
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
              <p className="text-zinc-550 text-xs mt-1">{featuresConfig?.subheadings?.free || 'Free up to 250 files or 500MB'}</p>
            </div>
            <div className="space-y-6">
              <div>
                <div className="text-4xl font-bold text-white">{symbol}0</div>
                <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">Test with a small set of photos to see how it works.</p>
              </div>
              <div className="space-y-2.5">
                <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold mb-1">Includes</div>
                <ul className="space-y-2 text-xs text-zinc-300">
                  {(featuresConfig?.free || []).map((feat, idx) => (
                    <li key={idx} className="flex items-center gap-1.5">
                      <span className="text-green-400 font-bold">✓</span>
                      <span className={feat.isBold ? 'font-bold text-white' : ''}>{feat.text}</span>
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
        <div className="flex flex-col bg-zinc-950/45 border border-zinc-900 rounded-2xl p-6 h-full justify-between hover:border-zinc-800 transition-all">
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white font-semibold">{featuresConfig?.headings?.recovery_pass || 'Recovery Pass'}</h2>
              <p className="text-zinc-550 text-xs mt-1">{featuresConfig?.subheadings?.recovery_pass || 'Single takeout batch up to 3,000 files or 3GB'}</p>
            </div>
            <div className="space-y-6">
              <div>
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



                <p className="text-[11px] text-zinc-400 mt-2.5 leading-relaxed">Fix one folder of photos without any subscription details.</p>
                {priceIncludesTax && (
                  <span className="inline-flex items-center gap-1 mt-1.5 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md">
                    ✓ incl. tax
                  </span>
                )}
              </div>
              <div className="space-y-2.5">
                <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold mb-1">Everything in Free plus:</div>
                <ul className="space-y-2 text-xs text-zinc-350 dark:text-zinc-300">
                  {(featuresConfig?.recovery_pass || []).map((feat, idx) => (
                    <li key={idx} className={`flex items-center gap-1.5${idx === 0 ? ' recovery-pass-highlight' : ''}`}>
                      <span className={idx === 0 ? 'font-bold' : 'text-zinc-600 dark:text-zinc-400 font-bold'}>✓</span>
                      <span className={feat.isBold ? 'font-bold' : ''}>{feat.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-8">
            <a href={`/checkout?plan=recovery_pass&region=${region}`} className="w-full">
              <button className="btn-monochrome-primary w-full py-3 rounded-xl font-bold text-xs cursor-pointer transition-all">Get Recovery Pass</button>
            </a>
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
              <p className="text-blue-400 dark:text-blue-350 text-xs mt-1">{featuresConfig?.subheadings?.pro || 'Unlimited photos and videos. 2 devices. Lifetime.'}</p>
            </div>
            <div className="space-y-6">
              <div>
                <div className="flex items-baseline flex-wrap gap-2">
                  <span className="text-4xl font-bold text-white">{formattedProCurrent}</span>
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
                      <span className={feat.isBold ? 'font-bold text-blue-500 dark:text-blue-400' : ''}>{feat.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-8">
            <a href={`/checkout?plan=pro&region=${region}`} className="w-full">
              <button className="btn-pro-blue w-full py-3 rounded-xl font-bold text-xs cursor-pointer transition-all">Go Pro</button>
            </a>
          </div>
        </div>

        {/* SUPER LIFETIME */}
        <div className="flex flex-col bg-zinc-950/45 border border-amber-500/30 rounded-2xl p-6 h-full justify-between hover:border-amber-500/50 transition-all">
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-amber-500 font-semibold">{featuresConfig?.headings?.super || 'Super Lifetime'}</h2>
              <p className="text-amber-300 text-xs mt-1">{featuresConfig?.subheadings?.super || 'Unlimited + duplicate finder, before/after logs, ad-free. 3 devices. Lifetime.'}</p>
            </div>
            <div className="space-y-6">
              <div>
                <div className="flex items-baseline flex-wrap gap-2">
                  <span className="text-4xl font-bold text-white">{formattedSuperCurrent}</span>
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
                      <span className={feat.isBold ? 'font-bold text-amber-500' : ''}>{feat.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-8">
            <a href={`/checkout?plan=super&region=${region}`} className="w-full">
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
        <h2 className="text-3xl font-bold text-center mb-12 text-white font-semibold">Compare Plans</h2>
        <div className="overflow-x-auto bg-zinc-950/20 border border-zinc-900 rounded-2xl">
          <table className="w-full text-left border-collapse min-w-[800px] text-sm text-zinc-300">
            <thead>
              <tr className="border-b border-zinc-900 bg-zinc-950/40">
                <th className="py-4 px-6 font-semibold text-zinc-400 w-1/3">Feature</th>
                <th className="py-4 px-6 font-bold text-center">Free</th>
                <th className="py-4 px-6 font-bold text-center">Single Pass</th>
                <th className="py-4 px-6 font-bold text-center text-indigo-400">Pro Lifetime</th>
                <th className="py-4 px-6 font-bold text-center text-amber-500">Super Lifetime</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-zinc-900 hover:bg-white/[0.01]">
                <td className="py-4 px-6 font-medium text-white">Device Limit</td>
                <td className="py-4 px-6 text-center text-zinc-300">1 device</td>
                <td className="py-4 px-6 text-center text-zinc-300">1 device</td>
                <td className="py-4 px-6 text-center text-zinc-300 font-bold">2 devices</td>
                <td className="py-4 px-6 text-center text-zinc-300 font-bold">3 devices</td>
              </tr>
              <tr className="border-b border-zinc-900 hover:bg-white/[0.01]">
                <td className="py-4 px-6 font-medium text-white">Processing Limit</td>
                <td className="py-4 px-6 text-center text-zinc-300">500 MB (250 files)</td>
                <td className="py-4 px-6 text-center text-zinc-300">3 GB (3,000 files)</td>
                <td className="py-4 px-6 text-center text-green-400 font-bold">Unlimited</td>
                <td className="py-4 px-6 text-center text-green-400 font-bold">Unlimited</td>
              </tr>
              <tr className="border-b border-zinc-900 hover:bg-white/[0.01]">
                <td className="py-4 px-6 font-medium text-white">Photo Matching</td>
                <td className="py-4 px-6 text-center text-zinc-300">100% Complete</td>
                <td className="py-4 px-6 text-center text-zinc-300">100% Complete</td>
                <td className="py-4 px-6 text-center text-zinc-300">100% Complete</td>
                <td className="py-4 px-6 text-center text-zinc-300">100% Complete</td>
              </tr>
              <tr className="border-b border-zinc-900 hover:bg-white/[0.01]">
                <td className="py-4 px-6 font-medium text-white">Advanced Media Tools</td>
                <td className="py-4 px-6 text-center text-zinc-500">—</td>
                <td className="py-4 px-6 text-center text-zinc-500">—</td>
                <td className="py-4 px-6 text-center text-zinc-500">—</td>
                <td className="py-4 px-6 text-center text-amber-500 font-bold">Included</td>
              </tr>
              <tr className="border-b border-zinc-900 hover:bg-white/[0.01]">
                <td className="py-4 px-6 font-medium text-white">No Ads Window</td>
                <td className="py-4 px-6 text-center text-zinc-500">—</td>
                <td className="py-4 px-6 text-center text-zinc-500">—</td>
                <td className="py-4 px-6 text-center text-zinc-500">—</td>
                <td className="py-4 px-6 text-center text-green-400 font-bold">✓ Enabled</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-20 max-w-2xl mx-auto text-center">
        <h2 className="text-2xl font-bold mb-8 text-white font-semibold">Plan Limits & Guarantee Conditions</h2>
        
        <div className="bg-zinc-950/45 border border-zinc-900 p-8 rounded-2xl space-y-8">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3">Enforcement of Limits</h3>
            <p className="text-xs text-zinc-300 leading-relaxed max-w-md mx-auto">
              Limits on <strong>Free</strong> (250 files/500 MB) and <strong>Recovery Pass</strong> (3,000 files/3 GB) are enforced on a <strong>"whichever comes first"</strong> basis. Device limits are tied to your browser installation environment. Paid lifetime licenses allow activation on up to 2 or 3 separate devices simultaneously.
            </p>
          </div>
          
          <div className="border-t border-zinc-900 pt-6">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3">7-Day Refund Policy</h3>
            <p className="text-xs text-zinc-300 leading-relaxed max-w-md mx-auto">
              We offer a 100% Recovery Guarantee: if a verified technical issue prevents your restoration, and our support desk is unable to resolve it, we will issue a full refund within 7 days of purchase. Refunds are not available for change of mind or successfully completed recoveries.
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
