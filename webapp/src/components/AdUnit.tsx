import { useEffect } from "react"
import { useAuth } from "../contexts/AuthContext"

interface AdUnitProps {
  type: "horizontal" | "vertical" | "sponsor"
  slot?: string
  format?: string
  className?: string
}

const AD_HEIGHTS = {
  horizontal: "40px",
  vertical: "90px",
  sponsor: "35px",
}

export default function AdUnit({ type, slot, format = "auto", className = "" }: AdUnitProps) {
  const { userData } = useAuth()
  const isAdFree = userData?.plan === "super" && !userData?.supportWithAds

  // If the user has an ad-free plan (Super) and has not opted to support with ads, render nothing to maintain a clean premium experience
  if (isAdFree) {
    return <div className="py-1 opacity-0 select-none pointer-events-none" />
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
  
  // Set max width bounds for ads to keep them clean and premium
  const maxWidth = type === "vertical" ? "120px" : "320px"

  return (
    <div className={`ad-container my-2 w-full flex flex-col items-center justify-center ${className}`}>
      <span className="text-[7.5px] text-white/30 uppercase tracking-[0.25em] font-mono mb-1 select-none">Sponsored</span>
      <div 
        className="w-full bg-white/[0.01] border border-white/5 rounded-xl flex items-center justify-center overflow-hidden transition-all duration-300 hover:border-white/10 hover:bg-white/[0.02]"
        style={{ minHeight: height, maxHeight: height, maxWidth }}
      >
        <ins
          className="adsbygoogle"
          style={{ display: "inline-block", width: "100%", height: "100%" }}
          data-ad-client="ca-pub-7628736172233995"
          data-ad-slot={adSlotId}
          data-ad-format={format === "auto" && type === "horizontal" ? "horizontal" : format}
          data-full-width-responsive="false"
        />
      </div>
    </div>
  )
}
