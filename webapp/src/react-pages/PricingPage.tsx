import { Button } from "../components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card"
import { Badge } from "../components/ui/badge"
import { Link } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import { motion } from "framer-motion"
import AdUnit from "../components/AdUnit"

export default function PricingPage() {
  const { region, prices, userData } = useAuth()

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-24">
      <div className="text-center mb-12 flex flex-col items-center">
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="text-4xl md:text-5xl font-bold mb-4"
        >
          Pricing Plans
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
          className="text-xl text-white/60 max-w-2xl mx-auto"
        >
          Every plan uses the same recovery engine. Every plan receives the same metadata restoration quality.
        </motion.p>


      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16 items-stretch">
        
        {/* FREE PLAN */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
          className="flex flex-col"
        >
          <Card className="bg-black/40 border-white/10 backdrop-blur-md flex flex-col h-full hover:border-white/20 transition-all">
            <CardHeader>
              <CardTitle className="text-2xl">Free</CardTitle>
              <CardDescription className="text-white/50 text-xs">Perfect for trying MetaForge</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-6">
              <div>
                <div className="text-4xl font-bold">{region === 'in' ? "₹0" : "$0"}</div>
                <p className="text-[11px] text-white/50 mt-1 leading-relaxed">Try MetaForge on a small Google Takeout export before upgrading.</p>
              </div>
              <div>
                <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-2">Includes</div>
                <ul className="space-y-2 text-xs text-white/70">
                  <li className="flex items-center gap-1.5"><span className="text-green-400 font-bold">✓</span> 1,000 Files OR 1 GB per recovery</li>
                  <li className="flex items-center gap-1.5"><span className="text-green-400 font-bold">✓</span> Metadata Recovery</li>
                  <li className="flex items-center gap-1.5"><span className="text-green-400 font-bold">✓</span> Deep EXIF Injection</li>
                  <li className="flex items-center gap-1.5"><span className="text-green-400 font-bold">✓</span> Local Browser Processing</li>
                  <li className="flex items-center gap-1.5"><span className="text-green-400 font-bold">✓</span> Processing Activity Feed</li>
                  <li className="flex items-center gap-1.5"><span className="text-green-400 font-bold">✓</span> Processing Log Download</li>
                  <li className="flex items-center gap-1.5"><span className="text-green-400 font-bold">✓</span> Results Summary</li>
                  <li className="flex items-center gap-1.5"><span className="text-green-400 font-bold">✓</span> Files Never Leave Your Device</li>
                  <li className="flex items-center gap-1.5"><span className="text-green-400 font-bold">✓</span> Community Documentation</li>
                </ul>
              </div>
              <div>
                <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-2">Support</div>
                <ul className="space-y-1 text-xs text-white/60">
                  <li>• FAQ</li>
                  <li>• Documentation</li>
                </ul>
              </div>
              <div>
                <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-2">Website Experience</div>
                <ul className="space-y-1 text-xs text-white/50">
                  <li>• Supported by website ads</li>
                  <li>• Ad blocker must be disabled</li>
                </ul>
              </div>
            </CardContent>
            <CardFooter>
              <Link to="/tool" className="w-full">
                <Button className="w-full btn-solid-dark h-11 font-semibold text-sm">Start Free Recovery</Button>
              </Link>
            </CardFooter>
          </Card>
        </motion.div>

        {/* RECOVERY PASS */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25, ease: "easeOut" }}
          className="flex flex-col"
        >
          <Card className="bg-black/40 border-white/10 backdrop-blur-md flex flex-col h-full hover:border-white/20 transition-all">
            <CardHeader>
              <CardTitle className="text-2xl">Recovery Pass</CardTitle>
              <CardDescription className="text-white/50 text-xs">Best for one-time Google Takeout recovery</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-6">
              <div>
                <div className="text-4xl font-bold mb-2">{prices.recovery_pass}</div>
                <p className="text-[11px] text-white/50 mt-1 leading-relaxed">Recover a large Google Takeout export without committing to a lifetime plan.</p>
              </div>
              <div>
                <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-2">Includes Everything in Free</div>
                <ul className="space-y-2 text-xs text-white/70">
                  <li className="flex items-center gap-1.5 font-bold"><span className="text-indigo-400 font-bold">✓</span> Up to 10,000 Files OR 20 GB</li>
                  <li className="flex items-center gap-1.5"><span className="text-indigo-400 font-bold">✓</span> Folder Organization</li>
                  <li className="flex items-center gap-1.5"><span className="text-indigo-400 font-bold">✓</span> Large Export Processing</li>
                  <li className="flex items-center gap-1.5"><span className="text-indigo-400 font-bold">✓</span> Standard Support</li>
                  <li className="flex items-center gap-1.5"><span className="text-indigo-400 font-bold">✓</span> Support Tickets</li>
                  <li className="flex items-center gap-1.5"><span className="text-indigo-400 font-bold">✓</span> My Tickets</li>
                </ul>
              </div>
              <div>
                <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-2">Support</div>
                <div className="text-xs text-white/60">
                  <p>Typical response time:</p>
                  <p className="font-semibold text-white/80">24–48 Business Hours</p>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-2">Website Experience</div>
                <ul className="space-y-1 text-xs text-white/50">
                  <li>• Supported by website ads</li>
                  <li>• Ad blocker must be disabled</li>
                </ul>
              </div>
            </CardContent>
            <CardFooter>
              <Link to={`/checkout?plan=recovery_pass&region=${region}`} className="w-full">
                <Button className="w-full btn-solid-dark h-11 font-semibold text-sm">Buy Recovery Pass</Button>
              </Link>
            </CardFooter>
          </Card>
        </motion.div>

        {/* PRO LIFETIME */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35, ease: "easeOut" }}
          className="flex flex-col scale-105 z-10"
        >
          <Card className="bg-black/60 border-indigo-500/50 backdrop-blur-md flex flex-col relative h-full shadow-2xl shadow-indigo-500/10 hover:border-indigo-400 transition-all">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge className="bg-indigo-500 hover:bg-indigo-600 text-white border-none px-3 py-1">Most Popular</Badge>
            </div>
            <CardHeader>
              <CardTitle className="text-2xl text-indigo-400">Pro Lifetime</CardTitle>
              <CardDescription className="text-white/50 text-xs">Perfect for photographers and large Google Takeout libraries</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-6">
              <div>
                <div className="text-4xl font-bold mb-2">{prices.pro}</div>
                <p className="text-[11px] text-indigo-400/80 mt-1 leading-relaxed">Lifetime License · Up to 2 Devices</p>
              </div>
              <div>
                <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-2">Includes Everything in Recovery Pass</div>
                <ul className="space-y-2 text-xs text-white/70">
                  <li className="flex items-center gap-1.5 font-bold"><span className="text-indigo-400 font-bold">✓</span> Unlimited Processing</li>
                  <li className="flex items-center gap-1.5 font-bold"><span className="text-indigo-400 font-bold">✓</span> Recovery History</li>
                  <li className="flex items-center gap-1.5 font-bold"><span className="text-indigo-400 font-bold">✓</span> Recovery Statistics</li>
                  <li className="flex items-center gap-1.5 font-bold"><span className="text-indigo-400 font-bold">✓</span> Priority Support Queue</li>
                  <li className="flex items-center gap-1.5 font-bold"><span className="text-indigo-400 font-bold">✓</span> Lifetime License</li>
                </ul>
              </div>
              <div>
                <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-2">Support</div>
                <div className="text-xs text-white/60">
                  <p className="font-bold text-indigo-400">Priority Queue</p>
                  <p>Typical response time: 24–48 Business Hours</p>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-2">Website Experience</div>
                <ul className="space-y-1 text-xs text-white/50">
                  <li>• Supported by website ads</li>
                  <li>• Ad blocker must be disabled</li>
                </ul>
              </div>
            </CardContent>
            <CardFooter>
              <Link to={`/checkout?plan=pro&region=${region}`} className="w-full">
                <Button className="w-full btn-solid-primary h-11 font-semibold text-sm">Upgrade to Pro</Button>
              </Link>
            </CardFooter>
          </Card>
        </motion.div>

        {/* SUPER LIFETIME */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.45, ease: "easeOut" }}
          className="flex flex-col"
        >
          <Card className="bg-black/40 border-white/10 backdrop-blur-md flex flex-col h-full hover:border-white/20 transition-all">
            <CardHeader>
              <CardTitle className="text-2xl text-amber-400">Super Lifetime</CardTitle>
              <CardDescription className="text-white/50 text-xs">Advanced recovery analysis</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-6">
              <div>
                <div className="text-4xl font-bold mb-2">{prices.super}</div>
                <p className="text-[11px] text-amber-400/80 mt-1 leading-relaxed">Lifetime License · Up to 3 Devices</p>
              </div>
              <div>
                <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-2">Includes Everything in Pro</div>
                <ul className="space-y-2 text-xs text-white/70">
                  <li className="flex items-center gap-1.5 font-bold"><span className="text-amber-400 font-bold">✓</span> Ad-Free Experience</li>
                  <li className="flex items-center gap-1.5 font-bold"><span className="text-amber-400 font-bold">✓</span> Metadata Viewer</li>
                  <li className="flex items-center gap-1.5"><span className="text-amber-400 font-bold">✓</span> Duplicate Space Analyzer</li>
                  <li className="flex items-center gap-1.5"><span className="text-amber-400 font-bold">✓</span> Advanced Recovery Statistics</li>
                  <li className="flex items-center gap-1.5 font-bold"><span className="text-amber-400 font-bold">✓</span> Highest Priority Support</li>
                </ul>
              </div>
              <div>
                <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-2">Support</div>
                <div className="text-xs text-white/60">
                  <p className="font-bold text-amber-400">Highest Priority Queue</p>
                  <p>Typical response time: 24–48 Business Hours</p>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-2">Website Experience</div>
                <ul className="space-y-1 text-xs text-emerald-400 font-semibold">
                  <li>• Ad-Free Experience</li>
                  <li>• No Ads Allowed</li>
                </ul>
              </div>
            </CardContent>
            <CardFooter>
              <Link to={`/checkout?plan=super&region=${region}`} className="w-full">
                <Button className="w-full btn-solid-dark h-11 font-semibold text-sm">Go Ad-Free</Button>
              </Link>
            </CardFooter>
          </Card>
        </motion.div>

      </div>

      <div className="w-full max-w-4xl mx-auto px-4 my-12">
        <AdUnit type="horizontal" />
      </div>

      {/* DETAILED COMPARISON TABLE */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.55, ease: "easeOut" }}
        className="mt-32"
      >
        <h2 className="text-3xl font-bold text-center mb-12">Compare Plans in Detail</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b border-white/10 bg-zinc-950/20">
                <th className="py-4 px-6 font-medium text-white/50 w-1/3">Feature</th>
                <th className="py-4 px-6 font-bold text-center">Free</th>
                <th className="py-4 px-6 font-bold text-center">Recovery Pass</th>
                <th className="py-4 px-6 font-bold text-center text-indigo-400">Pro Lifetime</th>
                <th className="py-4 px-6 font-bold text-center text-amber-400">Super Lifetime</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              <tr className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="py-4 px-6 font-medium">Device Limit</td>
                <td className="py-4 px-6 text-center text-white/70">1 Device</td>
                <td className="py-4 px-6 text-center text-white/70">1 Device</td>
                <td className="py-4 px-6 text-center text-white/70">2 Devices</td>
                <td className="py-4 px-6 text-center text-white/70">3 Devices</td>
              </tr>
              <tr className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="py-4 px-6 font-medium">Processing Limit</td>
                <td className="py-4 px-6 text-center text-white/70">1 GB (1,000 files)</td>
                <td className="py-4 px-6 text-center text-white/70">20 GB (10,000 files)</td>
                <td className="py-4 px-6 text-center text-green-400 font-bold">Unlimited</td>
                <td className="py-4 px-6 text-center text-green-400 font-bold">Unlimited</td>
              </tr>
              <tr className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="py-4 px-6 font-medium">EXIF Metadata Quality</td>
                <td className="py-4 px-6 text-center text-white/70">100%</td>
                <td className="py-4 px-6 text-center text-white/70">100%</td>
                <td className="py-4 px-6 text-center text-white/70">100%</td>
                <td className="py-4 px-6 text-center text-white/70">100%</td>
              </tr>
              <tr className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="py-4 px-6 font-medium">Access Duration</td>
                <td className="py-4 px-6 text-center text-white/70">Forever</td>
                <td className="py-4 px-6 text-center text-white/70">24 Hours</td>
                <td className="py-4 px-6 text-center text-indigo-400 font-bold">Lifetime</td>
                <td className="py-4 px-6 text-center text-amber-400 font-bold">Lifetime</td>
              </tr>
              <tr className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="py-4 px-6 font-medium">Recovery History Log</td>
                <td className="py-4 px-6 text-center text-white/20">—</td>
                <td className="py-4 px-6 text-center text-white/20">—</td>
                <td className="py-4 px-6 text-center text-green-400">✓</td>
                <td className="py-4 px-6 text-center text-green-400">✓</td>
              </tr>
              <tr className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="py-4 px-6 font-medium">Ad-Free Experience</td>
                <td className="py-4 px-6 text-center text-white/20">—</td>
                <td className="py-4 px-6 text-center text-white/20">—</td>
                <td className="py-4 px-6 text-center text-white/20">—</td>
                <td className="py-4 px-6 text-center text-green-400">✓</td>
              </tr>
              <tr className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="py-4 px-6 font-medium">Support Priority</td>
                <td className="py-4 px-6 text-center text-white/20">None</td>
                <td className="py-4 px-6 text-center text-white/70">Standard</td>
                <td className="py-4 px-6 text-center text-indigo-400">Priority Queue</td>
                <td className="py-4 px-6 text-center text-amber-400 font-bold">Highest Priority</td>
              </tr>
            </tbody>
          </table>
        </div>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.65, ease: "easeOut" }}
        className="mt-16 text-center text-white/40 text-sm max-w-3xl mx-auto p-6 bg-white/5 border border-white/10 rounded-xl"
      >
        <p className="font-bold text-white/80 text-base mb-2">Recovery Quality Guarantee</p>
        <p>Paid plans unlock Higher Limits, History logs, Support Access, and Ad-Free Experience. Limits on Free and Recovery Pass are enforced on a "whichever comes first" basis (either storage capacity or file count). <strong className="text-white">Recovery quality never changes between plans.</strong> Our core local extraction engine is identical across all tiers.</p>
      </motion.div>
    </div>
  )
}
