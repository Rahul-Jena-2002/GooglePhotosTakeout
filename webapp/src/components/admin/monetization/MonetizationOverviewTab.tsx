import React from "react";
import type {
  MonetizationGlobalSettings,
  MonetizationPlacement,
  AdUnit,
  AffiliateLink,
  AdProvider,
  AffiliateProvider,
} from "../../../services/monetization/types";
import {
  Layers,
  Megaphone,
  ShoppingBag,
  Cpu,
  Power,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  Sparkles,
  Sliders,
} from "lucide-react";

interface OverviewTabProps {
  settings: MonetizationGlobalSettings;
  placements: MonetizationPlacement[];
  adUnits: AdUnit[];
  affiliateLinks: AffiliateLink[];
  adProviders: AdProvider[];
  affiliateProviders: AffiliateProvider[];
  onToggleGlobalSwitch: () => void;
  onUpdateDefaultMode: (mode: "BOTH" | "AFFILIATE_ONLY" | "ADS_ONLY") => void;
  onToggleFallback: () => void;
  onTogglePaidExemption: () => void;
  onSeedDefaults: () => void;
  saving: boolean;
}

export default function MonetizationOverviewTab({
  settings,
  placements,
  adUnits,
  affiliateLinks,
  adProviders,
  affiliateProviders,
  onToggleGlobalSwitch,
  onUpdateDefaultMode,
  onToggleFallback,
  onTogglePaidExemption,
  onSeedDefaults,
  saving,
}: OverviewTabProps) {
  const activePlacements = placements.filter((p) => p.status === "ACTIVE").length;
  const activeAdUnits = adUnits.filter((u) => u.status === "ACTIVE").length;
  const activeAffiliates = affiliateLinks.filter((l) => l.status === "ACTIVE").length;
  const activeAdProvCount = adProviders.filter((p) => p.status === "ACTIVE").length;
  const activeAffProvCount = affiliateProviders.filter((p) => p.status === "ACTIVE").length;

  return (
    <div className="space-y-6">
      {/* Master Status & Kill Switch Hero Card */}
      <div
        className={`p-6 rounded-2xl border transition-all duration-300 admin-panel-card ${
          settings.enabled
            ? "border-zinc-200 dark:border-zinc-800"
            : "border-red-500/30 dark:border-red-900/50"
        }`}
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-3 h-3 rounded-full ${
                  settings.enabled ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                }`}
              />
              <span className="text-xs font-mono uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                System Status
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  settings.enabled
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                    : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                }`}
              >
                {settings.enabled ? "Online & Serving" : "Monetization Killed (Offline)"}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white tracking-tight">
              Global Monetization Master Switch
            </h2>
            <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
              Instantly toggle all advertising and affiliate content site-wide without needing to
              redeploy or edit templates. When switched off, all placements silently collapse.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onToggleGlobalSwitch}
              disabled={saving}
              className={`px-5 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2.5 ${
                settings.enabled
                  ? "bg-emerald-500 hover:bg-emerald-400 text-black active:scale-95 cursor-pointer shadow-sm"
                  : "bg-red-600 hover:bg-red-500 text-white active:scale-95 cursor-pointer shadow-sm"
              }`}
            >
              <Power className="w-4 h-4" />
              <span>{settings.enabled ? "Active (Click to Turn OFF)" : "Killed (Click to Turn ON)"}</span>
            </button>
          </div>
        </div>

        {/* Global Controls Row */}
        <div className="mt-6 pt-6 border-t border-zinc-200 dark:border-zinc-800 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          {/* Default Mode Selector */}
          <div className="p-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-2">
            <div className="text-zinc-700 dark:text-zinc-400 font-semibold flex items-center justify-between">
              <span>Default Display Mode</span>
              <Sliders className="w-3.5 h-3.5 text-zinc-500" />
            </div>
            <div className="grid grid-cols-3 gap-1 bg-zinc-200/70 dark:bg-zinc-900 p-1 rounded-lg border border-zinc-300 dark:border-zinc-800">
              {(["BOTH", "AFFILIATE_ONLY", "ADS_ONLY"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => onUpdateDefaultMode(mode)}
                  className={`py-1 rounded text-[10px] font-bold uppercase transition-all ${
                    settings.defaultMode === mode
                      ? "bg-white dark:bg-zinc-100 text-zinc-900 dark:text-black shadow-sm"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                  }`}
                >
                  {mode === "BOTH" ? "Both" : mode === "AFFILIATE_ONLY" ? "Affiliate" : "Ads"}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-zinc-500">
              Baseline fallback mode for placements without explicit custom rules.
            </p>
          </div>

          {/* Automatic Fallback Toggle */}
          <div className="p-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl flex flex-col justify-between space-y-2">
            <div>
              <div className="text-zinc-700 dark:text-zinc-400 font-semibold flex items-center justify-between">
                <span>Automatic Fallback Engine</span>
                <button onClick={onToggleFallback} className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer">
                  {settings.fallbackEnabled ? (
                    <ToggleRight className="w-6 h-6 text-emerald-500 dark:text-emerald-400" />
                  ) : (
                    <ToggleLeft className="w-6 h-6 text-zinc-400 dark:text-zinc-600" />
                  )}
                </button>
              </div>
              <p className="text-[10px] text-zinc-500 mt-1">
                If an ad or affiliate link is missing or inactive, expand the available one to 100%
                to prevent empty whitespace.
              </p>
            </div>
            <div className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-medium">
              {settings.fallbackEnabled ? "✓ Active (Smart Collapse & Expand)" : "✗ Strict Mode"}
            </div>
          </div>

          {/* Paid Plan Ad-Free Exemption */}
          <div className="p-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl flex flex-col justify-between space-y-2">
            <div>
              <div className="text-zinc-700 dark:text-zinc-400 font-semibold flex items-center justify-between">
                <span>Super Tier Ad Exemption</span>
                <button onClick={onTogglePaidExemption} className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer">
                  {settings.allowPaidExemption ? (
                    <ToggleRight className="w-6 h-6 text-emerald-500 dark:text-emerald-400" />
                  ) : (
                    <ToggleLeft className="w-6 h-6 text-zinc-400 dark:text-zinc-600" />
                  )}
                </button>
              </div>
              <p className="text-[10px] text-zinc-500 mt-1">
                Subscribers on Super tier will not see advertisements unless they opted in.
              </p>
            </div>
            <div className="text-[10px] font-mono text-zinc-600 dark:text-zinc-400 font-medium">
              {settings.allowPaidExemption ? "✓ Super Users Ad-Free" : "Show to All Users"}
            </div>
          </div>
        </div>
      </div>

      {/* Telemetry Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl admin-panel-card space-y-2">
          <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400">
            <span className="text-xs font-semibold">Active Placements</span>
            <Layers className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-zinc-900 dark:text-white">{activePlacements}</span>
            <span className="text-[11px] text-zinc-500">/ {placements.length} registered</span>
          </div>
          <p className="text-[10px] text-zinc-500">ARTICLE, HOMEPAGE & SIDEBAR slots</p>
        </div>

        <div className="p-4 rounded-xl admin-panel-card space-y-2">
          <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400">
            <span className="text-xs font-semibold">Active Ad Units</span>
            <Megaphone className="w-4 h-4 text-blue-500 dark:text-blue-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-zinc-900 dark:text-white">{activeAdUnits}</span>
            <span className="text-[11px] text-zinc-500">/ {adUnits.length} total units</span>
          </div>
          <p className="text-[10px] text-zinc-500">Across {activeAdProvCount} active networks</p>
        </div>

        <div className="p-4 rounded-xl admin-panel-card space-y-2">
          <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400">
            <span className="text-xs font-semibold">Active Affiliates</span>
            <ShoppingBag className="w-4 h-4 text-amber-500 dark:text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-zinc-900 dark:text-white">{activeAffiliates}</span>
            <span className="text-[11px] text-zinc-500">/ {affiliateLinks.length} total deals</span>
          </div>
          <p className="text-[10px] text-zinc-500">Across {activeAffProvCount} partner accounts</p>
        </div>

        <div className="p-4 rounded-xl admin-panel-card space-y-2">
          <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400">
            <span className="text-xs font-semibold">Decoupling Index</span>
            <Cpu className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">100%</span>
            <span className="text-[11px] text-zinc-500">Dynamic API</span>
          </div>
          <p className="text-[10px] text-zinc-500">0 Hardcoded Providers in templates</p>
        </div>
      </div>

      {/* Architecture Highlights & Quick Setup Helper */}
      <div className="p-5 rounded-xl admin-panel-card flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500 dark:text-amber-400" />
            Initialize / Sync Default Datasets
          </h3>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-xl">
            Populates Firestore with pre-configured placements (ARTICLE_TOP, ARTICLE_MIDDLE, SIDEBAR,
            etc.), 14 high-converting affiliate deals, and sample custom ad units.
          </p>
        </div>
        <button
          onClick={onSeedDefaults}
          disabled={saving}
          className="btn-admin-primary shrink-0 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${saving ? "animate-spin" : ""}`} />
          <span>Sync Default Placements & Deals</span>
        </button>
      </div>
    </div>
  );
}
