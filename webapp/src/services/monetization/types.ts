/**
 * Monetization Architecture - Types & Schemas
 */

export type MonetizationStatus = "ACTIVE" | "INACTIVE";

export type DisplayMode = "AFFILIATE_ONLY" | "ADS_ONLY" | "BOTH";

export type AdType = "DISPLAY" | "HTML" | "SCRIPT" | "IFRAME" | "IMAGE" | "NATIVE";

export interface AdProvider {
  id: string;
  name: string;
  code: string; // e.g. "GOOGLE_ADSENSE", "MEDIA_NET", "CUSTOM"
  status: MonetizationStatus;
  notes?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface AdUnit {
  id: string;
  providerId: string;
  providerName?: string;
  name: string;
  adType: AdType;
  embedCode?: string;
  imageUrl?: string;
  destinationUrl?: string;
  ctaText?: string;
  status: MonetizationStatus;
  priority: number; // Higher number = higher priority
  placementCodes: string[]; // e.g. ["ARTICLE_MIDDLE", "SIDEBAR"]
  targetBlank?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface AffiliateProvider {
  id: string;
  name: string;
  code: string; // e.g. "AMAZON", "FLIPKART", "CUELINKS", "IMPACT", "CUSTOM"
  status: MonetizationStatus;
  tag?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface AffiliateLink {
  id: string;
  providerId: string;
  providerName?: string;
  title: string;
  description: string;
  destinationUrl: string;
  imageUrl?: string;
  ctaText: string;
  tag?: string;
  status: MonetizationStatus;
  priority: number; // Higher number = higher priority
  placementCodes: string[]; // e.g. ["ARTICLE_MIDDLE", "HOMEPAGE_TOP"]
  isExternal?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface MonetizationPlacement {
  id: string;
  code: string; // e.g. "ARTICLE_TOP", "ARTICLE_MIDDLE", "ARTICLE_BOTTOM", "SIDEBAR", "HOMEPAGE_TOP", "HOMEPAGE_MIDDLE", "HOMEPAGE_BOTTOM", "TOOL_BOTTOM", "SEARCH_RESULTS"
  name: string;
  description: string;
  status: MonetizationStatus;
  createdAt?: number;
  updatedAt?: number;
}

export interface MonetizationConfig {
  id: string; // usually same as placementCode or doc id
  placementCode: string;
  displayMode: DisplayMode;
  affiliatePercentage: number; // 0 - 100
  adsPercentage: number; // 0 - 100
  fallbackEnabled: boolean; // if true and one is empty, the other expands or serves as backup
  affiliateEnabled: boolean;
  adsEnabled: boolean;
  status: MonetizationStatus;
  updatedAt?: number;
}

export interface MonetizationGlobalSettings {
  enabled: boolean; // Master Kill Switch
  defaultMode: DisplayMode;
  fallbackEnabled: boolean;
  allowPaidExemption: boolean; // If paid Pro/Super users can bypass ads
  updatedAt?: number;
}

export interface ResolvedMonetizationItem {
  id: string;
  type: "AFFILIATE" | "AD";
  title?: string;
  description?: string;
  destinationUrl?: string;
  imageUrl?: string;
  ctaText?: string;
  tag?: string;
  isExternal?: boolean;
  providerName?: string;
  // Ad-specific fields
  adType?: AdType;
  embedCode?: string;
}

export interface MonetizationResponse {
  placement: string;
  enabled: boolean;
  mode: DisplayMode;
  reason?: string;
  affiliate?: ResolvedMonetizationItem | null;
  ad?: ResolvedMonetizationItem | null;
  empty?: boolean;
  fallbackEnabled?: boolean;
}
