import { db, getDb } from "../../firebase";
import type {
  AdProvider,
  AdUnit,
  AffiliateProvider,
  AffiliateLink,
  MonetizationPlacement,
  MonetizationConfig,
  MonetizationGlobalSettings,
  MonetizationResponse,
  ResolvedMonetizationItem,
  DisplayMode,
} from "./types";
import {
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_PLACEMENTS,
  DEFAULT_CONFIGS,
  DEFAULT_AFFILIATE_PROVIDERS,
  DEFAULT_AD_PROVIDERS,
  DEFAULT_AFFILIATE_LINKS,
  DEFAULT_AD_UNITS,
} from "./defaultData";

// Local in-memory cache to prevent redundant Firestore queries on every page render
interface CacheState {
  globalSettings: MonetizationGlobalSettings | null;
  placements: Map<string, MonetizationPlacement>;
  configs: Map<string, MonetizationConfig>;
  adProviders: Map<string, AdProvider>;
  affiliateProviders: Map<string, AffiliateProvider>;
  adUnits: AdUnit[];
  affiliateLinks: AffiliateLink[];
  lastLoaded: number;
}

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes persistent cache
const STORAGE_KEY = "takeoutfix_monetization_cache_v8";

const cache: CacheState = {
  globalSettings: null,
  placements: new Map(),
  configs: new Map(),
  adProviders: new Map(),
  affiliateProviders: new Map(),
  adUnits: [],
  affiliateLinks: [],
  lastLoaded: 0,
};

let inFlightFetch: Promise<CacheState> | null = null;

function saveToPersistentStorage(c: CacheState) {
  if (typeof window === "undefined") return;
  try {
    const serialized = {
      globalSettings: c.globalSettings,
      placements: Array.from(c.placements.entries()),
      configs: Array.from(c.configs.entries()),
      adProviders: Array.from(c.adProviders.entries()),
      affiliateProviders: Array.from(c.affiliateProviders.entries()),
      adUnits: c.adUnits,
      affiliateLinks: c.affiliateLinks,
      lastLoaded: c.lastLoaded,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
  } catch (_) {}
}

function loadFromPersistentStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || !data.lastLoaded) return false;
    const now = Date.now();
    if (now - data.lastLoaded > CACHE_TTL_MS) return false;

    cache.globalSettings = data.globalSettings || null;
    cache.placements = new Map(data.placements || []);
    cache.configs = new Map(data.configs || []);
    cache.adProviders = new Map(data.adProviders || []);
    cache.affiliateProviders = new Map(data.affiliateProviders || []);
    cache.adUnits = data.adUnits || [];
    cache.affiliateLinks = data.affiliateLinks || [];
    cache.lastLoaded = data.lastLoaded;
    return true;
  } catch (_) {
    return false;
  }
}

export function invalidateMonetizationCache(): void {
  cache.lastLoaded = 0;
  cache.globalSettings = null;
  cache.placements.clear();
  cache.configs.clear();
  cache.adProviders.clear();
  cache.affiliateProviders.clear();
  cache.adUnits = [];
  cache.affiliateLinks = [];
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }
}

// Exclude any internal website self-promotions from ads and affiliate banners
export const isInternalSitePromotion = (url?: string, title?: string, providerName?: string): boolean => {
  const lowerUrl = (url || "").toLowerCase();
  const lowerTitle = (title || "").toLowerCase();
  const lowerProv = (providerName || "").toLowerCase();
  return (
    lowerUrl.startsWith("/pricing") ||
    lowerUrl.startsWith("/download") ||
    lowerUrl.startsWith("/tool") ||
    lowerTitle.includes("upgrade to takeoutfix") ||
    lowerTitle.includes("takeoutfix cloud backup") ||
    lowerTitle.includes("takeoutfix super") ||
    lowerProv.includes("takeoutfix direct")
  );
};

