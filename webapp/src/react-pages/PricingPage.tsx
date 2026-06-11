import { Button } from "../components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card"
import { Badge } from "../components/ui/badge"
import { Link } from "react-router-dom"
import { useAuth, PLAN_PRICES } from "../contexts/AuthContext"
import { motion } from "framer-motion"
import AdUnit from "../components/AdUnit"

export default function PricingPage() {
  const { region } = useAuth()
  const prices = PLAN_PRICES[region] || PLAN_PRICES.us

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
          <Card className="bg-black/40 border-white/10 backdrop-blur-md flex flex-col h-full">
            <CardHeader>
              <CardTitle className="text-2xl">Free</CardTitle>
              <CardDescription className="text-white/50 text-xs">Good for trying TakeoutFix</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="text-4xl font-bold mb-6">Free</div>
              <ul className="space-y-3 text-sm text-white/70">
                <li className="flex items-center gap-2"><span className="text-green-400 font-bold">✓</span> Up to 1000 files (1GB)</li>
                <li className="flex items-center gap-2"><span className="text-green-400 font-bold">✓</span> Metadata Recovery</li>
                <li className="flex items-center gap-2"><span className="text-green-400 font-bold">✓</span> Deep EXIF Injection</li>
                <li className="flex items-center gap-2 text-white/40"><span className="text-white/40 font-bold">✗</span> Ads Required</li>
                <li className="flex items-center gap-2 text-white/40"><span className="text-white/40 font-bold">✗</span> No Support Tickets</li>
              </ul>
            </CardContent>
            <CardFooter>
              <Link to="/tool" className="w-full">
                <Button className="w-full bg-white/10 hover:bg-white/20 text-white border-none">Get Started</Button>
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
          <Card className="bg-black/40 border-white/10 backdrop-blur-md flex flex-col h-full">
            <CardHeader>
              <CardTitle className="text-2xl">Recovery Pass</CardTitle>
              <CardDescription className="text-white/50 text-xs">Best for one-time recovery</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="text-4xl font-bold mb-2">{prices.recovery_pass}</div>
              <div className="text-[10px] text-white/40 mb-6 uppercase tracking-wider font-bold">Single Batch</div>
              <ul className="space-y-3 text-sm text-white/70">
                <li className="flex items-center gap-2"><span className="text-green-400 font-bold">✓</span> 10,000 Files / 20GB limit</li>
                <li className="flex items-center gap-2"><span className="text-green-400 font-bold">✓</span> Folder Organization</li>
                <li className="flex items-center gap-2"><span className="text-green-400 font-bold">✓</span> Standard Support</li>
                <li className="flex items-center gap-2 text-white/40"><span className="text-white/40 font-bold">✗</span> Ads Required</li>
              </ul>
            </CardContent>
            <CardFooter>
              <Link to={`/checkout?plan=recovery_pass&region=${region}`} className="w-full">
                <Button className="w-full bg-white/10 hover:bg-white/20 text-white border-none">Buy Pass</Button>
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
          <Card className="bg-black/60 border-indigo-500/50 backdrop-blur-md flex flex-col relative h-full shadow-2xl shadow-indigo-500/10">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge className="bg-indigo-500 hover:bg-indigo-600 text-white border-none px-3 py-1">Most Popular</Badge>
            </div>
            <CardHeader>
              <CardTitle className="text-2xl text-indigo-400">Pro Lifetime</CardTitle>
              <CardDescription className="text-white/50 text-xs">Perfect for large libraries</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="text-4xl font-bold mb-2">{prices.pro}</div>
              <div className="text-[10px] text-indigo-400/80 mb-6 uppercase tracking-wider font-bold">Lifetime · 2 Devices</div>
              <ul className="space-y-3 text-sm text-white/70">
                <li className="flex items-center gap-2"><span className="text-indigo-400 font-bold">✓</span> Unlimited Processing</li>
                <li className="flex items-center gap-2"><span className="text-indigo-400 font-bold">✓</span> Recovery History logs</li>
                <li className="flex items-center gap-2"><span className="text-indigo-400 font-bold">✓</span> Priority support queue</li>
                <li className="flex items-center gap-2 text-white/40"><span className="text-white/40 font-bold">✗</span> Ads Required</li>
              </ul>
            </CardContent>
            <CardFooter>
              <Link to={`/checkout?plan=pro&region=${region}`} className="w-full">
                <Button className="w-full bg-indigo-500 hover:bg-indigo-600 text-white">Upgrade to Pro</Button>
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
          <Card className="bg-black/40 border-white/10 backdrop-blur-md flex flex-col h-full">
            <CardHeader>
              <CardTitle className="text-2xl text-amber-400">Super Lifetime</CardTitle>
              <CardDescription className="text-white/50 text-xs">Inspector + Duplicate tools</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="text-4xl font-bold mb-2">{prices.super}</div>
              <div className="text-[10px] text-amber-400/80 mb-6 uppercase tracking-wider font-bold">Lifetime · 3 Devices</div>
              <ul className="space-y-3 text-sm text-white/70">
                <li className="flex items-center gap-2"><span className="text-amber-400 font-bold">✓</span> Ad-Free Experience</li>
                <li className="flex items-center gap-2"><span className="text-amber-400 font-bold">✓</span> Visual EXIF Viewer</li>
                <li className="flex items-center gap-2"><span className="text-amber-400 font-bold">✓</span> Duplicate Space Analyzer</li>
                <li className="flex items-center gap-2"><span className="text-amber-400 font-bold">✓</span> Highest Priority Support</li>
              </ul>
            </CardContent>
            <CardFooter>
              <Link to={`/checkout?plan=super&region=${region}`} className="w-full">
                <Button className="w-full bg-white/10 hover:bg-white/20 text-white border-none">Get Super</Button>
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
