import React, { useEffect, useState } from "react"
import { useAuth } from "../contexts/AuthContext"
import { Button } from "./ui/button"
import { ShieldAlert, RefreshCw, Key, Sparkles } from "lucide-react"
import { Link } from "react-router-dom"
import { motion } from "framer-motion"

export default function AdBlockGate({ children }: { children: React.ReactNode }) {
  const { userData, loading } = useAuth()
  const [adBlockActive, setAdBlockActive] = useState(false)
  const [detecting, setDetecting] = useState(true)

  const isAdFree = userData?.plan === "super"

  const checkAdBlock = async () => {
    // Ad-free (Super) tier bypasses all checks automatically
    if (isAdFree) {
      setAdBlockActive(false)
      setDetecting(false)
      return
    }

    setDetecting(true)
    let isBlocked = false

    // Create a dummy DOM element with popular ad-related class selectors
    // AdBlockers block these classes by injecting stylesheets containing 'display: none !important'
    const dummy = document.createElement("div")
    dummy.className = "adsbygoogle ad-banner ad-placement doubleclick-ad"
    dummy.innerHTML = "&nbsp;"
    dummy.setAttribute(
      "style", 
      "position: absolute; left: -9999px; top: -9999px; width: 20px; height: 20px; display: block !important; visibility: visible !important; opacity: 1 !important;"
    )
    document.body.appendChild(dummy)

    // Wait a brief paint frame for extension stylesheets to apply rules
    await new Promise((resolve) => requestAnimationFrame(resolve))

    const computedStyle = window.getComputedStyle(dummy)
    if (
      dummy.offsetHeight === 0 || 
      dummy.offsetWidth === 0 || 
      computedStyle.display === "none" || 
      computedStyle.visibility === "hidden"
    ) {
      isBlocked = true
    }

    document.body.removeChild(dummy)
    setAdBlockActive(isBlocked)
    setDetecting(false)
  }

  useEffect(() => {
    if (!loading) {
      checkAdBlock()
    }
  }, [loading, isAdFree])

  if (loading || detecting) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-[#0A0A0A] flex flex-col items-center justify-center text-center p-8">
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
        <p className="text-white/40 text-xs font-mono uppercase tracking-wider">Verifying Workspace Sandbox Security...</p>
      </div>
    )
  }

  // If AdBlocker is detected AND user is not on the ad-free tier, render the gate blocking UI
  if (adBlockActive && !isAdFree) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-[#0A0A0A] flex items-center justify-center p-4 relative overflow-hidden">
        {/* Background mesh glows */}
        <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-red-500/5 blur-[120px] rounded-full pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-indigo-500/5 blur-[120px] rounded-full pointer-events-none"></div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="relative max-w-lg w-full bg-zinc-950/80 border border-white/10 p-8 rounded-3xl backdrop-blur-2xl shadow-2xl overflow-hidden text-center"
          style={{
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08)"
          }}
        >
          {/* Top highlight bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 via-indigo-500 to-purple-600"></div>

          <ShieldAlert className="w-14 h-14 text-indigo-400 mx-auto mb-6 animate-pulse" />

          <h2 className="text-2xl font-black text-white tracking-tight mb-3">
            AdBlocker Detected
          </h2>

          <p className="text-sm text-zinc-400 leading-relaxed mb-6 px-2">
            TakeoutFix runs EXIF metadata mergers completely offline in your browser. To support our free hosting costs and servers, we require ad block whitelisting for our free tier.
          </p>

          {/* Quick instructions container */}
          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 text-left text-xs text-zinc-500 space-y-2 mb-8">
            <p className="font-bold text-white/80 uppercase tracking-wider text-[10px] mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              How to Whitelist TakeoutFix:
            </p>
            <ol className="list-decimal pl-4 space-y-1.5 leading-relaxed text-zinc-400">
              <li>Click your AdBlocker extension icon (uBlock, AdBlock, etc.).</li>
              <li>Toggle the power switch off to disable blocking on this site.</li>
              <li>Click the refresh button below to unlock the workspace.</li>
            </ol>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={checkAdBlock}
              className="flex-1 bg-white text-black hover:bg-zinc-200 font-bold rounded-full py-2.5 flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh Check
            </Button>
            <Link to="/pricing" className="flex-1">
              <Button
                className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-95 border-0 font-bold rounded-full py-2.5 flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
              >
                <Key className="w-4 h-4" />
                Go Ad-Free (Pro)
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    )
  }

  // Normal workspace component render if ad block is inactive or user has a paid plan
  return <>{children}</>
}
