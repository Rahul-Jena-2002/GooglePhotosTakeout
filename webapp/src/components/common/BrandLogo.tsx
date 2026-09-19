import React from 'react'

export default function BrandLogo({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={`${className} flex-shrink-0`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      {/* Floating pixels representing restored data blocks */}
      <rect x="9" y="1" width="1.5" height="1.5" fill="url(#logo-grad)" />
      <rect x="14" y="2" width="1.5" height="1.5" fill="url(#logo-grad)" />
      <rect x="11" y="4" width="1.5" height="1.5" fill="url(#logo-grad)" />
      <rect x="8" y="5" width="1.5" height="1.5" fill="url(#logo-grad)" />
      <rect x="15" y="5" width="1.5" height="1.5" fill="url(#logo-grad)" />
      <rect x="10" y="7" width="1.5" height="1.5" fill="url(#logo-grad)" />
      <rect x="13" y="7" width="1.5" height="1.5" fill="url(#logo-grad)" />
      
      {/* Photo/Media Frame with a gap at the top where pixels escape */}
      <path 
        d="M8 10H4C2.89543 10 2 10.8954 2 12V20C2 21.1046 2.89543 22 4 22H20C21.1046 22 22 21.1046 22 20V12C22 10.8954 21.1046 10 20 10H16" 
        stroke="url(#logo-grad)" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
      
      {/* Mountains */}
      <path 
        d="M2 20L8 14L13 19L18 13L22 17" 
        stroke="url(#logo-grad)" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
      
      {/* Sun */}
      <circle cx="16" cy="14" r="1.5" fill="url(#logo-grad)" />
    </svg>
  )
}
