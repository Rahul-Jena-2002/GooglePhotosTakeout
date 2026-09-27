import React, { useState, useMemo, useEffect } from "react";

interface UserAvatarProps {
  src?: string | null;
  name?: string | null;
  className?: string;
  alt?: string;
}

export function UserAvatar({
  src,
  name,
  className = "w-8 h-8",
  alt,
}: UserAvatarProps) {
  const [hasError, setHasError] = useState(false);

  const validSrc = useMemo(() => {
    if (!src || typeof src !== "string") return null;
    const trimmed = src.trim();
    if (
      !trimmed ||
      trimmed === "null" ||
      trimmed === "undefined" ||
      trimmed === "[object Object]"
    ) {
      return null;
    }
    if (
      !trimmed.startsWith("http://") &&
      !trimmed.startsWith("https://") &&
      !trimmed.startsWith("data:") &&
      !trimmed.startsWith("blob:")
    ) {
      return null;
    }
    return trimmed;
  }, [src]);

  // Reset error state if the src changes
  useEffect(() => {
    setHasError(false);
  }, [validSrc]);

  const svgFallback = (
    <div
      className={`${className} rounded-full flex-shrink-0 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 select-none overflow-hidden`}
      title={name || "User"}
      aria-label={name || "User"}
    >
      <svg
        className="w-3/5 h-3/5"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
      </svg>
    </div>
  );

  if (!validSrc || hasError) {
    return svgFallback;
  }

  return (
    <div
      className={`${className} relative rounded-full overflow-hidden flex-shrink-0 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700`}
      title={name || "User"}
    >
      {/* Background SVG fallback: always present underneath so broken icon never shows */}
      <div className="absolute inset-0 flex items-center justify-center text-zinc-400 dark:text-zinc-500 select-none pointer-events-none">
        <svg
          className="w-3/5 h-3/5"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
        </svg>
      </div>

      {/* Real photo on top: loads without CORS blocking; if fails, hides instantly */}
      <img
        src={validSrc}
        alt={alt || name || "User avatar"}
        referrerPolicy="no-referrer"
        loading="lazy"
        className="w-full h-full object-cover relative z-10"
        onError={(e) => {
          // Immediately hide broken image element to prevent browser's native broken icon
          (e.currentTarget as HTMLElement).style.display = "none";
          setHasError(true);
        }}
      />
    </div>
  );
}

export default UserAvatar;