export function applyMonetizationAppearance(settings?: MonetizationGlobalSettings | null) {
  if (typeof document === "undefined") return;
  const opacity = (settings?.adOpacity ?? 80) / 100;
  const size = settings?.adSize ?? "small";
  document.documentElement.style.setProperty("--ad-opacity", opacity.toString());
  document.documentElement.setAttribute("data-ad-size", size);
  try {
    localStorage.setItem("monetization_appearance", JSON.stringify({
      opacity: settings?.adOpacity ?? 80,
      size,
    }));
  } catch (_) {}
}

/**
 * Load all monetization datasets into cache with persistent storage and parallelized fetching
 */
export async function fetchAllMonetizationData(forceRefresh = false): Promise<CacheState> {
  const now = Date.now();

  // 1. Check in-memory cache
  if (!forceRefresh && cache.lastLoaded > 0 && now - cache.lastLoaded < CACHE_TTL_MS) {
    return cache;
  }

  // 2. Check persistent storage (sessionStorage / localStorage)
  if (!forceRefresh && loadFromPersistentStorage()) {
    applyMonetizationAppearance(cache.globalSettings);
    return cache;
  }

  // 3. Deduplicate simultaneous in-flight requests across multiple components
  if (inFlightFetch) {
    return inFlightFetch;
  }

  inFlightFetch = (async () => {
    try {
      const firestore = await getDb();
      if (!firestore) throw new Error("Firestore not initialized");

      const { collection, getDocs, doc, getDoc } = await import("firebase/firestore");

      // Parallel fetch all 7 collections in a single concurrent round-trip
      const [
        globalSnapRes,
        placementsSnapRes,
        configsSnapRes,
        adProvSnapRes,
        affProvSnapRes,
        adUnitsSnapRes,
        affLinksSnapRes,
      ] = await Promise.allSettled([
        getDoc(doc(firestore, "settings", "monetization")),
        getDocs(collection(firestore, "monetization_placements")),
        getDocs(collection(firestore, "monetization_configs")),
        getDocs(collection(firestore, "ad_providers")),
        getDocs(collection(firestore, "affiliate_providers")),
        getDocs(collection(firestore, "ad_units")),
        getDocs(collection(firestore, "affiliate_links")),
      ]);

      // 1. Global Settings
      if (globalSnapRes.status === "fulfilled" && globalSnapRes.value.exists()) {
        cache.globalSettings = { ...DEFAULT_GLOBAL_SETTINGS, ...globalSnapRes.value.data() } as MonetizationGlobalSettings;
      } else {
        cache.globalSettings = { ...DEFAULT_GLOBAL_SETTINGS };
      }
      applyMonetizationAppearance(cache.globalSettings);

      // 2. Placements
      cache.placements.clear();
      if (placementsSnapRes.status === "fulfilled" && !placementsSnapRes.value.empty) {
        placementsSnapRes.value.forEach((d) => {
          const item = { id: d.id, ...d.data() } as MonetizationPlacement;
          cache.placements.set(item.code, item);
        });
      } else {
        DEFAULT_PLACEMENTS.forEach((p) => cache.placements.set(p.code, p));
      }

      // 3. Configs
      cache.configs.clear();
      if (configsSnapRes.status === "fulfilled" && !configsSnapRes.value.empty) {
        configsSnapRes.value.forEach((d) => {
          const item = { id: d.id, ...d.data() } as MonetizationConfig;
          cache.configs.set(item.placementCode, item);
        });
      } else {
        Object.entries(DEFAULT_CONFIGS).forEach(([code, cfg]) => cache.configs.set(code, cfg));
      }

      // 4. Ad Providers
      cache.adProviders.clear();
      if (adProvSnapRes.status === "fulfilled" && !adProvSnapRes.value.empty) {
        adProvSnapRes.value.forEach((d) => {
          const item = { id: d.id, ...d.data() } as AdProvider;
          cache.adProviders.set(item.id, item);
        });
      } else {
        DEFAULT_AD_PROVIDERS.forEach((p) => cache.adProviders.set(p.id, p));
      }

      // 5. Affiliate Providers
      cache.affiliateProviders.clear();
      if (affProvSnapRes.status === "fulfilled" && !affProvSnapRes.value.empty) {
        affProvSnapRes.value.forEach((d) => {
          if (d.id === "aff_prov_flipkart") return;
          const item = { id: d.id, ...d.data() } as AffiliateProvider;
          if (item.code?.toUpperCase() === "FLIPKART" || item.name?.toLowerCase().includes("flipkart")) return;
          cache.affiliateProviders.set(item.id, item);
        });
      } else {
        DEFAULT_AFFILIATE_PROVIDERS.forEach((p) => cache.affiliateProviders.set(p.id, p));
      }

      // 6. Ad Units
      if (adUnitsSnapRes.status === "fulfilled" && !adUnitsSnapRes.value.empty) {
        const units: AdUnit[] = [];
        adUnitsSnapRes.value.forEach((d) => {
          const u = { id: d.id, ...d.data() } as AdUnit;
          if (!isInternalSitePromotion(u.destinationUrl, u.name, u.providerName)) {
            units.push(u);
          }
        });
        cache.adUnits = units.length > 0 ? units : DEFAULT_AD_UNITS;
      } else {
        cache.adUnits = DEFAULT_AD_UNITS;
      }

      // 7. Affiliate Links
      if (affLinksSnapRes.status === "fulfilled" && !affLinksSnapRes.value.empty) {
        const links: AffiliateLink[] = [];
        affLinksSnapRes.value.forEach((d) => {
          const l = { id: d.id, ...d.data() } as AffiliateLink;
          if (!isInternalSitePromotion(l.destinationUrl, l.title, l.providerName)) {
            links.push(l);
          }
        });
        cache.affiliateLinks = links.length > 0 ? links : DEFAULT_AFFILIATE_LINKS;
      } else {
        cache.affiliateLinks = DEFAULT_AFFILIATE_LINKS;
      }

      cache.lastLoaded = Date.now();
      saveToPersistentStorage(cache);
    } catch (err) {
      console.warn("[MonetizationEngine] Falling back to default data due to fetch error:", err);
      cache.globalSettings = { ...DEFAULT_GLOBAL_SETTINGS };
      cache.placements.clear();
      DEFAULT_PLACEMENTS.forEach((p) => cache.placements.set(p.code, p));
      cache.configs.clear();
      Object.entries(DEFAULT_CONFIGS).forEach(([code, cfg]) => cache.configs.set(code, cfg));
      cache.adProviders.clear();
      DEFAULT_AD_PROVIDERS.forEach((p) => cache.adProviders.set(p.id, p));
      cache.affiliateProviders.clear();
      DEFAULT_AFFILIATE_PROVIDERS.forEach((p) => cache.affiliateProviders.set(p.id, p));
      cache.adUnits = [];
      cache.affiliateLinks = [];
      cache.lastLoaded = Date.now();
      saveToPersistentStorage(cache);
    } finally {
      inFlightFetch = null;
    }
    return cache;
  })();

  return inFlightFetch;
}

