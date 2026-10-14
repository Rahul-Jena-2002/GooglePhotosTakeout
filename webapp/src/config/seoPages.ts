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
    description: "Fix wrong dates on Google Takeout photos. TakeoutFix restores original 'Date Taken' timestamps from JSON sidecars back into your photo EXIF headers — free, private, browser-based.",
    badge: "📅 Fix Google Takeout Dates · Free · Browser-Based",
    badgeColor: "text-rose-400",
    headlineText: "Fix Google Takeout Dates — Restore Original Timestamps",
    intro: "Downloaded your photos from Google Takeout and they all show today's date? That's because companion JSON sidecars hold the original 'Date Taken' timestamps. TakeoutFix reads those JSON sidecars and writes the correct timestamps back into your photo EXIF headers instantly.",
    ctaText: "Fix Dates Now →",
    ctaLink: "/tool"
  },
  "google-photos-metadata-fix": {
    title: "Google Photos Metadata Fix – Restore Missing Dates & GPS | TakeoutFix",
    description: "Fix missing metadata from Google Photos exports. TakeoutFix restores photo dates, GPS coordinates, and EXIF data lost during Google Takeout — free, browser-based, no upload needed.",
    badge: "🖼️ Google Photos Metadata Fix · Free · Private · Browser-Based",
    badgeColor: "text-blue-400",
    headlineText: "Google Photos Metadata Fix — Restore Missing Dates & GPS",
    intro: "Downloaded your Google Photos via Google Takeout and found all dates and GPS coordinates missing from your timeline? TakeoutFix performs a complete metadata fix — restoring original dates, GPS coordinates, and EXIF info entirely in your browser without uploading anything.",
    ctaText: "Fix Google Photos Metadata →",
    ctaLink: "/tool"
  },
  "google-takeout-merger": {
    title: "Match Google Takeout JSON Sidecars with Photos | TakeoutFix",
    description: "Use TakeoutFix to match Google Takeout JSON sidecars with supported photos and videos and restore available dates, GPS, and EXIF metadata in your browser.",
    badge: "🔀 Google Takeout Merger · JSON + Photos = Restored EXIF",
    badgeColor: "text-amber-400",
    headlineText: "Google Takeout Merger — Merge JSON Metadata Back into Photos",
    intro: "Google Takeout separates your photos from their metadata into companion JSON files. TakeoutFix is the Google Takeout merger that reunites them — writing all metadata back into the image EXIF header locally in your browser. No upload, no installation.",
    ctaText: "Start Merging Now →",
    ctaLink: "/tool"
  },
  "google-takeout-to-apple-photos": {
    title: "Migrate Google Takeout to Apple Photos | TakeoutFix",
    description: "Learn how to move your Google Takeout export to Apple Photos without losing dates or location data. TakeoutFix prepares your library for a seamless import into iCloud.",
    badge: "🍏 Takeout to Apple Photos · Free Metadata Fix",
    badgeColor: "text-sky-400",
    headlineText: "Migrate Google Takeout to Apple Photos",
    intro: "Moving from Google Photos to iCloud? If you import a Google Takeout archive directly into Apple Photos, all your photos may clump into today's date. TakeoutFix writes the JSON metadata back into the files first, ensuring Apple Photos organizes your memories in the exact order and locations they were taken.",
    ctaText: "Prepare for Apple Photos →",
    ctaLink: "/tool"
  },
  "metadata-fixer": {
    title: "Metadata Fixer – Fix Google Takeout Photo Metadata Online | TakeoutFix",
    description: "Restore available dates, GPS locations, and EXIF metadata from Google Takeout sidecars with this browser-based tool. Your selected media files are processed on your device.",
    badge: "🔧 Free Metadata Fixer · Browser-Based · No Installation",
    badgeColor: "text-emerald-400",
    headlineText: "The Free Online Metadata Fixer for Google Photos",
    intro: "Searching for a metadata fixer or meta data fix tool after a Google Takeout export? TakeoutFix automatically repairs missing dates, GPS coordinates, and camera information from your photo and video files — entirely in your browser.",
    ctaText: "Fix My Metadata Now →",
    ctaLink: "/tool"
  },
  "restore-gps-google-takeout": {
    title: "Restore GPS Data from Google Takeout | TakeoutFix",
    description: "Recover missing GPS coordinates from Google Takeout exports. TakeoutFix reads location data from JSON sidecars and restores it to your photo EXIF headers locally.",
    badge: "📍 Restore GPS Data · Free · Browser-Based",
    badgeColor: "text-indigo-400",
    headlineText: "Restore GPS Data from Google Takeout",
    intro: "Did your Google Takeout archive separate out location coordinates? TakeoutFix reads the geoData latitude and longitude from your JSON sidecar files and restores proper EXIF GPS tags so your photos appear accurately on world maps and timelines.",
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
    intro: "TakeoutFixer is the engine behind TakeoutFix. It is a specialized Google Takeout fixer that merges JSON metadata sidecars back into your exported photos and videos, restoring correct dates, GPS coordinates, and EXIF information — all locally in your browser.",
    ctaText: "Launch TakeoutFixer →",
    ctaLink: "/tool"
  }
};
