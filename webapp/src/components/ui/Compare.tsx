import React, { useState, useRef, useEffect } from "react";
import { Calendar, MapPin, Tablet, Image, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";

export default function Compare() {
  const [sliderPosition, setSliderPosition] = useState(25); // Start at 25 for initial guide animation
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationCancelledRef = useRef(false);

  const handleMove = (clientX: number) => {
    if (!containerRef.current) return;
    animationCancelledRef.current = true; // Cancel any active guide animation on user interaction
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isDragging) return;
    handleMove(e.touches[0].clientX);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    handleMove(e.clientX);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (!containerRef.current) return;

    let delayTimer: NodeJS.Timeout;
    let animationFrameId: number;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          // Trigger the animation after a small delay once the component is in view
          delayTimer = setTimeout(() => {
            const startPosition = 25;
            const targetPosition = 50;
            const duration = 1200; // 1.2s smooth slide
            let startTime: number | null = null;

            const animate = (currentTime: number) => {
              if (animationCancelledRef.current) return; // User took control, stop animation
              
              if (startTime === null) {
                startTime = currentTime;
              }
              const elapsed = currentTime - startTime;
              const progress = Math.min(elapsed / duration, 1);
              
              // Ease out cubic easing
              const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
              const currentPos = startPosition + (targetPosition - startPosition) * easeOutCubic(progress);
              
              setSliderPosition(currentPos);

              if (progress < 1) {
                animationFrameId = requestAnimationFrame(animate);
              }
            };

            animationFrameId = requestAnimationFrame(animate);
          }, 600); // 600ms delay after coming into view

          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.30 } // Trigger when 30% of the component is in viewport
    );

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      if (delayTimer) clearTimeout(delayTimer);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("touchmove", handleTouchMove);
      window.addEventListener("touchend", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleMouseUp);
    };
  }, [isDragging]);

  const handleMouseDown = () => {
    setIsDragging(true);
    animationCancelledRef.current = true;
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full max-w-2xl mx-auto h-[400px] rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 select-none"
    >
      {/* BEFORE CARD (Bottom Layer) */}
      <div className="absolute inset-0 w-full h-full bg-zinc-50 dark:bg-zinc-950 p-6 md:p-8 flex flex-col justify-between">
        <div className="flex justify-between items-start h-[125px] md:h-[135px]">
          <div>
            <span className="px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 w-fit">
              <AlertCircle className="w-3.5 h-3.5" />
              Before TakeoutFix
            </span>
            <h4 className="text-xl font-bold text-zinc-900 dark:text-white mt-4 font-semibold">IMG_9942.jpg</h4>
            <p className="text-xs text-zinc-500 mt-1">2.4 MB · JPEG Image</p>
          </div>
          <Image className="w-10 h-10 text-zinc-400 dark:text-zinc-600" />
        </div>

        <div className="space-y-4 border-t border-zinc-200 dark:border-zinc-900 pt-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500 flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Date Taken
            </span>
            <span className="text-red-500 font-bold text-xs uppercase tracking-wide bg-red-500/5 px-2.5 py-0.5 rounded border border-red-500/10">Missing</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500 flex items-center gap-2">
              <MapPin className="w-4 h-4" /> Location (GPS)
            </span>
            <span className="text-red-500 font-bold text-xs uppercase tracking-wide bg-red-500/5 px-2.5 py-0.5 rounded border border-red-500/10">Missing</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500 flex items-center gap-2">
              <Tablet className="w-4 h-4" /> Device
            </span>
            <span className="text-red-500 font-bold text-xs uppercase tracking-wide bg-red-500/5 px-2.5 py-0.5 rounded border border-red-500/10">Missing</span>
          </div>
        </div>
      </div>

      {/* AFTER CARD (Top Layer with Clip Path) */}
      <div 
        className="absolute inset-0 w-full h-full bg-zinc-50/50 dark:bg-zinc-900/40 p-6 md:p-8 flex flex-col justify-between pointer-events-none"
        style={{ clipPath: `inset(0 0 0 ${sliderPosition}%)` }}
      >
        <div className="absolute inset-0 bg-white dark:bg-zinc-950 -z-10"></div>
        <div className="flex justify-between items-start h-[125px] md:h-[135px]">
          <div>
            <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 w-fit">
              <CheckCircle2 className="w-3.5 h-3.5" />
              After TakeoutFix
            </span>
            <h4 className="text-xl font-bold text-zinc-900 dark:text-white mt-4 font-semibold">IMG_9942.jpg</h4>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> EXIF Injected
            </p>
          </div>
          <Image className="w-10 h-10 text-emerald-500" />
        </div>

        <div className="space-y-4 border-t border-zinc-200 dark:border-zinc-800 pt-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-600 dark:text-zinc-400 flex items-center gap-2 font-medium">
              <Calendar className="w-4 h-4" /> Date Taken
            </span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Aug 12, 2014 14:30</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-600 dark:text-zinc-400 flex items-center gap-2 font-medium">
              <MapPin className="w-4 h-4" /> Location (GPS)
            </span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">48.8584° N, 2.2945° E</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-600 dark:text-zinc-400 flex items-center gap-2 font-medium">
              <Tablet className="w-4 h-4" /> Device
            </span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">iPhone 6</span>
          </div>
        </div>
      </div>

      {/* SLIDER HANDLEBAR */}
      <div 
        className="absolute top-0 bottom-0 w-1 bg-zinc-300 dark:bg-zinc-700 cursor-ew-resize z-30"
        style={{ left: `${sliderPosition}%` }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
      >
        <div className="compare-handle-circle absolute top-1/2 left-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-ew-resize shadow-md">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 16l-4-4 4-4m4 8l4-4-4-4" />
          </svg>
        </div>
      </div>
    </div>
  );
}
