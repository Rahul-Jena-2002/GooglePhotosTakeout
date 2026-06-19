import { useAuth } from "../contexts/AuthContext"
import { db } from "../firebase"
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore"
import { useToastStore } from "../store/useToastStore"

import { Button } from "../components/ui/button"
import { Card } from "../components/ui/card"
import { ShieldCheck, Lock, CreditCard, ChevronRight, AlertCircle, Sparkles, CheckCircle2 } from "lucide-react"
import BrandLogo from "../components/BrandLogo"
import { useState, useEffect } from "react"

interface PlanDetails {
  name: string;
  priceVal: number;
  currency: string;
  symbol: string;
  description: string;
  features: string[];
}

const getPlanDetails = (
  planKey: string, 
  region: string, 
  firestoreConfig: any,
  getPlanPriceValue: (p: string, r: string) => number
): PlanDetails | null => {
  const r = region.toLowerCase();
  let currency = "USD";
  let symbol = "$";
  
  if (r === 'in') {
    currency = "INR";
    symbol = "₹";
  } else if (r === 'eu') {
    currency = "EUR";
    symbol = "€";
  } else if (r === 'jp') {
    currency = "JPY";
    symbol = "¥";
  } else if (r === 'cn') {
    currency = "CNY";
    symbol = "¥";
  }

  if (firestoreConfig) {
    if (firestoreConfig.currency_code) currency = firestoreConfig.currency_code;
    if (firestoreConfig.currency_symbol) symbol = firestoreConfig.currency_symbol;
  }

  const regionConf = { currency, symbol };

  let priceVal = getPlanPriceValue(planKey, region);
  
  const details: Record<string, { name: string; description: string; features: string[] }> = {
    recovery_pass: {
      name: "Recovery Pass",
      description: "One-time metadata recovery for up to 3,000 files (3 GB)",
      features: [
        "3 GB or 3,000 Files limit (whichever comes first)",
        "Full folder organization structure",
        "Standard support access (24-48 business hours)",
        "Uses identical high-precision EXIF injection engine"
      ]
    },
    pro: {
      name: "Pro Lifetime",
      description: "Unlimited lifetime processing with priority support and history log",
      features: [
        "Unlimited file and storage processing",
        "Complete recovery history logs",
        "Priority customer queue support",
        "Lifetime access, free future updates"
      ]
    },
    super: {
      name: "Super Lifetime",
      description: "All Pro benefits plus metadata visual inspector and duplicate detection",
      features: [
        "Ad-Free restoration experience",
        "Visual metadata viewer & inspector",
        "Local duplicate-image space scanner",
        "Highest priority dedicated support"
      ]
    }
  }

  const base = details[planKey]
  if (!base || priceVal === undefined) return null
  return {
    ...base,
    priceVal,
    currency: regionConf.currency,
    symbol: regionConf.symbol,
  }
}

import { AuthProvider } from "../contexts/AuthContext"
import { ToastContainer } from "../components/ui/toast"