/**
 * Seed Firestore with default monetization setup (called from admin panel)
 */
export async function seedDefaultMonetizationData(overwrite = false): Promise<{ success: boolean; message: string }> {
  const firestore = await getDb();
  if (!firestore) throw new Error("Firestore not initialized");

  const { doc, setDoc, getDoc } = await import("firebase/firestore");

  // 1. Global Settings
  const settingsRef = doc(firestore, "settings", "monetization");
  const settingsSnap = await getDoc(settingsRef);
  if (!settingsSnap.exists() || overwrite) {
    await setDoc(settingsRef, DEFAULT_GLOBAL_SETTINGS);
  }

  // 2. Placements & Configs
  for (const placement of DEFAULT_PLACEMENTS) {
    const pRef = doc(firestore, "monetization_placements", placement.id);
    const pSnap = await getDoc(pRef);
    if (!pSnap.exists() || overwrite) {
      await setDoc(pRef, { ...placement, updatedAt: Date.now() });
    }

    const cfg = DEFAULT_CONFIGS[placement.code];
    if (cfg) {
      const cRef = doc(firestore, "monetization_configs", cfg.id);
      const cSnap = await getDoc(cRef);
      if (!cSnap.exists() || overwrite) {
        await setDoc(cRef, { ...cfg, updatedAt: Date.now() });
      }
    }
  }

  // 3. Providers
  for (const prov of DEFAULT_AFFILIATE_PROVIDERS) {
    const ref = doc(firestore, "affiliate_providers", prov.id);
    const snap = await getDoc(ref);
    if (!snap.exists() || overwrite) {
      await setDoc(ref, { ...prov, updatedAt: Date.now() });
    }
  }

  for (const prov of DEFAULT_AD_PROVIDERS) {
    const ref = doc(firestore, "ad_providers", prov.id);
    const snap = await getDoc(ref);
    if (!snap.exists() || overwrite) {
      await setDoc(ref, { ...prov, updatedAt: Date.now() });
    }
  }

  // 4. Links & Units
  for (const link of DEFAULT_AFFILIATE_LINKS) {
    const ref = doc(firestore, "affiliate_links", link.id);
    const snap = await getDoc(ref);
    if (!snap.exists() || overwrite) {
      await setDoc(ref, { ...link, updatedAt: Date.now() });
    }
  }

  for (const unit of DEFAULT_AD_UNITS) {
    const ref = doc(firestore, "ad_units", unit.id);
    const snap = await getDoc(ref);
    if (!snap.exists() || overwrite) {
      await setDoc(ref, { ...unit, updatedAt: Date.now() });
    }
  }

  // Invalidate cache
  await fetchAllMonetizationData(true);

  return { success: true, message: "Monetization defaults successfully synced to Firestore." };
}

