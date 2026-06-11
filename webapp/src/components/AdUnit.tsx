import { useEffect } from "react"
import { useAuth } from "../contexts/AuthContext"

interface AdUnitProps {
  type: "horizontal" | "vertical" | "sponsor"
  slot?: string
  format?: string
  className?: string
}

const AD_HEIGHTS = {
  horizontal: "90px",
  vertical: "250px",
  sponsor: "100px",
}

export default function AdUnit({ type, slot, format = "auto", className = "" }: AdUnitProps) {
  const { userData } = useAuth()
  const isAdFree = userData?.plan === "super"

  // If the user has an ad-free plan (Super), render nothing to maintain a clean premium experience
  if (isAdFree) {
    return <div className="py-2 opacity-0 select-none pointer-events-none" />
  }

  useEffect(() => {
    try {
      const adsbygoogle = (window as any).adsbygoogle || []
      adsbygoogle.push({})
    } catch (err) {
      console.debug("AdSense push execution")
    }
  }, [])

  const adSlotId = slot || "1234567890"
  const height = AD_HEIGHTS[type]

  return (
    <div className={`ad-container my-6 w-full flex flex-col items-center justify-center ${className}`}>
      <span className="text-[9px] text-white/25 dark:text-white/20 uppercase tracking-widest font-mono mb-1.5 select-none">Advertisement</span>
      <div 
        className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.05)] flex items-center justify-center overflow-hidden transition-all duration-300"
        style={{ minHeight: height }}
      >
        <ins
          className="adsbygoogle"
          style={{ display: "block", width: "100%", height: "100%" }}
          data-ad-client="ca-pub-7628736172233995"
          data-ad-slot={adSlotId}
          data-ad-format={format}
          data-full-width-responsive="true"
        />
      </div>
    </div>
  )
}