function CheckoutPageContent() {
  const { user, userData, loading, region, getPlanPriceValue, dodoProductIds, dodoTestMode, login, selectedCountry, campaigns, pricingTiers } = useAuth()
  
  const planKey = (() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get("plan") || "";
    }
    return "";
  })()
  const regionParam = (() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get("region") || region || "in";
    }
    return region || "in";
  })()

  // Normalize region parameter to one of: in, t1, t2, t3, eu, jp, cn, t4
  const normalizedRegion = (() => {
    const r = regionParam.toLowerCase();
    const valid = ['in', 't1', 't2', 't3', 'eu', 'jp', 'cn', 't4'];
    if (valid.includes(r)) return r;
    if (r === 'us') return 't3';
    return 'in'; // Fallback for other regions to 'in' (India)
  })()

  const [detectedCoupon, setDetectedCoupon] = useState("")
  const [couponLookupDone, setCouponLookupDone] = useState(false)

  useEffect(() => {
    const lookupCoupon = async () => {
      if (!user) {
        setCouponLookupDone(true);
        return;
      }

      // If user has recovery_pass and is upgrading to pro or super, get dynamic upgrade discount from backend
      if (userData?.plan === 'recovery_pass' && (planKey === 'pro' || planKey === 'super')) {
        try {
          const idToken = await user.getIdToken();
          const cfBase = cloudFunctionUrl || "https://us-central1-gt-metadata-merger.cloudfunctions.net/geminiToolGateway";
          let cfUrl = `${cfBase}/create-dodo-upgrade-discount`;
          if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
            cfUrl = 'http://localhost:3001/create-dodo-upgrade-discount';
          }
          
          const response = await fetch(cfUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${idToken}`
            },
            body: JSON.stringify({
              targetPlan: planKey,
              region: normalizedRegion
            })
          });
          
          const data = await response.json();
          if (response.ok && data.couponCode) {
            setDetectedCoupon(data.couponCode);
          } else {
            console.warn("Failed to generate dynamic upgrade coupon:", data.error || "Unknown error");
          }
        } catch (err) {
          console.error("Failed to generate upgrade coupon:", err);
        } finally {
          setCouponLookupDone(true);
        }
        return;
      }

      try {
        const couponsSnap = await getDocs(
          query(collection(db, "coupons"), where("active", "==", true))
        );
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

          const logsSnap = await getDocs(
            query(collection(db, "purchase_logs"), where("userId", "==", user.uid))
          );
          const alreadyUsed = logsSnap.docs.some(logDoc => {
            const logData = logDoc.data();
            return logData.couponId === couponDoc.id || logData.couponCode === couponData.couponCode;
          });
          if (alreadyUsed) continue;

          const targetsSnap = await getDocs(collection(db, "coupons", couponDoc.id, "targets"));
          const matchesTarget = targetsSnap.docs.some(t => {
            const td = t.data();
            return td.regionCode === normalizedRegion && td.planCode === planKey;
          });
          if (matchesTarget) {
            setDetectedCoupon(couponData.couponCode);
            break;
          }
        }
      } catch (err) {
        console.warn("Coupon lookup failed:", err);
      } finally {
        setCouponLookupDone(true);
      }
    };
    lookupCoupon();
  }, [user, userData, normalizedRegion, planKey, cloudFunctionUrl]);
  
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="w-10 h-10 border-2 border-zinc-200 dark:border-zinc-800 border-t-zinc-900 dark:border-t-zinc-100 rounded-full animate-spin"></div>
        <p className="text-zinc-550 dark:text-zinc-400 text-sm mt-4">Loading checkout session...</p>
      </div>
    )
  }
  
  if (userData?.suspended) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground mb-2">Account Suspended</h1>
        <p className="text-zinc-555 dark:text-zinc-405 max-w-md mb-8">
          Your account has been suspended for violating our terms of service or due to an administrative hold. If you believe this is a mistake, please contact our support team at{" "}
          <a href="mailto:takeoutfix.support@gmail.com" className="text-indigo-400 hover:text-indigo-300 font-semibold underline">
            takeoutfix.support@gmail.com
          </a>.
        </p>
        <div className="flex gap-4">
          <a href="/support" className="px-5 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all">
            Contact Support
          </a>
        </div>
      </div>
    )
  }
  
  // planKey, regionParam, and normalizedRegion are declared at the top of CheckoutPageContent

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
  const docId = REGION_DOC_IDS[normalizedRegion] || REGION_DOC_IDS.t3;
  const firestoreConfig = pricingTiers?.[docId];

  const plan = getPlanDetails(planKey, normalizedRegion, firestoreConfig, getPlanPriceValue)

  const [isProcessing, setIsProcessing] = useState(false)
  const [processStep, setProcessStep] = useState("")
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")

  // Remove automatic redirect to pricing for unauthenticated users, we will show a sign-in block instead
  useEffect(() => {
    // No redirect logic here
  }, [user, loading])

  const [activeGateway, setActiveGateway] = useState<string>("dodo")
  const [gatewayProductIds, setGatewayProductIds] = useState<Record<string, Record<string, string>>>({})
  const [cloudFunctionUrl, setCloudFunctionUrl] = useState("")

  useEffect(() => {
    const fetchGatewayConfig = async () => {
      try {
        const snap = await getDoc(doc(db, "settings", "global"))
        if (snap.exists()) {
          const data = snap.data()
          const gateway = data.active_gateway || "dodo"
          setActiveGateway(gateway)
          const mapName = `${gateway}_products`
          if (data[mapName]) {
            setGatewayProductIds(data[mapName])
          }
        }
        const sysSnap = await getDoc(doc(db, "settings", "system"))
        if (sysSnap.exists()) {
          setCloudFunctionUrl(sysSnap.data().cloud_function_url || "")
        }
      } catch (err) {
        console.error("Failed to load active gateway config:", err)
      }
    }
    fetchGatewayConfig()
  }, [])

  const handleUniversalRedirect = async () => {
    if (!user) return
    setError("")
    setIsProcessing(true)

    const productId = gatewayProductIds[normalizedRegion]?.[planKey] || ""
    if (!productId) {
      setError(`No product configured for region ${normalizedRegion} and plan ${planKey}.`)
      setIsProcessing(false)
      return
    }

    const returnUrl = `${window.location.origin}/dashboard?checkout_status=success&plan=${planKey}`
    const cancelUrl = `${window.location.origin}/pricing`

    // --- GATEWAY ROUTING ---
    if (activeGateway === "stripe") {
      setProcessStep("Redirecting to Stripe secure checkout...")
      // If it is a full stripe payment link, redirect directly
      if (productId.startsWith("https://") || productId.includes("buy.stripe.com")) {
        const urlObj = new URL(productId)
        urlObj.searchParams.set("client_reference_id", user.uid)
        urlObj.searchParams.set("prefilled_email", user.email || "")
        window.location.replace(urlObj.toString())
      } else {
        // Otherwise, it's a Stripe price ID. Create checkout session via backend
        try {
          const cfBase = cloudFunctionUrl || "https://us-central1-gt-metadata-merger.cloudfunctions.net/geminiToolGateway"
          let cfUrl = `${cfBase}/create-stripe-session`
          if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
            cfUrl = 'http://localhost:3001/create-stripe-session'
          }
          const response = await fetch(cfUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              priceId: productId,
              userId: user.uid,
              email: user.email || "",
              returnUrl,
              cancelUrl
            })
          })
          const data = await response.json()
          if (response.ok && data.url) {
            window.location.replace(data.url)
          } else {
            throw new Error(data.error || "Failed to generate Stripe checkout session.")
          }
        } catch (err: any) {
          setError(err.message || "Stripe initialization failed.")
          setIsProcessing(false)
        }
      }
    } else if (activeGateway === "lemonsqueezy") {
      setProcessStep("Redirecting to Lemon Squeezy secure checkout...")
      if (productId.startsWith("https://")) {
        const urlObj = new URL(productId)
        urlObj.searchParams.set("checkout[email]", user.email || "")
        urlObj.searchParams.set("checkout[custom][userId]", user.uid)
        window.location.replace(urlObj.toString())
      } else {
        const checkoutUrl = `https://takeoutfix.lemonsqueezy.com/checkout/buy/${productId}?checkout[email]=${encodeURIComponent(user.email || "")}&checkout[custom][userId]=${user.uid}`
        window.location.replace(checkoutUrl)
      }
    } else if (activeGateway === "paddle") {
      setProcessStep("Redirecting to Paddle secure checkout...")
      if (productId.startsWith("https://")) {
        const urlObj = new URL(productId)
        urlObj.searchParams.set("user_email", user.email || "")
        urlObj.searchParams.set("passthrough", user.uid)
        window.location.replace(urlObj.toString())
      } else {
        const checkoutUrl = `https://checkout.paddle.com/checkout/buy/${productId}?user_email=${encodeURIComponent(user.email || "")}&passthrough=${user.uid}`
        window.location.replace(checkoutUrl)
      }
    } else {
      // Default: Dodo Payments
      setProcessStep("Redirecting to Dodo Payments secure checkout...")
      const dodoBaseUrl = dodoTestMode
        ? "https://test.checkout.dodopayments.com/buy"
        : "https://checkout.dodopayments.com/buy"

      const params = new URLSearchParams({
        email: user.email || "",
        customer_email: user.email || "",
        redirect_url: returnUrl,
        cancel_url: cancelUrl,
        metadata_userId: user.uid,
        metadata_plan: planKey,
        metadata_region: normalizedRegion,
      })

      if (selectedCountry) {
        params.set("country", selectedCountry)
      }

      if (user.displayName) {
        const nameParts = user.displayName.trim().split(/\s+/)
        if (nameParts.length > 0) {
          params.set("firstName", nameParts[0])
          if (nameParts.length > 1) {
            params.set("lastName", nameParts.slice(1).join(" "))
          }
        }
      }

      if (plan?.currency) {
        const isUnsupported = plan.currency.toUpperCase() === "JPY" || plan.currency.toUpperCase() === "CNY";
        params.set("currency", isUnsupported ? "USD" : plan.currency);
      }

      if (detectedCoupon) {
        params.set("discount_code", detectedCoupon);
      }

      window.location.replace(`${dodoBaseUrl}/${productId}?${params.toString()}`)
    }
  }

  // Automatic redirect trigger: when user, plan and coupon lookup are ready, immediately redirect
  useEffect(() => {
    if (user && plan && Object.keys(gatewayProductIds).length > 0) {
      if (!couponLookupDone) {
        setIsProcessing(true)
        setProcessStep("Checking for eligible promotions and coupons...")
        return
      }
      setIsProcessing(true)
      setProcessStep("Opening secure checkout portal...")
      const timer = setTimeout(() => {
        handleUniversalRedirect()
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [user, plan, gatewayProductIds, couponLookupDone, detectedCoupon, activeGateway])

  if (!plan) {
    return (
      <div className="max-w-md mx-auto mt-32 p-6 bg-zinc-50 dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-900 rounded-lg text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Invalid Plan Selected</h2>
        <p className="text-zinc-550 mb-6">Please select a valid payment option to continue.</p>
        <a href="/pricing">
          <Button variant="outline" className="w-full">Return to Pricing</Button>
        </a>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4 py-20 relative z-10 font-sans">
      <Card className="w-full max-w-5xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 overflow-hidden rounded-lg grid md:grid-cols-2 shadow-none">
        
        {/* LEFT PANEL: PRODUCT DETAILS & INVOICE */}
        <div className="p-8 border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800 flex flex-col justify-between bg-zinc-100/10 dark:bg-zinc-900/10">
          <div>
            <div className="flex items-center gap-2 mb-8">
              <BrandLogo className="w-6 h-6 shadow-none" />
              <span className="font-bold tracking-tight text-foreground">TakeoutFix Core Checkout</span>
            </div>

            <div className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-1">Subscribe to</div>
            <h1 className="text-3xl font-black text-foreground mb-2">{plan.name}</h1>
            <p className="text-zinc-550 dark:text-zinc-400 text-sm mb-6">{plan.description}</p>

            <div className="flex items-baseline gap-1.5 mb-8">
              <span className="text-5xl font-black text-foreground">{plan.symbol}{plan.priceVal}</span>
              <span className="text-zinc-550 text-sm font-semibold">{planKey === "recovery_pass" ? "/ one-time" : "/ lifetime"}</span>
            </div>

            {detectedCoupon && (
              <div className="mb-8 p-3.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Active Promotion Coupon</span>
                  <span className="text-sm font-extrabold text-foreground font-mono">{detectedCoupon}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(detectedCoupon);
                    useToastStore.getState().addToast("Coupon code copied to clipboard!", "success", 3000, "Copied");
                  }}
                  className="px-3 py-1.5 text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer"
                >
                  Copy Code
                </button>
              </div>
            )}

            <div className="space-y-4">
              {plan.features.map((feat, i) => (
                <div key={i} className="flex items-start gap-3 text-sm text-zinc-650 dark:text-zinc-350">
                  <CheckCircle2 className="w-4 h-4 text-zinc-900 dark:text-zinc-100 mt-0.5 flex-shrink-0" />
                  <span>{feat}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-8 border-t border-zinc-200 dark:border-zinc-800 mt-8 space-y-4 text-xs text-zinc-450 dark:text-zinc-500">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>100% Privacy Guaranteed. Files remain local during execution.</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-zinc-450" />
              <span>Payments secured by Merchant of Record (Dodo Payments).</span>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: PAYMENT REDIRECTION CONTROL */}
        <div className="p-8 flex flex-col justify-center min-h-[500px] bg-background">
          {!user ? (
            <div className="text-center py-8 space-y-6">
              <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-900 rounded-full flex items-center justify-center mx-auto text-zinc-505">
                <Lock className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold tracking-tight text-foreground animate-pulse">Sign In to Continue</h2>
                <p className="text-zinc-500 dark:text-zinc-400 text-xs leading-relaxed max-w-xs mx-auto">
                  Please sign in to purchase your plan. Your license and recovery history will be linked to your Google Account.
                </p>
              </div>

              {error && (
                <div className="p-3 bg-red-500/5 border border-red-500/20 text-red-500 rounded-md text-xs flex items-center gap-2 max-w-xs mx-auto text-left">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={async () => {
                  try {
                    setError("")
                    await login()
                  } catch (err: any) {
                    console.error("Login failed on checkout:", err)
                    setError(err?.message || "Login failed. Please try again.")
                  }
                }}
                className="w-full max-w-xs mx-auto h-12 bg-zinc-950 dark:bg-zinc-50 text-white dark:text-black font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 border border-transparent rounded-lg cursor-pointer text-sm"
              >
                Sign In with Google <ChevronRight className="w-4 h-4" />
              </button>
              
              <div>
                <a href="/pricing" className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-350">
                  Cancel and return to Pricing
                </a>
              </div>
            </div>
          ) : success ? (
            <div className="text-center py-12 space-y-4">
              <div className="w-16 h-16 bg-green-500/10 border border-green-500/20 text-green-500 flex items-center justify-center rounded-full mx-auto animate-bounce">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">Payment Successful!</h2>
              <p className="text-zinc-500 text-sm">Your plan is upgraded to <span className="font-semibold text-foreground">{plan.name}</span>.</p>
              <p className="text-zinc-400 text-xs animate-pulse">Redirecting to account dashboard...</p>
            </div>
          ) : isProcessing ? (
            <div className="text-center py-12 space-y-6">
              <div className="w-12 h-12 border-2 border-zinc-200 dark:border-zinc-800 border-t-zinc-900 dark:border-t-zinc-100 rounded-full animate-spin mx-auto"></div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-foreground">Redirecting to Payment Gate</h3>
                <p className="text-zinc-550 font-mono text-xs">{processStep}</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 space-y-6">
              <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-900 rounded-full flex items-center justify-center mx-auto text-zinc-500">
                <Lock className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold tracking-tight text-foreground">Secure Checkout via Dodo Payments</h2>
                <p className="text-zinc-500 text-xs leading-relaxed max-w-xs mx-auto">
                  Click the button below to open the secure Dodo Payments page to complete the purchase of <span className="font-bold text-foreground">{plan.name}</span>.
                </p>
              </div>

              {error && (
                <div className="p-3 bg-red-500/5 border border-red-500/20 text-red-500 rounded-md text-xs flex items-center gap-2 max-w-xs mx-auto text-left">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={handleUniversalRedirect}
                className="w-full max-w-xs mx-auto h-12 bg-zinc-950 dark:bg-zinc-50 text-white dark:text-black font-bold hover:bg-zinc-800 dark:hover:bg-zinc-250 transition-colors flex items-center justify-center gap-2 border border-transparent rounded-lg cursor-pointer text-sm"
              >
                Proceed to Checkout <ChevronRight className="w-4 h-4" />
              </button>


              
              <div>
                <a href="/pricing" className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-350">
                  Cancel and return to Pricing
                </a>
              </div>
            </div>
          )}
        </div>

      </Card>
    </div>
  )
}

export default function CheckoutPage() {
  return (
    <AuthProvider>
      <CheckoutPageContent />
      <ToastContainer />
    </AuthProvider>
  )
}