// ─────────────────────────────────────────────────────────────────────────────
// Page Rotation & 15-Second Cycle Engine
// ─────────────────────────────────────────────────────────────────────────────
let pageVisitSeed = 0;
let rotationTick = 0;
let dynamicSlotCounter = 12; // Reserves slots 0..11 for standard sidebars
const dynamicPlacementSlots = new Map<string, number>();

if (typeof window !== "undefined") {
  try {
    const savedSeed = sessionStorage.getItem("takeoutfix_monetization_seed");
    if (savedSeed !== null) {
      pageVisitSeed = parseInt(savedSeed, 10) || 0;
    } else {
      pageVisitSeed = Math.floor(Math.random() * 20);
      sessionStorage.setItem("takeoutfix_monetization_seed", String(pageVisitSeed));
    }
  } catch (_) {}

  // 15-Second Universal Rotation Timer across all pages
  setInterval(() => {
    rotationTick = (rotationTick + 1) % 10000;
    try {
      window.dispatchEvent(new CustomEvent("takeoutfix_ad_rotate", { detail: { rotationTick } }));
    } catch (_) {}
  }, 15000);

  // Advance rotation seed on Astro page navigation so ads rotate across pages
  window.addEventListener("astro:page-load", () => {
    pageVisitSeed = (pageVisitSeed + 1) % 1000;
    dynamicSlotCounter = 12;
    dynamicPlacementSlots.clear();
    try {
      sessionStorage.setItem("takeoutfix_monetization_seed", String(pageVisitSeed));
    } catch (_) {}
    try {
      window.dispatchEvent(new CustomEvent("takeoutfix_ad_rotate", { detail: { rotationTick } }));
    } catch (_) {}
  });

  window.addEventListener("popstate", () => {
    dynamicSlotCounter = 12;
    dynamicPlacementSlots.clear();
  });
}

export function getPlacementSlotIndex(placementCode: string): number {
  const numMatch = placementCode.match(/_(\d+)$/);
  if (numMatch) {
    const base = Math.max(0, parseInt(numMatch[1], 10) - 1);
    // Left column slots 1..6 map to 0..5; Right column slots 1..6 map to 6..11
    return placementCode.includes("RIGHT") ? base + 6 : base;
  }
  if (placementCode.includes("TOP")) return 0;
  if (placementCode.includes("MID")) return 1;
  if (placementCode.includes("BOTTOM")) return 2;

  if (!dynamicPlacementSlots.has(placementCode)) {
    dynamicPlacementSlots.set(placementCode, dynamicSlotCounter++);
  }
  return dynamicPlacementSlots.get(placementCode) || 0;
}

export function getPageVisitSeed(): number {
  return pageVisitSeed;
}

export function getRotationTick(): number {
  return rotationTick;
}

