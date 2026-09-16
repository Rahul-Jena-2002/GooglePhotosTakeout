import React, { useState, useEffect } from "react";
import { db, getDb } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { useToastStore } from "../store/useToastStore";
import {
  fetchAllMonetizationData,
  seedDefaultMonetizationData,
} from "../services/monetization/monetizationEngine";
import type {
  MonetizationPlacement,
  MonetizationConfig,
  AdUnit,
  AffiliateLink,
  AdProvider,
  AffiliateProvider,
  MonetizationGlobalSettings,
} from "../services/monetization/types";
import {
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_PLACEMENTS,
  DEFAULT_CONFIGS,
  DEFAULT_AD_PROVIDERS,
  DEFAULT_AFFILIATE_PROVIDERS,
  DEFAULT_AD_UNITS,
  DEFAULT_AFFILIATE_LINKS,
} from "../services/monetization/defaultData";

import MonetizationOverviewTab from "../components/admin/monetization/MonetizationOverviewTab";
import MonetizationPlacementsTab from "../components/admin/monetization/MonetizationPlacementsTab";
import MonetizationAdsTab from "../components/admin/monetization/MonetizationAdsTab";
import MonetizationAffiliatesTab from "../components/admin/monetization/MonetizationAffiliatesTab";
import MonetizationSimulatorTab from "../components/admin/monetization/MonetizationSimulatorTab";

import {
  Coins,
  Layers,
  Megaphone,
  ShoppingBag,
  Cpu,
  RefreshCw,
} from "lucide-react";

type ActiveTab = "overview" | "placements" | "ads" | "affiliates" | "simulator";

