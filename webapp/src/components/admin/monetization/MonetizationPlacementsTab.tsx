import React, { useState } from "react";
import type {
  MonetizationPlacement,
  MonetizationConfig,
  AdUnit,
  AffiliateLink,
} from "../../../services/monetization/types";
import {
  Layers,
  Plus,
  Edit2,
  ToggleLeft,
  ToggleRight,
  Play,
  Save,
  X,
} from "lucide-react";

interface PlacementsTabProps {
  placements: MonetizationPlacement[];
  configs: Record<string, MonetizationConfig>;
  adUnits: AdUnit[];
  affiliateLinks: AffiliateLink[];
  onSavePlacement: (placement: MonetizationPlacement, config: MonetizationConfig) => Promise<void>;
  onTogglePlacementStatus: (placementCode: string) => Promise<void>;
  onNavigateToSimulator: (placementCode: string) => void;
  saving: boolean;
}

export default function MonetizationPlacementsTab({
  placements,
  configs,
  adUnits,
  affiliateLinks,
  onSavePlacement,
  onTogglePlacementStatus,
  onNavigateToSimulator,
  saving,
}: PlacementsTabProps) {
  const [editingPlacement, setEditingPlacement] = useState<MonetizationPlacement | null>(null);
  const [editingConfig, setEditingConfig] = useState<MonetizationConfig | null>(null);
  const [isNew, setIsNew] = useState(false);

  const openNewModal = () => {
    const newCode = `PLACEMENT_${Date.now().toString().slice(-4)}`;
    setIsNew(true);
    setEditingPlacement({
      id: newCode,
      code: newCode,
      name: "",
      description: "",
      status: "ACTIVE",
    });
    setEditingConfig({
      id: newCode,
      placementCode: newCode,
      displayMode: "BOTH",
      affiliatePercentage: 50,
      adsPercentage: 50,
      fallbackEnabled: true,
      affiliateEnabled: true,
      adsEnabled: true,
      status: "ACTIVE",
    });
  };

  const openEditModal = (placement: MonetizationPlacement) => {
    setIsNew(false);
    setEditingPlacement({ ...placement });
    const existingCfg = configs[placement.code] || {
      id: placement.code,
      placementCode: placement.code,
      displayMode: "BOTH",
      affiliatePercentage: 50,
      adsPercentage: 50,
      fallbackEnabled: true,
      affiliateEnabled: true,
      adsEnabled: true,
      status: "ACTIVE",
    };
    setEditingConfig({ ...existingCfg });
  };

  const handleModalSave = async () => {
    if (!editingPlacement || !editingConfig) return;
    if (!editingPlacement.code.trim()) {
      alert("Placement code is required");
      return;
    }
    const cleanPlacement = {
      ...editingPlacement,
      code: editingPlacement.code.trim().toUpperCase().replace(/\s+/g, "_"),
    };
    const cleanConfig = {
      ...editingConfig,
      placementCode: cleanPlacement.code,
      id: cleanPlacement.code,
    };
    await onSavePlacement(cleanPlacement, cleanConfig);
    setEditingPlacement(null);
    setEditingConfig(null);
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl admin-panel-card">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
            Monetization Placements & Display Rules
          </h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
            Configure site placements, display modes (Both vs Affiliate Only vs Ads Only), and fallback behavior.
          </p>
        </div>
        <button
          onClick={openNewModal}
          disabled={saving}
          className="btn-admin-primary shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Placement</span>
        </button>
      </div>

      {/* Placements Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {placements.map((placement) => {
          const cfg = configs[placement.code] || {
            displayMode: "BOTH",
            affiliatePercentage: 50,
            adsPercentage: 50,
            fallbackEnabled: true,
            status: "ACTIVE",
          };

          const mappedAdCount = adUnits.filter(
            (u) => u.placementCodes.includes(placement.code) || u.placementCodes.length === 0
          ).length;

          const mappedAffCount = affiliateLinks.filter(
            (l) => l.placementCodes.includes(placement.code) || l.placementCodes.length === 0
          ).length;

          const isActive = placement.status === "ACTIVE";

          return (
            <div
              key={placement.code}
              className={`p-5 rounded-xl border transition-all duration-200 flex flex-col justify-between space-y-4 admin-panel-card ${
                isActive
                  ? "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                  : "opacity-60 border-zinc-200 dark:border-zinc-800"
              }`}
            >
              {/* Card Top */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="admin-placement-tag">
                      {placement.code}
                    </span>
                    <span
                      className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                        cfg.displayMode === "BOTH"
                          ? "bg-purple-500/10 border-purple-500/20 text-purple-600 dark:text-purple-300"
                          : cfg.displayMode === "AFFILIATE_ONLY"
                          ? "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-300"
                          : "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-300"
                      }`}
                    >
                      {cfg.displayMode}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white tracking-tight">{placement.name}</h3>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                    {placement.description || "No placement description provided."}
                  </p>
                </div>

                <button
                  onClick={() => onTogglePlacementStatus(placement.code)}
                  title={isActive ? "Disable Placement" : "Enable Placement"}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-white transition-colors cursor-pointer"
                >
                  {isActive ? (
                    <ToggleRight className="w-7 h-7 text-emerald-500 dark:text-emerald-400" />
                  ) : (
                    <ToggleLeft className="w-7 h-7 text-zinc-400 dark:text-zinc-600" />
                  )}
                </button>
              </div>

              {/* Status & Rules Bar */}
              <div className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs space-y-2">
                <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400">
                  <span className="text-[11px] font-medium">Mapped Candidates</span>
                  <div className="flex items-center gap-2 text-[10px] font-mono">
                    <span className="text-amber-600 dark:text-amber-400">{mappedAffCount} Affiliates</span>
                    <span className="text-zinc-400 dark:text-zinc-600">•</span>
                    <span className="text-blue-600 dark:text-blue-400">{mappedAdCount} Ads</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] border-t border-zinc-200 dark:border-zinc-800/60 pt-2">
                  <span className="text-zinc-600 dark:text-zinc-400">Smart Fallback</span>
                  <span className={cfg.fallbackEnabled ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-zinc-500"}>
                    {cfg.fallbackEnabled ? "Enabled (Auto-fill)" : "Strict Mode"}
                  </span>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800/60 text-xs">
                <button
                  onClick={() => onNavigateToSimulator(placement.code)}
                  className="text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors flex items-center gap-1 text-[11px] font-medium cursor-pointer"
                >
                  <Play className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />
                  <span>Test Simulator</span>
                </button>
                <button
                  onClick={() => openEditModal(placement)}
                  className="btn-admin-outline cursor-pointer"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>Configure Rule</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit / New Modal Dialog */}
      {editingPlacement && editingConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  {isNew ? "Create New Placement" : `Configure: ${editingPlacement.code}`}
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Define placement metadata and runtime decision rules.
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingPlacement(null);
                  setEditingConfig(null);
                }}
                className="text-zinc-400 hover:text-zinc-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Code */}
              <div>
                <label className="block text-zinc-700 dark:text-zinc-400 font-semibold mb-1">
                  Placement Code (UPPERCASE_SNAKE_CASE)
                </label>
                <input
                  type="text"
                  value={editingPlacement.code}
                  disabled={!isNew}
                  onChange={(e) =>
                    setEditingPlacement({ ...editingPlacement, code: e.target.value })
                  }
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2 text-zinc-900 dark:text-white font-mono text-xs focus:border-indigo-500 outline-none disabled:opacity-50"
                  placeholder="e.g. ARTICLE_MIDDLE"
                />
              </div>

              {/* Name */}
              <div>
                <label className="block text-zinc-700 dark:text-zinc-400 font-semibold mb-1">Display Name</label>
                <input
                  type="text"
                  value={editingPlacement.name}
                  onChange={(e) =>
                    setEditingPlacement({ ...editingPlacement, name: e.target.value })
                  }
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2 text-zinc-900 dark:text-white text-xs focus:border-indigo-500 outline-none"
                  placeholder="e.g. Article Middle Content"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-zinc-700 dark:text-zinc-400 font-semibold mb-1">Description</label>
                <textarea
                  rows={2}
                  value={editingPlacement.description}
                  onChange={(e) =>
                    setEditingPlacement({ ...editingPlacement, description: e.target.value })
                  }
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2 text-zinc-900 dark:text-white text-xs focus:border-indigo-500 outline-none"
                  placeholder="Where and how this slot appears on frontend pages..."
                />
              </div>

              {/* Display Mode */}
              <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
                <label className="block text-zinc-700 dark:text-zinc-400 font-semibold">Display Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["BOTH", "AFFILIATE_ONLY", "ADS_ONLY"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setEditingConfig({ ...editingConfig, displayMode: m })}
                      className={`py-2 px-2 rounded-lg font-bold text-center border text-[11px] transition-all cursor-pointer ${
                        editingConfig.displayMode === m
                          ? "bg-indigo-600 border-indigo-500 text-white shadow-sm"
                          : "bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                      }`}
                    >
                      {m === "BOTH" ? "Both (Dual)" : m === "AFFILIATE_ONLY" ? "Affiliate Only" : "Ads Only"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fallback Option */}
              <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                <div>
                  <span className="text-zinc-900 dark:text-white font-medium block">Automatic Fallback</span>
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                    Auto-expand available partner to 100% if one network returns empty.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setEditingConfig({
                      ...editingConfig,
                      fallbackEnabled: !editingConfig.fallbackEnabled,
                    })
                  }
                  className="cursor-pointer"
                >
                  {editingConfig.fallbackEnabled ? (
                    <ToggleRight className="w-6 h-6 text-emerald-500 dark:text-emerald-400" />
                  ) : (
                    <ToggleLeft className="w-6 h-6 text-zinc-400 dark:text-zinc-600" />
                  )}
                </button>
              </div>
            </div>

            {/* Modal Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setEditingPlacement(null);
                  setEditingConfig(null);
                }}
                className="btn-admin-outline cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleModalSave}
                disabled={saving}
                className="btn-admin-primary cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Placement</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
