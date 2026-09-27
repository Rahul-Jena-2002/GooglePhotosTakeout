import React, { useState } from "react";

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
  const [error, setError] = useState(false);

  if (src && !error) {
    return (
      <img
        src={src}
        alt={alt || name || "User avatar"}
        referrerPolicy="no-referrer"
        className={`${className} rounded-full object-cover flex-shrink-0`}
        onError={() => setError(true)}
      />
    );
  }

  return (
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
}

export default UserAvatar;
