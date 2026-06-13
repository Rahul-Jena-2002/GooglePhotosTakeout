// No react-router-dom imports
import { useAuth } from "../contexts/AuthContext"
import { db } from "../firebase"
import { doc, setDoc, addDoc, collection } from "firebase/firestore"
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
  getPlanPriceValue: (p: string, r: string) => number
): PlanDetails | null => {
  const regionConf = region === 'in'
    ? { currency: "INR", symbol: "₹" }
    : { currency: "USD", symbol: "$" }

  const priceVal = getPlanPriceValue(planKey, region)
  
  const details: Record<string, { name: string; description: string; features: string[] }> = {
    recovery_pass: {
      name: "Recovery Pass",
      description: "One-time metadata recovery for up to 10,005 files (20 GB)",
      features: [
        "20 GB or 10,000 Files limit (whichever comes first)",
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
        "Highest priority live chat support"
      ]
    },
    family: {
      name: "Family License",
      description: "All Super benefits for up to 5 devices in your household",
      features: [
        "5 Devices installation license",
        "Unlimited file and storage processing",
        "Ad-Free restoration & metadata viewer",
        "Highest priority queue support"
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
  const { user, userData, refreshUserData, region, getPlanPriceValue } = useAuth()
  
  if (userData?.suspended) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground mb-2">Account Suspended</h1>
        <p className="text-zinc-550 dark:text-zinc-405 max-w-md mb-8">
          Your account has been suspended for violating our terms of service or due to an administrative hold. If you believe this is a mistake, please contact our support team.
        </p>
        <div className="flex gap-4">
          <a href="/support" className="px-5 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all">
            Contact Support
          </a>
        </div>
      </div>
    )
  }
  
  const planKey = (() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get("plan") || "";
    }
    return "";
  })()
  const regionParam = (() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get("region") || region || "us";
    }
    return region || "us";
  })()

  // Normalize region parameter to one of: in, t1, t2, t3
  const normalizedRegion = (() => {
    const r = regionParam.toLowerCase();
    if (r === 'in') return 'in';
    if (r === 't1') return 't1';
    if (r === 't2') return 't2';
    return 't3'; // Fallback for us/eu/jp etc.
  })()

  const plan = getPlanDetails(planKey, normalizedRegion, getPlanPriceValue)

  const [paymentTab, setPaymentTab] = useState<"card" | "upi">("card")
  const [isProcessing, setIsProcessing] = useState(false)
  const [processStep, setProcessStep] = useState("")
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")
  
  // Card form state
  const [cardNumber, setCardNumber] = useState("")
  const [expiry, setExpiry] = useState("")
  const [cvc, setCvc] = useState("")
  const [nameOnCard, setNameOnCard] = useState("")

  useEffect(() => {
    if (!user && typeof window !== 'undefined') {
      window.location.href = "/pricing"
    }
  }, [user])

  if (!plan) {
    return (
      <div className="max-w-md mx-auto mt-32 p-6 bg-zinc-50 dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-900 rounded-lg text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Invalid Plan Selected</h2>
        <p className="text-zinc-500 mb-6">Please select a valid payment option to continue.</p>
        <a href="/pricing">
          <Button variant="outline" className="w-full">Return to Pricing</Button>
        </a>
      </div>
    )
  }

  const handleSimulatedPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    
    setError("")
    setIsProcessing(true)

    // Simulate payment gateway handshakes
    const steps = [
      "Initializing secure Stripe handshake...",
      "Validating credit card credentials...",
      "Contacting card issuer bank...",
      `Authorizing ${plan.symbol}${plan.priceVal} charge...`,
      "Syncing secure token callback...",
      "Finalizing transaction..."
    ]

    for (let i = 0; i < steps.length; i++) {
      setProcessStep(steps[i])
      await new Promise(r => setTimeout(r, 600))
    }

    try {
      const txId = "ch_" + Math.random().toString(36).substring(2, 12).toUpperCase()
      const timestamp = Date.now()

      // 1. Create Transaction Document
      await setDoc(doc(db, "transactions", txId), {
        txId,
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || "Anonymous User",
        plan: planKey,
        amount: plan.priceVal,
        currency: plan.currency,
        displayAmount: `${plan.symbol}${plan.priceVal}`,
        status: "succeeded",
        timestamp,
        paymentMethod: paymentTab === "card" ? "Card (Simulated Visa)" : "UPI (Simulated)",
        cardLast4: paymentTab === "card" ? "4242" : null,
      })

      // 2. Update User Document plan details & reset usage for this new cycle
      const userRef = doc(db, "users", user.uid)
      const expiresAt = planKey === "recovery_pass" ? timestamp + (24 * 60 * 60 * 1000) : null
      
      await setDoc(userRef, {
        plan: planKey,
        usedBytes: 0,
        usedFiles: 0,
        expiresAt,
        updatedAt: timestamp
      }, { merge: true })

      // 3. Add Log in Admin Activity feed
      await addDoc(collection(db, "admin_activity"), {
        actorUid: user.uid,
        actorName: user.displayName || "User",
        actorRole: "USER",
        action: "PURCHASE",
        target: planKey,
        description: `Purchased ${plan.name} for ${plan.symbol}${plan.priceVal}`,
        timestamp
      })

      // Refresh authentication context state
      await refreshUserData()

      setIsProcessing(false)
      setSuccess(true)

      // Short delay, then navigate back
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.location.href = "/dashboard";
        }
      }, 2000)

    } catch (err: any) {
      console.error(err)
      setError("Stripe API integration error: " + err.message)
      setIsProcessing(false)
    }
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
              <span className="text-zinc-500 text-sm font-semibold">{planKey === "recovery_pass" ? "/ one-time" : "/ lifetime"}</span>
            </div>

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
              <Lock className="w-4 h-4 text-zinc-400" />
              <span>Payments secured by simulated Stripe Billing sandbox network.</span>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: PAYMENT FORM & INJECTION CONTROL */}
        <div className="p-8 flex flex-col justify-center min-h-[500px] bg-background">
          {success ? (
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
                <h3 className="text-lg font-semibold text-foreground">Processing Transaction</h3>
                <p className="text-zinc-500 font-mono text-xs">{processStep}</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSimulatedPayment} className="space-y-6">
              <h2 className="text-xl font-bold tracking-tight text-foreground">Select Payment Method</h2>
              
              {/* Payment tab toggler */}
              <div className="grid grid-cols-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setPaymentTab("card")}
                  className={`flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-colors ${paymentTab === "card" ? "bg-zinc-200 dark:bg-zinc-800 text-foreground shadow-none" : "text-zinc-450 dark:text-zinc-500 hover:text-foreground"}`}
                >
                  <CreditCard className="w-4 h-4" /> Credit Card
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentTab("upi")}
                  className={`flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-colors ${paymentTab === "upi" ? "bg-zinc-200 dark:bg-zinc-800 text-foreground shadow-none" : "text-zinc-450 dark:text-zinc-500 hover:text-foreground"}`}
                >
                  <Sparkles className="w-4 h-4" /> UPI Netbanking
                </button>
              </div>

              {error && (
                <div className="p-3 bg-red-500/5 border border-red-500/20 text-red-500 rounded-md text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {paymentTab === "card" ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-zinc-500 font-medium block mb-1">Card Number</label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="4242 4242 4242 4242"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, "").substring(0, 16))}
                        required
                        className="w-full bg-background border border-zinc-200 dark:border-zinc-800 rounded-lg py-2 px-3 text-sm text-foreground focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600 font-mono tracking-wider"
                      />
                      <CreditCard className="w-4 h-4 text-zinc-450 dark:text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-zinc-500 font-medium block mb-1">Expiration Date</label>
                      <input
                        type="text"
                        placeholder="MM / YY"
                        value={expiry}
                        onChange={(e) => setExpiry(e.target.value.substring(0, 5))}
                        required
                        className="w-full bg-background border border-zinc-200 dark:border-zinc-800 rounded-lg py-2 px-3 text-sm text-foreground focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600 font-mono text-center"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 font-medium block mb-1">CVC / CVV</label>
                      <input
                        type="password"
                        placeholder="•••"
                        value={cvc}
                        onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").substring(0, 3))}
                        required
                        className="w-full bg-background border border-zinc-200 dark:border-zinc-800 rounded-lg py-2 px-3 text-sm text-foreground focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600 font-mono text-center"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-zinc-500 font-medium block mb-1">Name on Card</label>
                    <input
                      type="text"
                      placeholder="e.g. Rahul Jena"
                      value={nameOnCard}
                      onChange={(e) => setNameOnCard(e.target.value)}
                      required
                      className="w-full bg-background border border-zinc-200 dark:border-zinc-800 rounded-lg py-2 px-3 text-sm text-foreground focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-zinc-100/50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-lg">
                    <label className="text-xs text-zinc-500 font-medium block mb-2">Select UPI App Provider</label>
                    <div className="grid grid-cols-2 gap-2 text-center text-xs">
                      <div className="p-2 border border-zinc-200 dark:border-zinc-800 bg-background rounded hover:border-zinc-400 dark:hover:border-zinc-600 cursor-pointer transition-colors text-foreground">Google Pay</div>
                      <div className="p-2 border border-zinc-200 dark:border-zinc-800 bg-background rounded hover:border-zinc-400 dark:hover:border-zinc-600 cursor-pointer transition-colors text-foreground">PhonePe</div>
                      <div className="p-2 border border-zinc-900 dark:border-zinc-100 bg-zinc-200 dark:bg-zinc-800 text-foreground font-semibold rounded">Paytm (Simulated)</div>
                      <div className="p-2 border border-zinc-200 dark:border-zinc-800 bg-background rounded hover:border-zinc-400 dark:hover:border-zinc-600 cursor-pointer transition-colors text-foreground">BHIM / Any UPI ID</div>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 font-medium block mb-1">Enter UPI VPA ID</label>
                    <input
                      type="text"
                      placeholder="rahul@paytm"
                      required
                      className="w-full bg-background border border-zinc-200 dark:border-zinc-800 rounded-lg py-2 px-3 text-sm text-foreground focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="w-full h-12 bg-zinc-950 dark:bg-zinc-50 text-white dark:text-black font-bold hover:bg-zinc-800 dark:hover:bg-zinc-250 transition-colors flex items-center justify-center gap-2 border border-transparent rounded-lg cursor-pointer"
              >
                Pay {plan.symbol}{plan.priceVal} <ChevronRight className="w-4 h-4" />
              </button>
              
              <div className="text-center">
                <a href="/pricing" className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-350">
                  Cancel and return to Pricing
                </a>
              </div>
            </form>
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
