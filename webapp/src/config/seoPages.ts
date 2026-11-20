export interface CuratedSeoPage {
  title: string;
  description: string;
  badge: string;
  badgeColor: string;
  headlineText: string;
  intro: string;
  ctaText: string;
  ctaLink: string;
}

export const CURATED_SEO_PAGES: Record<string, CuratedSeoPage> = {
  "fix-google-takeout-dates": {
    title: "Fix Google Takeout Dates – Restore Original Photo Dates | TakeoutFix",
    description: "Try restoring available photo dates from matching Google Takeout JSON sidecars using the browser-based TakeoutFix tool.",
    badge: "📅 Fix Google Takeout Dates · Free · Browser-Based",
    badgeColor: "text-rose-400",
    headlineText: "Fix Google Takeout Dates — Restore Original Timestamps",
    intro: "If exported photos show the wrong date, a matching JSON sidecar may contain the original timestamp. TakeoutFix can use available dates with supported files; check the results and keep your original export.",
    ctaText: "Fix Dates Now →",
    ctaLink: "/tool"
  },
  "google-photos-metadata-fix": {
    title: "Google Photos Metadata Fix – Restore Missing Dates & GPS | TakeoutFix",
    description: "Fix missing metadata from Google Photos exports. TakeoutFix restores photo dates, GPS coordinates, and EXIF data lost during Google Takeout — free, browser-based, no upload needed.",
    badge: "🖼️ Google Photos Metadata Fix · Free · Private · Browser-Based",
    badgeColor: "text-blue-400",
    headlineText: "Google Photos Metadata Fix — Restore Missing Dates & GPS",
    intro: "If dates or locations appear missing after export, TakeoutFix can try to restore supported information from matching sidecars. Selected media is processed in your browser; results depend on the data available.",
    ctaText: "Fix Google Photos Metadata →",
    ctaLink: "/tool"
  },
  "google-takeout-merger": {
    title: "Match Google Takeout JSON Sidecars with Photos | TakeoutFix",
    description: "Use TakeoutFix to match Google Takeout JSON sidecars with supported photos and videos and restore available dates, GPS, and EXIF metadata in your browser.",
    badge: "🔀 Google Takeout Merger · JSON + Photos = Restored EXIF",
    badgeColor: "text-amber-400",
    headlineText: "Google Takeout Merger — Merge JSON Metadata Back into Photos",
    intro: "Google Takeout can include companion JSON files alongside your photos. TakeoutFix looks for matching sidecars and writes supported, available metadata to output copies in your browser.",
    ctaText: "Start Merging Now →",
    ctaLink: "/tool"
  },
  "google-takeout-to-apple-photos": {
    title: "Migrate Google Takeout to Apple Photos | TakeoutFix",
    description: "Prepare a Google Takeout export for Apple Photos and learn why you should check dates and locations after import.",
    badge: "🍏 Takeout to Apple Photos · Free Metadata Fix",
    badgeColor: "text-sky-400",
    headlineText: "Migrate Google Takeout to Apple Photos",
    intro: "Moving from Google Photos to Apple Photos? TakeoutFix can try to restore available metadata before import. Keep your original export and check a sample in Apple Photos, since results can vary.",
    ctaText: "Prepare for Apple Photos →",
    ctaLink: "/tool"
  },
  "metadata-fixer": {
    title: "Metadata Fixer – Fix Google Takeout Photo Metadata Online | TakeoutFix",
    description: "Restore available dates, GPS locations, and EXIF metadata from Google Takeout sidecars with this browser-based tool. Your selected media files are processed on your device.",
    badge: "🔧 Free Metadata Fixer · Browser-Based · No Installation",
    badgeColor: "text-emerald-400",
    headlineText: "The Free Online Metadata Fixer for Google Photos",
    intro: "Looking for a metadata fixer after a Google Takeout export? TakeoutFix can try to restore available dates and locations to supported photos and videos in your browser. Some information may remain unavailable.",
    ctaText: "Fix My Metadata Now →",
    ctaLink: "/tool"
  },
  "restore-gps-google-takeout": {
    title: "Restore GPS Data from Google Takeout | TakeoutFix",
    description: "Recover missing GPS coordinates from Google Takeout exports. TakeoutFix reads location data from JSON sidecars and restores it to your photo EXIF headers locally.",
    badge: "📍 Restore GPS Data · Free · Browser-Based",
    badgeColor: "text-indigo-400",
    headlineText: "Restore GPS Data from Google Takeout",
    intro: "If a matching JSON sidecar contains usable coordinates, TakeoutFix can try to add them to a supported photo. Check the result in your photo app; missing source locations cannot be reconstructed.",
    ctaText: "Restore GPS Coordinates →",
    ctaLink: "/tool"
  },
  "takeout-fix": {
    title: "TakeoutFix for Google Takeout Photo Metadata | TakeoutFix",
    description: "Understand how TakeoutFix can help with missing photo dates and GPS metadata in a Google Takeout export, and what to check before processing a library.",
    badge: "🛠️ Free Takeout Fix Tool · No Install · No Upload",
    badgeColor: "text-indigo-400",
    headlineText: "TakeoutFix for Google Takeout Photos",
    intro: "If dates or locations appear missing after a Google Takeout export, the original information may be in a companion JSON sidecar. TakeoutFix can match sidecars to supported media files and write available metadata locally in your browser.",
    ctaText: "Fix My Takeout Now →",
    ctaLink: "/tool"
  },
  "takeout-fixer": {
    title: "How TakeoutFix Handles Google Takeout Sidecars | TakeoutFix",
    description: "TakeoutFix matches Google Takeout JSON sidecars with supported photos and videos and restores metadata that is present in the export.",
    badge: "⚡ TakeoutFixer · Google Takeout Fixer · 100% Local",
    badgeColor: "text-violet-400",
    headlineText: "TakeoutFix — The Google Takeout Fixer",
    intro: "TakeoutFix helps match Google Takeout JSON sidecars to supported photos and videos and restore available metadata in your browser. Keep your original export and verify the output.",
    ctaText: "Launch TakeoutFixer →",
    ctaLink: "/tool"
  }
};
