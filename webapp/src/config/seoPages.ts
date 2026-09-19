export interface CuratedSeoPage {
  title: string;
  description: string;
  badge: string;
  badgeColor: string;
  headlineGradient: string;
  headlineText: string;
  gradientFrom: string;
  gradientVia: string;
  gradientTo: string;
  intro: string;
  ctaText: string;
  ctaLink: string;
}

export const CURATED_SEO_PAGES: Record<string, CuratedSeoPage> = {
  "fix-google-takeout-dates": {
    title: "Fix Google Takeout Dates – Restore Original Photo Dates | TakeoutFix",
    description: "Fix wrong dates on Google Takeout photos. TakeoutFix restores original 'Date Taken' timestamps from JSON sidecars back into your photo EXIF headers — free, private, browser-based.",
    badge: "📅 Fix Google Takeout Dates · Free · Browser-Based",
    badgeColor: "text-rose-400",
    headlineGradient: "Fix Google Takeout Dates",
    headlineText: " — Restore Original Timestamps",
    gradientFrom: "from-rose-400",
    gradientVia: "via-orange-400",
    gradientTo: "to-amber-500",
    intro: "Downloaded your photos from Google Takeout and they all show today's date? That's because companion JSON sidecars hold the original 'Date Taken' timestamps. TakeoutFix reads those JSON sidecars and writes the correct timestamps back into your photo EXIF headers instantly.",
    ctaText: "Fix Dates Now →",
    ctaLink: "/tool"
  },
  "google-photos-metadata-fix": {
    title: "Google Photos Metadata Fix – Restore Missing Dates & GPS | TakeoutFix",
    description: "Fix missing metadata from Google Photos exports. TakeoutFix restores photo dates, GPS coordinates, and EXIF data lost during Google Takeout — free, browser-based, no upload needed.",
    badge: "🖼️ Google Photos Metadata Fix · Free · Private · Browser-Based",
    badgeColor: "text-blue-400",
    headlineGradient: "Google Photos Metadata Fix",
    headlineText: " — Restore Missing Dates & GPS",
    gradientFrom: "from-blue-400",
    gradientVia: "via-indigo-400",
    gradientTo: "to-violet-500",
    intro: "Downloaded your Google Photos via Google Takeout and found all dates and GPS coordinates missing from your timeline? TakeoutFix performs a complete metadata fix — restoring original dates, GPS coordinates, and EXIF info entirely in your browser without uploading anything.",
    ctaText: "Fix Google Photos Metadata →",
    ctaLink: "/tool"
  },
  "google-takeout-merger": {
    title: "Google Takeout Merger – Merge JSON Metadata Back into Photos | TakeoutFix",
    description: "TakeoutFix is the best Google Takeout merger tool. Merge Google Takeout JSON sidecar files back into your photos and videos to restore dates, GPS, and EXIF metadata. Free, private, browser-based.",
    badge: "🔀 Google Takeout Merger · JSON + Photos = Restored EXIF",
    badgeColor: "text-amber-400",
    headlineGradient: "Google Takeout Merger",
    headlineText: " — Merge JSON Metadata Back into Photos",
    gradientFrom: "from-amber-400",
    gradientVia: "via-orange-400",
    gradientTo: "to-red-500",
    intro: "Google Takeout separates your photos from their metadata into companion JSON files. TakeoutFix is the Google Takeout merger that reunites them — writing all metadata back into the image EXIF header locally in your browser. No upload, no installation.",
    ctaText: "Start Merging Now →",
    ctaLink: "/tool"
  },
  "google-takeout-to-apple-photos": {
    title: "Migrate Google Takeout to Apple Photos | TakeoutFix",
    description: "Learn how to move your Google Takeout export to Apple Photos without losing dates or location data. TakeoutFix prepares your library for a seamless import into iCloud.",
    badge: "🍏 Takeout to Apple Photos · Free Metadata Fix",
    badgeColor: "text-sky-400",
    headlineGradient: "Migrate Google Takeout to",
    headlineText: " Apple Photos",
    gradientFrom: "from-sky-400",
    gradientVia: "via-blue-400",
    gradientTo: "to-indigo-500",
    intro: "Moving from Google Photos to iCloud? If you import a Google Takeout archive directly into Apple Photos, all your photos may clump into today's date. TakeoutFix writes the JSON metadata back into the files first, ensuring Apple Photos organizes your memories in the exact order and locations they were taken.",
    ctaText: "Prepare for Apple Photos →",
    ctaLink: "/tool"
  },
  "metadata-fixer": {
    title: "Metadata Fixer – Fix Google Takeout Photo Metadata Online | TakeoutFix",
    description: "Free online metadata fixer for Google Takeout photos. Restore missing dates, GPS locations and EXIF data with TakeoutFix — the best meta data fix tool. Works 100% in your browser, no upload needed.",
    badge: "🔧 Free Metadata Fixer · Browser-Based · No Installation",
    badgeColor: "text-emerald-400",
    headlineGradient: "The Free Online Metadata Fixer",
    headlineText: " for Google Photos",
    gradientFrom: "from-emerald-400",
    gradientVia: "via-teal-400",
    gradientTo: "to-cyan-500",
    intro: "Searching for a metadata fixer or meta data fix tool after a Google Takeout export? TakeoutFix automatically repairs missing dates, GPS coordinates, and camera information from your photo and video files — entirely in your browser.",
    ctaText: "Fix My Metadata Now →",
    ctaLink: "/tool"
  },
  "restore-gps-google-takeout": {
    title: "Restore GPS Data from Google Takeout | TakeoutFix",
    description: "Recover missing GPS coordinates from Google Takeout exports. TakeoutFix reads location data from JSON sidecars and restores it to your photo EXIF headers locally.",
    badge: "📍 Restore GPS Data · Free · Browser-Based",
    badgeColor: "text-indigo-400",
    headlineGradient: "Restore GPS Data",
    headlineText: " from Google Takeout",
    gradientFrom: "from-indigo-400",
    gradientVia: "via-purple-400",
    gradientTo: "to-pink-500",
    intro: "Did your Google Takeout archive separate out location coordinates? TakeoutFix reads the geoData latitude and longitude from your JSON sidecar files and restores proper EXIF GPS tags so your photos appear accurately on world maps and timelines.",
    ctaText: "Restore GPS Coordinates →",
    ctaLink: "/tool"
  },
  "takeout-fix": {
    title: "Takeout Fix – Fix Your Google Takeout Photos & Restore Metadata | TakeoutFix",
    description: "Looking for a takeout fix for missing photo dates and GPS? TakeoutFix is the fastest take out fix tool to restore EXIF metadata from Google Takeout exports. Works 100% locally in your browser.",
    badge: "🛠️ Free Takeout Fix Tool · No Install · No Upload",
    badgeColor: "text-indigo-400",
    headlineGradient: "The Ultimate Takeout Fix",
    headlineText: " for Google Photos",
    gradientFrom: "from-indigo-400",
    gradientVia: "via-purple-400",
    gradientTo: "to-pink-500",
    intro: "After downloading your photos via Google Takeout, dates go wrong, GPS is missing, and timelines break. TakeoutFix is the #1 takeout fix tool that restores all your missing EXIF metadata instantly — entirely in your browser.",
    ctaText: "Fix My Takeout Now →",
    ctaLink: "/tool"
  },
  "takeout-fixer": {
    title: "TakeoutFixer – Google Takeout Fixer for Photos & Videos | TakeoutFix",
    description: "TakeoutFixer by TakeoutFix. The #1 Google Takeout fixer that restores photo dates, GPS locations, and EXIF metadata lost during Google Photos export. Free, private, runs in your browser.",
    badge: "⚡ TakeoutFixer · Google Takeout Fixer · 100% Local",
    badgeColor: "text-violet-400",
    headlineGradient: "TakeoutFixer",
    headlineText: " — The Google Takeout Fixer",
    gradientFrom: "from-violet-400",
    gradientVia: "via-blue-400",
    gradientTo: "to-cyan-500",
    intro: "TakeoutFixer is the engine behind TakeoutFix. It is a specialized Google Takeout fixer that merges JSON metadata sidecars back into your exported photos and videos, restoring correct dates, GPS coordinates, and EXIF information — all locally in your browser.",
    ctaText: "Launch TakeoutFixer →",
    ctaLink: "/tool"
  }
};
