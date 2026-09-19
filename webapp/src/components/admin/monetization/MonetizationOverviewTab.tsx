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
  onUpdateAppearance: (opacity: number, size: "small" | "medium" | "large") => void;
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
  onUpdateAppearance,
  onSeedDefaults,
  saving,
}: OverviewTabProps) {
  const activePlacements = placements.filter((p) => p.status === "ACTIVE").length;
  const activeAdUnits = adUnits.filter((u) => u.status === "ACTIVE").length;
  const activeAffiliates = affiliateLinks.filter((l) => l.status === "ACTIVE").length;
  const activeAdProvCount = adProviders.filter((p) => p.status === "ACTIVE").length;
  const activeAffProvCount = affiliateProviders.filter((p) => p.status === "ACTIVE").length;

  const [localOpacity, setLocalOpacity] = React.useState<number>(settings.adOpacity ?? 80);
  const [localSize, setLocalSize] = React.useState<"small" | "medium" | "large">(settings.adSize ?? "small");

  React.useEffect(() => {
    if (settings.adOpacity !== undefined) setLocalOpacity(settings.adOpacity);
    if (settings.adSize) setLocalSize(settings.adSize);
  }, [settings.adOpacity, settings.adSize]);

  const hasAppearanceChanges =
    localOpacity !== (settings.adOpacity ?? 80) ||
    localSize !== (settings.adSize ?? "small");

  const handleSaveAppearance = () => {
    onUpdateAppearance(localOpacity, localSize);
  };

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

        {/* ─── Ad Appearance & Sizing Controls (Opacity & Dimensions) ─── */}
        <div className="mt-6 pt-6 border-t border-zinc-200 dark:border-zinc-800">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-purple-500" />
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Ad Appearance & Sizing Configuration
                </h3>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Fine-tune ad opacity, dimensions, and visual impact across all website pages.
              </p>
            </div>
            {hasAppearanceChanges && (
              <button
                onClick={handleSaveAppearance}
                disabled={saving}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Save Appearance ({localOpacity}% · {localSize})</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left Column: Opacity & Sizing Controls */}
            <div className="lg:col-span-7 space-y-4">
              {/* Opacity Slider Card */}
              <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-zinc-800 dark:text-zinc-200">
                    <span>Ad Resting Opacity</span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-bold">
                      {localOpacity}%
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-400">
                    Smoothly animates to 100% on hover
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-zinc-400">30%</span>
                  <input
                    type="range"
                    min={30}
                    max={100}
                    step={5}
                    value={localOpacity}
                    onChange={(e) => setLocalOpacity(Number(e.target.value))}
                    className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-600"
                  />
                  <span className="text-[10px] font-mono text-zinc-400">100%</span>
                </div>

                {/* Opacity Presets */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] font-semibold text-zinc-400 mr-1">Presets:</span>
                  {[50, 60, 70, 80, 90, 100].map((preset) => (
                    <button
                      key={preset}
                      onClick={() => {
                        setLocalOpacity(preset);
                        onUpdateAppearance(preset, localSize);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[10.5px] font-mono font-bold transition-all ${
                        localOpacity === preset
                          ? "bg-purple-600 text-white shadow-xs"
                          : "bg-zinc-200/70 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                      }`}
                    >
                      {preset}%{preset === 80 ? " (Default)" : preset === 100 ? " (Solid)" : ""}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sizing Preset Selector */}
              <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                    Ad Dimensions & Scale Preset
                  </span>
                  <span className="text-[10px] text-zinc-400">Controls gutter width and media height</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    {
                      key: "small" as const,
                      label: "Small (Compact)",
                      width: "220px / 250px",
                      desc: "Subtle & non-intrusive",
                    },
                    {
                      key: "medium" as const,
                      label: "Medium (Standard)",
                      width: "260px / 290px",
                      desc: "Balanced presence",
                    },
                    {
                      key: "large" as const,
                      label: "Large (Expanded)",
                      width: "300px / 330px",
                      desc: "Prominent spotlight",
                    },
                  ].map((sz) => (
                    <button
                      key={sz.key}
                      onClick={() => {
                        setLocalSize(sz.key);
                        onUpdateAppearance(localOpacity, sz.key);
                      }}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        localSize === sz.key
                          ? "border-purple-500 bg-purple-500/10 shadow-xs ring-1 ring-purple-500"
                          : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white/50 dark:bg-zinc-900/40"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-bold text-zinc-900 dark:text-white">
                          {sz.label}
                        </span>
                        {localSize === sz.key && (
                          <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span>
                        )}
                      </div>
                      <p className="text-[10px] font-mono text-purple-600 dark:text-purple-400 font-semibold">
                        {sz.width}
                      </p>
                      <p className="text-[9.5px] text-zinc-500 mt-0.5 leading-tight">{sz.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Live Interactive Mockup */}
            <div className="lg:col-span-5 flex flex-col">
              <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl h-full flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  <span>Live Appearance Mockup</span>
                  <span className="text-[10px] text-zinc-400 font-normal">Hover to preview full opacity</span>
                </div>

                {/* Simulated Ad Card */}
                <div className="flex items-center justify-center p-3 bg-zinc-200/40 dark:bg-zinc-900/60 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800">
                  <div
                    style={{ opacity: localOpacity / 100 }}
                    className={`transition-all duration-200 hover:!opacity-100 rounded-xl border border-zinc-300 dark:border-white/10 bg-white dark:bg-zinc-900 p-2.5 shadow-sm text-left ${
                      localSize === "small"
                        ? "w-[200px]"
                        : localSize === "medium"
                        ? "w-[230px]"
                        : "w-[260px]"
                    }`}
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-zinc-200 dark:border-zinc-800 mb-2">
                      <span className="text-[8px] font-bold uppercase text-amber-500 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                        Sponsored Deal
                      </span>
                      <span className="text-[7.5px] font-mono text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">
                        Ad
                      </span>
                    </div>

                    <div className="w-full bg-zinc-100 dark:bg-zinc-800/80 rounded-lg flex items-center justify-center text-zinc-400 text-xs mb-2 transition-all overflow-hidden"
                         style={{ height: localSize === "small" ? "56px" : localSize === "medium" ? "64px" : "80px" }}>
                      <span className="text-[10px] font-mono">Product Preview</span>
                    </div>

                    <h4 className="text-[11px] font-bold text-zinc-900 dark:text-white truncate">
                      SanDisk 1TB Extreme Portable SSD
                    </h4>
                    <p className="text-[9.5px] text-zinc-500 dark:text-zinc-400 line-clamp-1 mt-0.5">
                      High-speed external backup storage
                    </p>
                    <div className="mt-2 pt-1.5 border-t border-zinc-200/60 dark:border-zinc-800 flex items-center justify-between">
                      <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                        In Stock
                      </span>
                      <span className="text-[9.5px] font-bold text-purple-600 dark:text-purple-400">
                        Check Offer →
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1">
                  <span>Effective Gutter: {localSize === "small" ? "220px (250px 2xl)" : localSize === "medium" ? "260px (290px 2xl)" : "300px (330px 2xl)"}</span>
                  <span className="font-mono">Opacity: {localOpacity}%</span>
                </div>
              </div>
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
