import React from "react";
import { Link } from "react-router-dom";
import { useAuth, PLAN_PRICES } from "../contexts/AuthContext";
import { ArrowRight, Key, ShieldCheck, RefreshCw } from "lucide-react";
import AdUnit from "../components/AdUnit";

export default function PricingPage() {
  const { region, userData } = useAuth();
  const prices = PLAN_PRICES[region] || PLAN_PRICES.us;

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16 items-stretch">
        
        {/* FREE PLAN */}
        <div className="flex flex-col bg-zinc-950/45 border border-zinc-900 rounded-2xl p-6 h-full justify-between hover:border-zinc-800 transition-all">
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white font-semibold">Free</h2>
              <p className="text-zinc-500 text-xs mt-1">Try before you buy</p>
            </div>
            <div className="space-y-6">
              <div>
                <div className="text-4xl font-bold text-white">$0</div>
                <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">Test with a small set of photos to see how easy it is.</p>
              </div>
              <div className="space-y-2.5">
                <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold mb-1">Includes</div>
                <ul className="space-y-2 text-xs text-zinc-300">
                  <li className="flex items-center gap-1.5"><span className="text-green-400 font-bold">✓</span> Up to 1,000 photos (1 GB max)</li>
                  <li className="flex items-center gap-1.5"><span className="text-green-400 font-bold">✓</span> Restores original dates & times</li>
                  <li className="flex items-center gap-1.5"><span className="text-green-400 font-bold">✓</span> Works directly in your browser</li>
                  <li className="flex items-center gap-1.5"><span className="text-green-400 font-bold">✓</span> Photos stay 100% private</li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-8">
            <Link to="/tool" className="w-full">
              <button className="w-full py-3 bg-zinc-900 border border-zinc-800 rounded-xl font-bold text-xs text-white cursor-pointer hover:bg-zinc-850">Start Free Fix</button>
            </Link>
          </div>
        </div>

        {/* RECOVERY PASS */}
        <div className="flex flex-col bg-zinc-950/45 border border-zinc-900 rounded-2xl p-6 h-full justify-between hover:border-zinc-800 transition-all">
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white font-semibold">Recovery Pass</h2>
              <p className="text-zinc-500 text-xs mt-1">Best for a single takeout download</p>
            </div>
            <div className="space-y-6">
              <div>
                <div className="text-4xl font-bold text-white">{prices.recovery_pass}</div>
                <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">Fix one large folder of photos without any subscription details.</p>
              </div>
              <div className="space-y-2.5">
                <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold mb-1">Everything in Free plus:</div>
                <ul className="space-y-2 text-xs text-zinc-300">
                  <li className="flex items-center gap-1.5 font-semibold text-indigo-400"><span className="text-indigo-400 font-bold">✓</span> Up to 10,000 photos (20 GB max)</li>
                  <li className="flex items-center gap-1.5"><span className="text-indigo-400 font-bold">✓</span> Friendly support help desk</li>
                  <li className="flex items-center gap-1.5"><span className="text-indigo-400 font-bold">✓</span> Download clean file update logs</li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-8">
            <Link to={`/checkout?plan=recovery_pass&region=${region}`} className="w-full">
              <button className="w-full py-3 bg-zinc-900 border border-zinc-800 rounded-xl font-bold text-xs text-white cursor-pointer hover:bg-zinc-850">Get Recovery Pass</button>
            </Link>
          </div>
        </div>

        {/* PRO LIFETIME */}
        <div className="flex flex-col bg-zinc-950/60 border border-indigo-500/50 rounded-2xl p-6 h-full relative justify-between scale-105 shadow-xl shadow-indigo-550/5 hover:border-indigo-400 transition-all">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
            Most Popular
          </div>
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-indigo-400 font-semibold">Pro Lifetime</h2>
              <p className="text-indigo-300 text-xs mt-1">For large photo collections</p>
            </div>
            <div className="space-y-6">
              <div>
                <div className="text-4xl font-bold text-white">{prices.pro}</div>
                <p className="text-[11px] text-indigo-300 mt-1 leading-relaxed">Use forever · On up to 2 devices</p>
              </div>
              <div className="space-y-2.5">
                <div className="text-[10px] text-indigo-300 uppercase tracking-widest font-bold mb-1">Everything in Pass plus:</div>
                <ul className="space-y-2 text-xs text-zinc-300">
                  <li className="flex items-center gap-1.5 font-semibold"><span className="text-indigo-400 font-bold">✓</span> Unlimited photos & videos</li>
                  <li className="flex items-center gap-1.5"><span className="text-indigo-400 font-bold">✓</span> Keep history of your runs</li>
                  <li className="flex items-center gap-1.5"><span className="text-indigo-400 font-bold">✓</span> Priority support messages</li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-8">
            <Link to={`/checkout?plan=pro&region=${region}`} className="w-full">
              <button className="w-full py-3 bg-white hover:bg-white/90 border border-zinc-200 rounded-xl font-bold text-xs text-black cursor-pointer shadow-lg shadow-indigo-550/20 transition-all">Go Pro</button>
            </Link>
          </div>
        </div>

        {/* SUPER LIFETIME */}
        <div className="flex flex-col bg-zinc-950/45 border border-amber-500/30 rounded-2xl p-6 h-full justify-between hover:border-amber-500/50 transition-all">
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-amber-500 font-semibold">Super Lifetime</h2>
              <p className="text-amber-300 text-xs mt-1">Advanced tools for photographers</p>
            </div>
            <div className="space-y-6">
              <div>
                <div className="text-4xl font-bold text-white">{prices.super}</div>
                <p className="text-[11px] text-amber-400 mt-1 leading-relaxed">Use forever · On up to 3 devices</p>
              </div>
              <div className="space-y-2.5">
                <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold mb-1">Everything in Pro plus:</div>
                <ul className="space-y-2 text-xs text-zinc-300">
                  <li className="flex items-center gap-1.5 font-semibold text-amber-500"><span className="text-amber-500 font-bold">✓</span> Complete ad-free experience</li>
                  <li className="flex items-center gap-1.5 font-semibold"><span className="text-amber-550 font-bold">✓</span> View hidden photo details</li>
                  <li className="flex items-center gap-1.5 font-semibold"><span className="text-amber-550 font-bold">✓</span> Find and clean duplicates</li>
                  <li className="flex items-center gap-1.5 font-semibold"><span className="text-amber-550 font-bold">✓</span> Compare before & after logs</li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-8">
            <Link to={`/checkout?plan=super&region=${region}`} className="w-full">
              <button className="w-full py-3 bg-zinc-900 border border-zinc-800 rounded-xl font-bold text-xs text-white cursor-pointer hover:bg-zinc-850">Go Super</button>
            </Link>
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
                <td className="py-4 px-6 text-center text-zinc-300">1 GB (1,000 files)</td>
                <td className="py-4 px-6 text-center text-zinc-300">20 GB (10,000 files)</td>
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

      <div className="mt-20 max-w-4xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left mb-12">
          <div className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl">
            <div className="text-indigo-400 font-bold text-sm mb-1">✓ One-Time Purchase</div>
            <p className="text-xs text-white/60 leading-relaxed">No subscriptions, no hidden fees, and no recurring charges. You own your license forever.</p>
          </div>
          <div className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl">
            <div className="text-indigo-400 font-bold text-sm mb-1">✓ Privacy First</div>
            <p className="text-xs text-white/60 leading-relaxed">All media processing runs locally inside your browser. Your files never leave your device.</p>
          </div>
          <div className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl">
            <div className="text-indigo-400 font-bold text-sm mb-1">✓ Recovery Guarantee</div>
            <p className="text-xs text-white/60 leading-relaxed">If TakeoutFix cannot process your takeout due to a verified software issue, we will work to resolve it or refund you.</p>
          </div>
          <div className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl">
            <div className="text-indigo-400 font-bold text-sm mb-1">✓ Same Engine Quality</div>
            <p className="text-xs text-white/60 leading-relaxed">Recovery quality never varies. All plans use the identical high-performance metadata engine.</p>
          </div>
          <div className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl">
            <div className="text-indigo-400 font-bold text-sm mb-1">✓ Dedicated Support</div>
            <p className="text-xs text-white/60 leading-relaxed">Access direct, priority help whenever you run into any trouble with your restoration process.</p>
          </div>
          <div className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl">
            <div className="text-indigo-400 font-bold text-sm mb-1">✓ Fair Refund Policy</div>
            <p className="text-xs text-white/60 leading-relaxed">Clear, usage-capped thresholds prevent abuse while fully protecting legitimate recovery failures.</p>
          </div>
        </div>
        
        <div className="text-center text-white/40 text-xs p-6 bg-white/5 border border-white/10 rounded-2xl">
          <p className="font-bold text-white/80 text-sm mb-2">Plan Limits & Conditions</p>
          <p>Paid plans unlock higher limits, history logs, support access, and an ad-free experience. Limits on Free and Recovery Pass are enforced on a "whichever comes first" basis (either storage capacity or file count). Our core local extraction engine is identical across all tiers.</p>
        </div>
      </div>
    </div>
  );
}