export default function AdminMonetization() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [simulatorTarget, setSimulatorTarget] = useState<string>("ARTICLE_MIDDLE");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [settings, setSettings] = useState<MonetizationGlobalSettings>(DEFAULT_GLOBAL_SETTINGS);
  const [placements, setPlacements] = useState<MonetizationPlacement[]>(DEFAULT_PLACEMENTS);
  const [configs, setConfigs] = useState<Record<string, MonetizationConfig>>(DEFAULT_CONFIGS);
  const [adProviders, setAdProviders] = useState<AdProvider[]>(DEFAULT_AD_PROVIDERS);
  const [affiliateProviders, setAffiliateProviders] = useState<AffiliateProvider[]>(
    DEFAULT_AFFILIATE_PROVIDERS
  );
  const [adUnits, setAdUnits] = useState<AdUnit[]>(DEFAULT_AD_UNITS);
  const [affiliateLinks, setAffiliateLinks] = useState<AffiliateLink[]>(DEFAULT_AFFILIATE_LINKS);

  // Initial load & snapshot sync
  const loadData = async (forceRefresh = false) => {
    try {
      const data = await fetchAllMonetizationData(forceRefresh);
      if (data.globalSettings) setSettings(data.globalSettings);
      if (data.placements.size > 0) setPlacements(Array.from(data.placements.values()));
      if (data.configs.size > 0) {
        const cfgObj: Record<string, MonetizationConfig> = {};
        data.configs.forEach((v, k) => (cfgObj[k] = v));
        setConfigs(cfgObj);
      }
      if (data.adProviders.size > 0) setAdProviders(Array.from(data.adProviders.values()));
      if (data.affiliateProviders.size > 0)
        setAffiliateProviders(Array.from(data.affiliateProviders.values()));
      if (data.adUnits.length > 0) setAdUnits(data.adUnits);
      if (data.affiliateLinks.length > 0) setAffiliateLinks(data.affiliateLinks);
    } catch (err: any) {
      console.warn("Failed to fetch monetization data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // ── Global Settings Handlers ──
  const updateGlobalSettings = async (nextSettings: MonetizationGlobalSettings) => {
    setSaving(true);
    try {
      const firestore = await getDb();
      const { doc, setDoc } = await import("firebase/firestore");
      await setDoc(doc(firestore, "settings", "monetization"), {
        ...nextSettings,
        updatedAt: Date.now(),
      });
      setSettings(nextSettings);
      useToastStore.getState().addToast("Global monetization settings updated", "success");
      await loadData(true);
    } catch (err: any) {
      useToastStore.getState().addToast("Failed to update settings: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleGlobalSwitch = () => {
    updateGlobalSettings({ ...settings, enabled: !settings.enabled });
  };

  const handleUpdateDefaultMode = (mode: "BOTH" | "AFFILIATE_ONLY" | "ADS_ONLY") => {
    updateGlobalSettings({ ...settings, defaultMode: mode });
  };

  const handleToggleFallback = () => {
    updateGlobalSettings({ ...settings, fallbackEnabled: !settings.fallbackEnabled });
  };

  const handleTogglePaidExemption = () => {
    updateGlobalSettings({ ...settings, allowPaidExemption: !settings.allowPaidExemption });
  };

  const handleSeedDefaults = async () => {
    if (!confirm("This will seed Firestore with default placements and affiliate deals. Proceed?"))
      return;
    setSaving(true);
    try {
      const res = await seedDefaultMonetizationData(true);
      useToastStore.getState().addToast(res.message, "success");
      await loadData(true);
    } catch (err: any) {
      useToastStore.getState().addToast("Seeding failed: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  // ── Placements & Rules Handlers ──
  const handleSavePlacement = async (placement: MonetizationPlacement, config: MonetizationConfig) => {
    setSaving(true);
    try {
      const firestore = await getDb();
      const { doc, setDoc } = await import("firebase/firestore");

      await setDoc(doc(firestore, "monetization_placements", placement.id), {
        ...placement,
        updatedAt: Date.now(),
      });
      await setDoc(doc(firestore, "monetization_configs", config.id), {
        ...config,
        updatedAt: Date.now(),
      });

      useToastStore.getState().addToast(`Saved placement ${placement.code}`, "success");
      await loadData(true);
    } catch (err: any) {
      useToastStore.getState().addToast("Failed to save placement: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePlacementStatus = async (placementCode: string) => {
    const existing = placements.find((p) => p.code === placementCode);
    if (!existing) return;
    const nextStatus = existing.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const updated = { ...existing, status: nextStatus };
    const existingCfg = configs[placementCode] || {
      id: placementCode,
      placementCode,
      displayMode: "BOTH",
      affiliatePercentage: 50,
      adsPercentage: 50,
      fallbackEnabled: true,
      affiliateEnabled: true,
      adsEnabled: true,
      status: nextStatus,
    };
    await handleSavePlacement(updated, { ...existingCfg, status: nextStatus });
  };

  // ── Ad Handlers ──
  const handleSaveAdUnit = async (unit: AdUnit) => {
    setSaving(true);
    try {
      const firestore = await getDb();
      const { doc, setDoc } = await import("firebase/firestore");
      await setDoc(doc(firestore, "ad_units", unit.id), {
        ...unit,
        updatedAt: Date.now(),
      });
      useToastStore.getState().addToast(`Saved ad unit "${unit.name}"`, "success");
      await loadData(true);
    } catch (err: any) {
      useToastStore.getState().addToast("Failed to save ad unit: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAdUnit = async (unitId: string) => {
    if (!confirm("Are you sure you want to delete this ad unit?")) return;
    setSaving(true);
    try {
      const firestore = await getDb();
      const { doc, deleteDoc } = await import("firebase/firestore");
      await deleteDoc(doc(firestore, "ad_units", unitId));
      useToastStore.getState().addToast("Ad unit deleted", "success");
      await loadData(true);
    } catch (err: any) {
      useToastStore.getState().addToast("Failed to delete ad unit: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAdUnitStatus = async (unitId: string) => {
    const unit = adUnits.find((u) => u.id === unitId);
    if (!unit) return;
    const nextStatus = unit.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    await handleSaveAdUnit({ ...unit, status: nextStatus });
  };

  const handleSaveAdProvider = async (provider: AdProvider) => {
    setSaving(true);
    try {
      const firestore = await getDb();
      const { doc, setDoc } = await import("firebase/firestore");
      await setDoc(doc(firestore, "ad_providers", provider.id), {
        ...provider,
        updatedAt: Date.now(),
      });
      useToastStore.getState().addToast(`Saved network ${provider.name}`, "success");
      await loadData(true);
    } catch (err: any) {
      useToastStore.getState().addToast("Failed to save provider: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAdProviderStatus = async (providerId: string) => {
    const prov = adProviders.find((p) => p.id === providerId);
    if (!prov) return;
    const nextStatus = prov.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    await handleSaveAdProvider({ ...prov, status: nextStatus });
  };

  // ── Affiliate Handlers ──
  const handleSaveAffiliateLink = async (link: AffiliateLink) => {
    setSaving(true);
    try {
      const firestore = await getDb();
      const { doc, setDoc } = await import("firebase/firestore");
      await setDoc(doc(firestore, "affiliate_links", link.id), {
        ...link,
        updatedAt: Date.now(),
      });
      useToastStore.getState().addToast(`Saved affiliate deal "${link.title}"`, "success");
      await loadData(true);
    } catch (err: any) {
      useToastStore.getState().addToast("Failed to save affiliate link: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAffiliateLink = async (linkId: string) => {
    if (!confirm("Are you sure you want to delete this affiliate link?")) return;
    setSaving(true);
    try {
      const firestore = await getDb();
      const { doc, deleteDoc } = await import("firebase/firestore");
      await deleteDoc(doc(firestore, "affiliate_links", linkId));
      useToastStore.getState().addToast("Affiliate link deleted", "success");
      await loadData(true);
    } catch (err: any) {
      useToastStore.getState().addToast("Failed to delete affiliate link: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAffiliateLinkStatus = async (linkId: string) => {
    const link = affiliateLinks.find((l) => l.id === linkId);
    if (!link) return;
    const nextStatus = link.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    await handleSaveAffiliateLink({ ...link, status: nextStatus });
  };

  const handleSaveAffiliateProvider = async (provider: AffiliateProvider) => {
    setSaving(true);
    try {
      const firestore = await getDb();
      const { doc, setDoc } = await import("firebase/firestore");
      await setDoc(doc(firestore, "affiliate_providers", provider.id), {
        ...provider,
        updatedAt: Date.now(),
      });
      useToastStore.getState().addToast(`Saved affiliate account ${provider.name}`, "success");
      await loadData(true);
    } catch (err: any) {
      useToastStore.getState().addToast("Failed to save affiliate provider: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAffiliateProviderStatus = async (providerId: string) => {
    const prov = affiliateProviders.find((p) => p.id === providerId);
    if (!prov) return;
    const nextStatus = prov.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    await handleSaveAffiliateProvider({ ...prov, status: nextStatus });
  };

  const handleNavigateToSimulator = (placementCode: string) => {
    setSimulatorTarget(placementCode);
    setActiveTab("simulator");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-zinc-500 gap-3">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span>Loading Monetization Operations Center...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* ─── Top Header ─── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Coins className="w-4 h-4" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white tracking-tight">
              Monetization Operations Center
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            Decoupled architecture for AdSense, Media.net, Amazon, Flipkart, and In-House sponsors.
          </p>
        </div>

        {/* Global indicator */}
        <div className="flex items-center gap-2">
          <div
            className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-bold flex items-center gap-2 ${
              settings.enabled
                ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400"
                : "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-400"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                settings.enabled ? "bg-emerald-500 animate-pulse" : "bg-red-500"
              }`}
            />
            <span>{settings.enabled ? "MONETIZATION: ON" : "MONETIZATION: OFF"}</span>
          </div>
        </div>
      </div>

      {/* ─── Navigation Tabs ─── */}
      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab("overview")}
          className={`btn-admin-tab ${
            activeTab === "overview" ? "btn-admin-tab-active" : "btn-admin-tab-inactive"
          }`}
        >
          <Coins className="w-3.5 h-3.5" />
          <span>Overview</span>
        </button>

        <button
          onClick={() => setActiveTab("placements")}
          className={`btn-admin-tab ${
            activeTab === "placements" ? "btn-admin-tab-active" : "btn-admin-tab-inactive"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Placements & Rules ({placements.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("ads")}
          className={`btn-admin-tab ${
            activeTab === "ads" ? "btn-admin-tab-active" : "btn-admin-tab-inactive"
          }`}
        >
          <Megaphone className="w-3.5 h-3.5" />
          <span>Advertisements ({adUnits.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("affiliates")}
          className={`btn-admin-tab ${
            activeTab === "affiliates" ? "btn-admin-tab-active" : "btn-admin-tab-inactive"
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>Affiliates ({affiliateLinks.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("simulator")}
          className={`btn-admin-tab ${
            activeTab === "simulator" ? "btn-admin-tab-active" : "btn-admin-tab-inactive"
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>Simulator & Inspector</span>
        </button>
      </div>

      {/* ─── Active Tab Content ─── */}
      {activeTab === "overview" && (
        <MonetizationOverviewTab
          settings={settings}
          placements={placements}
          adUnits={adUnits}
          affiliateLinks={affiliateLinks}
          adProviders={adProviders}
          affiliateProviders={affiliateProviders}
          onToggleGlobalSwitch={handleToggleGlobalSwitch}
          onUpdateDefaultMode={handleUpdateDefaultMode}
          onToggleFallback={handleToggleFallback}
          onTogglePaidExemption={handleTogglePaidExemption}
          onSeedDefaults={handleSeedDefaults}
          saving={saving}
        />
      )}

      {activeTab === "placements" && (
        <MonetizationPlacementsTab
          placements={placements}
          configs={configs}
          adUnits={adUnits}
          affiliateLinks={affiliateLinks}
          onSavePlacement={handleSavePlacement}
          onTogglePlacementStatus={handleTogglePlacementStatus}
          onNavigateToSimulator={handleNavigateToSimulator}
          saving={saving}
        />
      )}

      {activeTab === "ads" && (
        <MonetizationAdsTab
          adProviders={adProviders}
          adUnits={adUnits}
          placements={placements}
          onSaveAdUnit={handleSaveAdUnit}
          onDeleteAdUnit={handleDeleteAdUnit}
          onToggleAdUnitStatus={handleToggleAdUnitStatus}
          onSaveAdProvider={handleSaveAdProvider}
          onToggleAdProviderStatus={handleToggleAdProviderStatus}
          saving={saving}
        />
      )}

      {activeTab === "affiliates" && (
        <MonetizationAffiliatesTab
          affiliateProviders={affiliateProviders}
          affiliateLinks={affiliateLinks}
          placements={placements}
          onSaveAffiliateLink={handleSaveAffiliateLink}
          onDeleteAffiliateLink={handleDeleteAffiliateLink}
          onToggleAffiliateLinkStatus={handleToggleAffiliateLinkStatus}
          onSaveAffiliateProvider={handleSaveAffiliateProvider}
          onToggleAffiliateProviderStatus={handleToggleAffiliateProviderStatus}
          saving={saving}
        />
      )}

      {activeTab === "simulator" && (
        <MonetizationSimulatorTab
          placements={placements}
          configs={configs}
          adUnits={adUnits}
          affiliateLinks={affiliateLinks}
          initialPlacementCode={simulatorTarget}
        />
      )}
    </div>
  );
}
