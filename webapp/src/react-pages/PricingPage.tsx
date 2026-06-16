import React from "react";
import { useAuth, AuthProvider, REGION_PRICING_CONFIGS } from "../contexts/AuthContext";
import { ArrowRight, Key, ShieldCheck, RefreshCw } from "lucide-react";
import AdUnit from "../components/AdUnit";

function PricingPageContent() {
  const { prices, finalPrices, isFounding, slotsRemaining, region } = useAuth();
  console.log("PricingPage render:", { prices, finalPrices, isFounding, slotsRemaining, region });

  const config = REGION_PRICING_CONFIGS[region] || REGION_PRICING_CONFIGS.t3;
  const symbol = config.symbol;

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

      {isFounding && (
        <div className="mb-12 max-w-lg mx-auto bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-indigo-500/10 border border-indigo-500/20 backdrop-blur-md rounded-2xl p-4 text-center">
          <span className="text-sm font-semibold text-indigo-400">
            🎉 Founding Member Pricing — {200 - slotsRemaining} / 200 slots taken. Lock in your lifetime price before slots are gone!
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16 items-stretch">
        
        {/* FREE PLAN */}
        <div className="flex flex-col bg-zinc-950/45 border border-zinc-900 rounded-2xl p-6 h-full justify-between hover:border-zinc-800 transition-all">
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white font-semibold">Free</h2>
              <p className="text-zinc-500 text-xs mt-1">Free up to 250 files or 500MB</p>
            </div>
            <div className="space-y-6">
              <div>
                <div className="text-4xl font-bold text-white">{symbol}0</div>
                <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">Test with a small set of photos to see how easy it is.</p>
              </div>
              <div className="space-y-2.5">
                <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold mb-1">Includes</div>
                <ul className="space-y-2 text-xs text-zinc-300">
                  <li className="flex items-center gap-1.5"><span className="text-green-400 font-bold">✓</span> Free up to 250 files or 500MB</li>
                  <li className="flex items-center gap-1.5"><span className="text-green-400 font-bold">✓</span> Restores original dates & times</li>
                  <li className="flex items-center gap-1.5"><span className="text-green-400 font-bold">✓</span> Works directly in your browser</li>
                  <li className="flex items-center gap-1.5"><span className="text-green-400 font-bold">✓</span> Photos stay 100% private</li>
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
              <h2 className="text-2xl font-bold text-white font-semibold">Recovery Pass</h2>
              <p className="text-zinc-500 text-xs mt-1">Single takeout batch up to 3,000 files or 3GB</p>
            </div>
            <div className="space-y-6">
              <div>
                <div className="text-4xl font-bold text-white">{prices.recovery_pass}</div>
                <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">Fix one folder of photos without any subscription details.</p>
              </div>
              <div className="space-y-2.5">
                <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold mb-1">Everything in Free plus:</div>
                <ul className="space-y-2 text-xs text-zinc-350 dark:text-zinc-300">
                  <li className="flex items-center gap-1.5 recovery-pass-highlight"><span className="font-bold">✓</span> Single takeout batch up to 3,000 files or 3GB</li>
                  <li className="flex items-center gap-1.5"><span className="text-zinc-600 dark:text-zinc-400 font-bold">✓</span> Friendly support help desk</li>
                  <li className="flex items-center gap-1.5"><span className="text-zinc-600 dark:text-zinc-400 font-bold">✓</span> Download clean file update logs</li>
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
              <h2 className="text-2xl font-bold text-blue-500 dark:text-blue-400 font-semibold">Pro Lifetime</h2>
              <p className="text-blue-400 dark:text-blue-350 text-xs mt-1">Unlimited photos and videos. 2 devices. Lifetime.</p>
            </div>
            <div className="space-y-6">
              <div className="space-y-1">
                <div className="flex items-baseline flex-wrap gap-2">
                  <span className="text-4xl font-bold text-white">{prices.pro}</span>
                  {isFounding && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-zinc-500 line-through font-medium">{finalPrices.pro}</span>
                      <span className="text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded-md">15% OFF</span>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-blue-500 dark:text-blue-300 mt-1 leading-relaxed">Use forever · On up to 2 devices</p>
              </div>
              <div className="space-y-2.5">
                <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold mb-1">Everything in Pass plus:</div>
                <ul className="space-y-2 text-xs text-zinc-350 dark:text-zinc-300">
                  <li className="flex items-center gap-1.5 font-semibold text-blue-500 dark:text-blue-400"><span className="text-blue-500 dark:text-blue-400 font-bold">✓</span> Unlimited photos & videos</li>
                  <li className="flex items-center gap-1.5 font-semibold"><span className="text-blue-500 dark:text-blue-400 font-bold">✓</span> Keep history of your runs</li>
                  <li className="flex items-center gap-1.5 font-semibold"><span className="text-blue-500 dark:text-blue-400 font-bold">✓</span> Priority support messages</li>
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
              <h2 className="text-2xl font-bold text-amber-500 font-semibold">Super Lifetime</h2>
              <p className="text-amber-300 text-xs mt-1">Unlimited + duplicate finder, before/after logs, ad-free. 3 devices. Lifetime.</p>
            </div>
            <div className="space-y-6">
              <div className="space-y-1">
                <div className="flex items-baseline flex-wrap gap-2">
                  <span className="text-4xl font-bold text-white">{prices.super}</span>
                  {isFounding && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-zinc-500 line-through font-medium">{finalPrices.super}</span>
                      <span className="text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded-md">10% OFF</span>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-amber-400 mt-1 leading-relaxed">Use forever · On up to 3 devices</p>
              </div>
              <div className="space-y-2.5">
                <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold mb-1">Everything in Pro plus:</div>
                <ul className="space-y-2 text-xs text-zinc-300">
                  <li className="flex items-center gap-1.5 font-semibold text-amber-500"><span className="text-amber-500 font-bold">✓</span> Complete ad-free experience</li>
                  <li className="flex items-center gap-1.5 font-semibold"><span className="text-amber-500 font-bold">✓</span> View hidden photo details</li>
                  <li className="flex items-center gap-1.5 font-semibold"><span className="text-amber-500 font-bold">✓</span> Find and clean duplicates</li>
                  <li className="flex items-center gap-1.5 font-semibold"><span className="text-amber-500 font-bold">✓</span> Compare before & after logs</li>
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