/**
 * Core Selection Engine
 * Evaluates placement rules, candidate items, priority rotation, and fallback mechanisms
 */
export async function getMonetizationContent(
  placementCode: string,
  options: {
    preview?: boolean;
    bypassPlanCheck?: boolean;
    userPlan?: string;
    supportWithAds?: boolean;
    forceRefresh?: boolean;
    rotationOffset?: number;
  } = {}
): Promise<MonetizationResponse> {
  const data = await fetchAllMonetizationData(options.forceRefresh);

  const globalSettings = data.globalSettings || DEFAULT_GLOBAL_SETTINGS;

  // 1. Check Global Switch
  if (!globalSettings.enabled && !options.preview) {
    return {
      placement: placementCode,
      enabled: false,
      mode: globalSettings.defaultMode,
      reason: "GLOBAL_DISABLED",
      empty: true,
      adOpacity: globalSettings.adOpacity ?? 80,
      adSize: globalSettings.adSize ?? "small",
    };
  }

  // 2. Check Paid Plan Exemption (if enabled)
  if (
    globalSettings.allowPaidExemption &&
    !options.preview &&
    !options.bypassPlanCheck &&
    (options.userPlan === "super" || options.userPlan === "pro") &&
    !options.supportWithAds
  ) {
    return {
      placement: placementCode,
      enabled: false,
      mode: globalSettings.defaultMode,
      reason: "PAID_USER_EXEMPT",
      empty: true,
      adOpacity: globalSettings.adOpacity ?? 80,
      adSize: globalSettings.adSize ?? "small",
    };
  }

  // 3. Resolve Placement & Configuration
  const placement = data.placements.get(placementCode) || {
    id: placementCode,
    code: placementCode,
    name: placementCode,
    description: "",
    status: "ACTIVE",
  };

  if (placement.status !== "ACTIVE" && !options.preview) {
    return {
      placement: placementCode,
      enabled: false,
      mode: "BOTH",
      reason: "PLACEMENT_INACTIVE",
      empty: true,
    };
  }

  const rawConfig = data.configs.get(placementCode);
  const config: MonetizationConfig =
    rawConfig ||
    DEFAULT_CONFIGS[placementCode] || {
      id: placementCode,
      placementCode,
      displayMode: globalSettings.defaultMode || "BOTH",
      affiliatePercentage: 50,
      adsPercentage: 50,
      fallbackEnabled: globalSettings.fallbackEnabled ?? true,
      affiliateEnabled: true,
      adsEnabled: true,
      status: "ACTIVE",
    };

  const fallback =
    config.fallbackEnabled !== undefined && config.fallbackEnabled !== null
      ? config.fallbackEnabled
      : globalSettings.fallbackEnabled ?? true;

  if (config.status !== "ACTIVE" && !options.preview) {
    return {
      placement: placementCode,
      enabled: false,
      mode: config.displayMode,
      reason: "CONFIG_INACTIVE",
      empty: true,
      fallbackEnabled: fallback,
    };
  }

  // Respect Global Default Display Mode (e.g. AFFILIATE_ONLY or ADS_ONLY) as the baseline
  let mode: DisplayMode = config.displayMode || "BOTH";
  if (globalSettings.defaultMode && globalSettings.defaultMode !== "BOTH") {
    if (mode === "BOTH" || !rawConfig) {
      mode = globalSettings.defaultMode;
    }
  }

  // 4. Gather Candidates
  // Active Affiliate Providers
  const activeAffProviderIds = new Set(
    Array.from(data.affiliateProviders.values())
      .filter((p) => p.status === "ACTIVE")
      .map((p) => p.id)
  );

  const isSidebarPlacement = 
    placementCode.startsWith("SIDEBAR") || 
    placementCode.startsWith("GUTTER") || 
    placementCode.startsWith("TOOL_SIDEBAR");
  const isToolPlacement = placementCode.startsWith("TOOL");
  const slotIndex = getPlacementSlotIndex(placementCode);

  // Filter Active Affiliate Links matching this placement (excluding any site upsells)
  // User directive: In desktop sidebars (GUTTER, SIDEBAR, TOOL_SIDEBAR), STRICTLY NO AFFILIATES, ONLY REAL ADS!
  let affiliateCandidates = isSidebarPlacement ? [] : data.affiliateLinks.filter((l) => {
    if (l.status && l.status !== "ACTIVE") return false;
    if (isInternalSitePromotion(l.destinationUrl, l.title, l.providerName)) return false;
    if (activeAffProviderIds.size > 0 && l.providerId && !activeAffProviderIds.has(l.providerId) && !options.preview) {
      return false;
    }
    const placementCodes = Array.isArray(l.placementCodes) ? l.placementCodes : [];
    if (placementCodes.length === 0) return true;
    return placementCodes.includes(placementCode);
  });

  // If no placement-specific affiliate link matched, fall back to any active affiliate links (non-sidebar only)
  if (!isSidebarPlacement && affiliateCandidates.length === 0 && fallback) {
    const pool = data.affiliateLinks.length > 0 ? data.affiliateLinks : DEFAULT_AFFILIATE_LINKS;
    affiliateCandidates = pool.filter((l) => {
      if (l.status && l.status !== "ACTIVE") return false;
      if (isInternalSitePromotion(l.destinationUrl, l.title, l.providerName)) return false;
      return true;
    });
  }

  // Active Ad Providers
  const activeAdProviderIds = new Set(
    Array.from(data.adProviders.values())
      .filter((p) => p.status === "ACTIVE")
      .map((p) => p.id)
  );

  // Filter Active Ad Units matching this placement (excluding any site upsells)
  let adCandidates = data.adUnits.filter(
    (u) =>
      u.status === "ACTIVE" &&
      !isInternalSitePromotion(u.destinationUrl, u.name, u.providerName) &&
      (options.preview || activeAdProviderIds.has(u.providerId)) &&
      (u.placementCodes.includes(placementCode) ||
       (isSidebarPlacement && (u.placementCodes.includes("SIDEBAR") || u.placementCodes.includes("TOOL_SIDEBAR"))) ||
       u.placementCodes.length === 0)
  );

  // Fallback: If no ad matched this exact placement code, fall back to ANY active ad unit (AADS / AdSense)
  if (adCandidates.length === 0) {
    adCandidates = data.adUnits.filter(
      (u) =>
        u.status === "ACTIVE" &&
        !isInternalSitePromotion(u.destinationUrl, u.name, u.providerName) &&
        (options.preview || activeAdProviderIds.has(u.providerId))
    );
  }
  if (adCandidates.length === 0 && DEFAULT_AD_UNITS.length > 0) {
    adCandidates = DEFAULT_AD_UNITS;
  }

  // 5. Select Best Item per Category (Non-Repeating on same page + Continuously Rotating every 15s)
  const selectTopItem = <T extends { priority: number }>(items: T[], index?: number): T | null => {
    if (items.length === 0) return null;
    const sorted = [...items].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    const targetSlot = index !== undefined && index >= 0 ? index : slotIndex;
    const rotationOffset = options.rotationOffset !== undefined ? options.rotationOffset : (pageVisitSeed + rotationTick);
    // Guaranteed non-repeating cycle: slot 0, 1, 2... each takes a distinct item
    // and continuously rotates every 15 seconds, wrapping around to re-appear in cycle!
    const selectedIndex = (targetSlot + rotationOffset) % sorted.length;
    return sorted[selectedIndex];
  };

  const selectedAffiliateRaw = (config.affiliateEnabled || options.preview) ? selectTopItem(affiliateCandidates, slotIndex) : null;
  const secondaryPool = affiliateCandidates.length > 1
    ? affiliateCandidates.filter((c) => c.id !== selectedAffiliateRaw?.id)
    : DEFAULT_AFFILIATE_LINKS.filter((c) => c.id !== selectedAffiliateRaw?.id);
  const selectedSecondaryAffiliateRaw = (config.affiliateEnabled || options.preview) && secondaryPool.length > 0
    ? selectTopItem(secondaryPool, slotIndex + 1)
    : null;

  const selectedAdRaw = (config.adsEnabled || options.preview) ? selectTopItem(adCandidates, slotIndex) : null;
  const filteredCandidates = adCandidates.filter((c) => c.id !== selectedAdRaw?.id);
  const secondaryAdPool = filteredCandidates.length > 0
    ? filteredCandidates
    : adCandidates.length > 0
    ? adCandidates
    : DEFAULT_AD_UNITS;
  const selectedSecondaryAdRaw = (config.adsEnabled || options.preview) && secondaryAdPool.length > 0
    ? selectTopItem(secondaryAdPool, slotIndex + 1)
    : (selectedAdRaw ? { ...selectedAdRaw, id: `${selectedAdRaw.id}-clone` } : null);

  const selectedAffiliate: ResolvedMonetizationItem | null = selectedAffiliateRaw
    ? {
        id: selectedAffiliateRaw.id,
        type: "AFFILIATE",
        title: selectedAffiliateRaw.title,
        description: selectedAffiliateRaw.description,
        destinationUrl: selectedAffiliateRaw.destinationUrl,
        imageUrl: selectedAffiliateRaw.imageUrl,
        ctaText: selectedAffiliateRaw.ctaText,
        tag: selectedAffiliateRaw.tag,
        isExternal: selectedAffiliateRaw.isExternal,
        providerName: selectedAffiliateRaw.providerName,
      }
    : null;

  const selectedSecondaryAffiliate: ResolvedMonetizationItem | null = selectedSecondaryAffiliateRaw
    ? {
        id: selectedSecondaryAffiliateRaw.id,
        type: "AFFILIATE",
        title: selectedSecondaryAffiliateRaw.title,
        description: selectedSecondaryAffiliateRaw.description,
        destinationUrl: selectedSecondaryAffiliateRaw.destinationUrl,
        imageUrl: selectedSecondaryAffiliateRaw.imageUrl,
        ctaText: selectedSecondaryAffiliateRaw.ctaText,
        tag: selectedSecondaryAffiliateRaw.tag,
        isExternal: selectedSecondaryAffiliateRaw.isExternal,
        providerName: selectedSecondaryAffiliateRaw.providerName,
      }
    : null;

  const selectedAd: ResolvedMonetizationItem | null = selectedAdRaw
    ? {
        id: selectedAdRaw.id,
        type: "AD",
        title: selectedAdRaw.name,
        adType: selectedAdRaw.adType,
        embedCode: selectedAdRaw.embedCode,
        imageUrl: selectedAdRaw.imageUrl,
        destinationUrl: selectedAdRaw.destinationUrl,
        ctaText: selectedAdRaw.ctaText || "Learn More",
        providerName: selectedAdRaw.providerName,
      }
    : null;

  const selectedSecondaryAd: ResolvedMonetizationItem | null = selectedSecondaryAdRaw
    ? {
        id: `${selectedSecondaryAdRaw.id}-sec-${slotIndex}`,
        type: "AD",
        title: selectedSecondaryAdRaw.name,
        adType: selectedSecondaryAdRaw.adType,
        embedCode: selectedSecondaryAdRaw.embedCode,
        imageUrl: selectedSecondaryAdRaw.imageUrl,
        destinationUrl: selectedSecondaryAdRaw.destinationUrl,
        ctaText: selectedSecondaryAdRaw.ctaText || "Learn More",
        providerName: selectedSecondaryAdRaw.providerName,
      }
    : null;

  // 6. Multi-Item Resolution for Horizontal Banners on ALL pages except Tool
  let resolvedItems: ResolvedMonetizationItem[] = [];

  if (!isSidebarPlacement && !isToolPlacement && (config.adsEnabled || options.preview)) {
    // Exactly 4 items divided into 25% each:
    // Slot 1: Ad 1, Slot 2: Ad 2, Slot 3: Ad 3, Slot 4: Ad 4
    const ad1Raw = selectTopItem(adCandidates, slotIndex);
    const ad2Raw = selectTopItem(secondaryAdPool, slotIndex + 1);
    const ad3Raw = selectTopItem(secondaryAdPool, slotIndex + 2);
    const ad4Raw = selectTopItem(secondaryAdPool, slotIndex + 3);

    const affPool = affiliateCandidates.length > 0 ? affiliateCandidates : [];
    const aff1Raw = selectTopItem(affPool, slotIndex);
    const aff2Raw = selectTopItem(affPool, slotIndex + 1);
    const aff3Raw = selectTopItem(affPool, slotIndex + 2);
    const aff4Raw = selectTopItem(affPool, slotIndex + 3);

    const makeAffItem = (raw: typeof selectedAffiliateRaw, suffix: string): ResolvedMonetizationItem | null => {
      if (!raw) return null;
      return {
        id: `${raw.id}-${placementCode}-${suffix}`,
        type: "AFFILIATE",
        title: raw.title,
        description: raw.description,
        destinationUrl: raw.destinationUrl,
        imageUrl: raw.imageUrl,
        ctaText: raw.ctaText || "Shop on Amazon",
        tag: raw.tag,
        isExternal: raw.isExternal,
        providerName: raw.providerName,
      };
    };

    const makeAdItem = (raw: typeof selectedAdRaw, suffix: string, fallbackRaw?: typeof selectedAffiliateRaw): ResolvedMonetizationItem | null => {
      if (!raw) return null;
      return {
        id: `${raw.id}-${placementCode}-${suffix}`,
        type: "AD",
        title: raw.name,
        adType: raw.adType,
        embedCode: raw.embedCode,
        imageUrl: raw.imageUrl,
        destinationUrl: raw.destinationUrl,
        ctaText: raw.ctaText || "Learn More",
        providerName: raw.providerName,
        fallbackItem: fallbackRaw ? makeAffItem(fallbackRaw, `fb-${suffix}`) || undefined : undefined,
      };
    };

    const item1 = makeAdItem(ad1Raw, "1", aff1Raw);
    const item2 = makeAdItem(ad2Raw, "2", aff2Raw);
    const item3 = makeAdItem(ad3Raw, "3", aff3Raw);
    const item4 = makeAdItem(ad4Raw, "4", aff4Raw);

    resolvedItems = [item1, item2, item3, item4].filter(Boolean) as ResolvedMonetizationItem[];
  }

  // 7. Apply Selection Mode & Fallback Logic for standard/tool slots
  let resolvedAffiliate: ResolvedMonetizationItem | null = null;
  let resolvedAd: ResolvedMonetizationItem | null = null;
  let resolvedSecondaryAd: ResolvedMonetizationItem | null = null;

  if (mode === "BOTH" || mode === "ADS_ONLY") {
    if (selectedAd) {
      resolvedAd = selectedAd;
      if (selectedSecondaryAd) {
        resolvedSecondaryAd = selectedSecondaryAd;
      }
    } else if (selectedSecondaryAd) {
      resolvedAd = selectedSecondaryAd;
    }
    if (mode === "BOTH" && selectedAffiliate) {
      resolvedAffiliate = selectedAffiliate;
      if (selectedSecondaryAffiliate) {
        resolvedSecondaryAffiliate = selectedSecondaryAffiliate;
      }
    }
  } else if (mode === "AFFILIATE_ONLY") {
    if (selectedAffiliate) {
      resolvedAffiliate = selectedAffiliate;
    } else if (fallback && selectedAd) {
      resolvedAd = selectedAd;
    }
  }

  // Tool and desktop sidebars never show affiliate deals, ONLY real ads
  if (isSidebarPlacement || isToolPlacement || mode === "ADS_ONLY") {
    resolvedAffiliate = null;
  }

  const isEmpty =
    !resolvedAffiliate &&
    !resolvedAd &&
    !resolvedSecondaryAd &&
    resolvedItems.length === 0;

  return {
    placement: placementCode,
    enabled: true,
    mode,
    affiliate: resolvedAffiliate,
    secondaryAffiliate: selectedSecondaryAffiliate,
    ad: resolvedAd,
    secondaryAd: resolvedSecondaryAd,
    items: resolvedItems.length > 0 ? resolvedItems : undefined,
    empty: isEmpty,
    fallbackEnabled: fallback,
    adOpacity: globalSettings.adOpacity ?? 80,
    adSize: globalSettings.adSize ?? "small",
  };
}
