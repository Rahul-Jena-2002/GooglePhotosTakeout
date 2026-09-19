import React, { useState } from "react";
import type {
  AdProvider,
  AdUnit,
  AdType,
  MonetizationPlacement,
} from "../../../services/monetization/types";
import {
  Megaphone,
  Plus,
  Edit2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Code2,
  Image as ImageIcon,
  ExternalLink,
  Save,
  X,
  Eye,
  Layers,
} from "lucide-react";

interface AdsTabProps {
  adProviders: AdProvider[];
  adUnits: AdUnit[];
  placements: MonetizationPlacement[];
  onSaveAdUnit: (unit: AdUnit) => Promise<void>;
  onDeleteAdUnit: (unitId: string) => Promise<void>;
  onToggleAdUnitStatus: (unitId: string) => Promise<void>;
  onSaveAdProvider: (provider: AdProvider) => Promise<void>;
  onToggleAdProviderStatus: (providerId: string) => Promise<void>;
  saving: boolean;
}

export default function MonetizationAdsTab({
  adProviders,
  adUnits,
  placements,
  onSaveAdUnit,
  onDeleteAdUnit,
  onToggleAdUnitStatus,
  onSaveAdProvider,
  onToggleAdProviderStatus,
  saving,
}: AdsTabProps) {
  // Modal states
  const [editingUnit, setEditingUnit] = useState<AdUnit | null>(null);
  const [editingProvider, setEditingProvider] = useState<AdProvider | null>(null);
  const [previewUnit, setPreviewUnit] = useState<AdUnit | null>(null);
  const [filterProvider, setFilterProvider] = useState<string>("ALL");

  const openNewUnitModal = () => {
    const newId = `ad_unit_${Date.now().toString().slice(-6)}`;
    const defaultProv = adProviders[0] || { id: "ad_prov_custom", name: "Custom" };
    const allCodes =
      placements.length > 0
        ? placements.map((p) => p.code)
        : ["ARTICLE_TOP", "ARTICLE_MIDDLE", "ARTICLE_BOTTOM", "SIDEBAR", "HOMEPAGE_TOP", "HOMEPAGE_MIDDLE", "HOMEPAGE_BOTTOM"];
    setEditingUnit({
      id: newId,
      providerId: defaultProv.id,
      providerName: defaultProv.name,
      name: "",
      adType: "HTML",
      embedCode: "",
      imageUrl: "",
      destinationUrl: "",
      ctaText: "Learn More",
      status: "ACTIVE",
      priority: 10,
      placementCodes: allCodes,
      targetBlank: true,
    });
  };

  const openNewProviderModal = () => {
    const newId = `ad_prov_${Date.now().toString().slice(-6)}`;
    setEditingProvider({
      id: newId,
      name: "",
      code: "CUSTOM",
      status: "ACTIVE",
      notes: "",
    });
  };

  const handleUnitSave = async () => {
    if (!editingUnit) return;
    if (!editingUnit.name.trim()) {
      alert("Ad unit name is required");
      return;
    }
    const prov = adProviders.find((p) => p.id === editingUnit.providerId);
    await onSaveAdUnit({
      ...editingUnit,
      providerName: prov ? prov.name : editingUnit.providerName,
    });
    setEditingUnit(null);
  };

  const handleProviderSave = async () => {
    if (!editingProvider) return;
    if (!editingProvider.name.trim()) {
      alert("Provider name is required");
      return;
    }
    await onSaveAdProvider({
      ...editingProvider,
      code: editingProvider.code.toUpperCase().replace(/\s+/g, "_"),
    });
    setEditingProvider(null);
  };

  const filteredUnits =
    filterProvider === "ALL"
      ? adUnits
      : adUnits.filter((u) => u.providerId === filterProvider);

  return (
    <div className="space-y-6">
      {/* ─── Ad Networks Ribbon ─── */}
      <div className="admin-panel-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-blue-500 dark:text-blue-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-300">
              Ad Networks & Providers
            </h3>
          </div>
          <button
            onClick={openNewProviderModal}
            className="btn-admin-primary"
          >
            <Plus className="w-3 h-3" />
            <span>Add Provider</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setFilterProvider("ALL")}
            className={`btn-admin-filter ${
              filterProvider === "ALL" ? "btn-admin-filter-active" : "btn-admin-filter-inactive"
            }`}
          >
            All Networks ({adUnits.length})
          </button>

          {adProviders.map((prov) => {
            const count = adUnits.filter((u) => u.providerId === prov.id).length;
            const isSelected = filterProvider === prov.id;
            const isActive = prov.status === "ACTIVE";

            return (
              <div
                key={prov.id}
                className={`flex items-center gap-2 px-3 py-1 rounded-md border text-xs transition-all ${
                  isSelected ? "btn-admin-filter-active" : "btn-admin-filter-inactive"
                }`}
              >
                <button
                  onClick={() => setFilterProvider(prov.id)}
                  className="font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isActive ? "bg-emerald-500 dark:bg-emerald-400" : "bg-red-500 dark:bg-red-400"
                    }`}
                  />
                  <span>{prov.name}</span>
                  <span className={`text-[10px] ${isSelected ? "opacity-80" : "text-zinc-500"}`}>({count})</span>
                </button>

                <button
                  onClick={() => onToggleAdProviderStatus(prov.id)}
                  title={isActive ? "Disable Network" : "Enable Network"}
                  className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white ml-1 cursor-pointer"
                >
                  {isActive ? (
                    <ToggleRight className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                  ) : (
                    <ToggleLeft className="w-4 h-4 text-zinc-400 dark:text-zinc-600" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Ad Units Header Bar ─── */}
      <div className="admin-panel-card p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-white">Advertisements & Ad Units</h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
            Create HTML embeds, JavaScript tags, IFRAME banners, or native custom sponsors.
          </p>
        </div>
        <button
          onClick={openNewUnitModal}
          disabled={saving}
          className="btn-admin-primary"
        >
          <Plus className="w-4 h-4" />
          <span>New Ad Unit</span>
        </button>
      </div>

      {/* ─── Ad Units Grid ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredUnits.length === 0 ? (
          <div className="admin-panel-card col-span-2 py-12 text-center text-zinc-500 border-dashed">
            No ad units configured for this filter. Click &ldquo;New Ad Unit&rdquo; to add one.
          </div>
        ) : (
          filteredUnits.map((unit) => {
            const isActive = unit.status === "ACTIVE";

            return (
              <div
                key={unit.id}
                className={`admin-panel-card p-5 flex flex-col justify-between space-y-4 transition-all duration-200 ${
                  isActive
                    ? "hover:border-zinc-400 dark:hover:border-zinc-700"
                    : "opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 font-bold">
                        {unit.adType}
                      </span>
                      <span className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">
                        {unit.providerName || "Custom"}
                      </span>
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
                        Priority: {unit.priority}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white tracking-tight truncate">
                      {unit.name}
                    </h3>
                  </div>

                  <button
                    onClick={() => onToggleAdUnitStatus(unit.id)}
                    className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white shrink-0 cursor-pointer"
                  >
                    {isActive ? (
                      <ToggleRight className="w-7 h-7 text-emerald-500 dark:text-emerald-400" />
                    ) : (
                      <ToggleLeft className="w-7 h-7 text-zinc-400 dark:text-zinc-600" />
                    )}
                  </button>
                </div>

                {/* Placements assigned chips */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-zinc-500 font-medium">Placements:</span>
                  {unit.placementCodes.length === 0 ? (
                    <span className="admin-placement-tag">
                      ALL
                    </span>
                  ) : (
                    unit.placementCodes.map((code) => (
                      <span
                        key={code}
                        className="admin-placement-tag"
                      >
                        {code}
                      </span>
                    ))
                  )}
                </div>

                {/* Quick Preview Snippet */}
                {unit.embedCode && (
                  <div className="admin-code-block p-2.5 text-[11px] font-mono truncate max-h-14 overflow-hidden">
                    {unit.embedCode}
                  </div>
                )}

                {/* Footer Controls */}
                <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800/80 text-xs">
                  <button
                    onClick={() => setPreviewUnit(unit)}
                    className="text-zinc-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center gap-1 text-[11px] cursor-pointer"
                  >
                    <Eye className="w-3 h-3 text-blue-500 dark:text-blue-400" />
                    <span>Quick Preview</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingUnit({ ...unit })}
                      className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                      title="Edit"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDeleteAdUnit(unit.id)}
                      className="p-1.5 text-zinc-500 hover:text-red-400 rounded hover:bg-red-950/30 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ─── Modal: Edit / New Ad Unit ─── */}
      {editingUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Configure Ad Unit</h3>
                <p className="text-xs text-zinc-400">
                  Target this ad unit to specific placements and ad networks.
                </p>
              </div>
              <button onClick={() => setEditingUnit(null)} className="text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Provider & Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Ad Network / Provider</label>
                  <select
                    value={editingUnit.providerId}
                    onChange={(e) => {
                      const p = adProviders.find((x) => x.id === e.target.value);
                      setEditingUnit({
                        ...editingUnit,
                        providerId: e.target.value,
                        providerName: p ? p.name : editingUnit.providerName,
                      });
                    }}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white text-xs focus:border-blue-500 outline-none"
                  >
                    {adProviders.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Unit Display Name</label>
                  <input
                    type="text"
                    value={editingUnit.name}
                    onChange={(e) => setEditingUnit({ ...editingUnit, name: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white text-xs focus:border-blue-500 outline-none"
                    placeholder="e.g. Google Responsive Article Ad"
                  />
                </div>
              </div>

              {/* Ad Type & Priority */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Ad Type</label>
                  <select
                    value={editingUnit.adType}
                    onChange={(e) =>
                      setEditingUnit({ ...editingUnit, adType: e.target.value as AdType })
                    }
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white text-xs focus:border-blue-500 outline-none"
                  >
                    <option value="HTML">HTML / Embed Tag</option>
                    <option value="SCRIPT">JavaScript Code / AdSense Tag</option>
                    <option value="IFRAME">IFRAME Embed</option>
                    <option value="IMAGE">Image Banner & Link</option>
                    <option value="NATIVE">Native Card / House Promotion</option>
                    <option value="DISPLAY">Display Banner</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Priority (Higher = Priority)</label>
                  <input
                    type="number"
                    value={editingUnit.priority}
                    onChange={(e) =>
                      setEditingUnit({ ...editingUnit, priority: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white text-xs focus:border-blue-500 outline-none"
                    placeholder="10"
                  />
                </div>
              </div>

              {/* Target Placements Checklist */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-zinc-400 font-semibold text-xs">
                    Assigned Target Placements
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setEditingUnit({
                          ...editingUnit,
                          placementCodes: placements.map((p) => p.code),
                        })
                      }
                      className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-2 py-0.5 rounded transition"
                    >
                      ✓ Select All
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingUnit({ ...editingUnit, placementCodes: [] })
                      }
                      className="text-[11px] text-zinc-400 hover:text-zinc-300 bg-zinc-800 hover:bg-zinc-700 px-2 py-0.5 rounded transition"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-zinc-900/60 border border-zinc-800 rounded-xl max-h-36 overflow-y-auto">
                  {placements.map((p) => {
                    const checked = editingUnit.placementCodes.includes(p.code);
                    return (
                      <label
                        key={p.code}
                        className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...editingUnit.placementCodes, p.code]
                              : editingUnit.placementCodes.filter((c) => c !== p.code);
                            setEditingUnit({ ...editingUnit, placementCodes: next });
                          }}
                          className="rounded border-zinc-700 bg-zinc-800 text-blue-600"
                        />
                        <span className="font-mono text-[10px] truncate">{p.code}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Embed Code / Script */}
              <div>
                <label className="block text-zinc-400 font-semibold mb-1">
                  Embed Code / HTML / Script snippet
                </label>
                <textarea
                  rows={4}
                  value={editingUnit.embedCode || ""}
                  onChange={(e) => setEditingUnit({ ...editingUnit, embedCode: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 font-mono text-[11px] text-zinc-200 focus:border-blue-500 outline-none"
                  placeholder='<ins class="adsbygoogle" ...></ins>'
                />
              </div>

              {/* Destination URL & Image URL */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Destination URL (Optional)</label>
                  <input
                    type="text"
                    value={editingUnit.destinationUrl || ""}
                    onChange={(e) =>
                      setEditingUnit({ ...editingUnit, destinationUrl: e.target.value })
                    }
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white text-xs focus:border-blue-500 outline-none"
                    placeholder="https://..."
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Image URL (Optional)</label>
                  <input
                    type="text"
                    value={editingUnit.imageUrl || ""}
                    onChange={(e) => setEditingUnit({ ...editingUnit, imageUrl: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white text-xs focus:border-blue-500 outline-none"
                    placeholder="https://images.unsplash.com/..."
                  />
                </div>
              </div>
            </div>

            {/* Modal Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setEditingUnit(null)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUnitSave}
                disabled={saving}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-md active:scale-95"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Ad Unit</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal: Edit / New Provider ─── */}
      {editingProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-bold text-white">Add Ad Provider</h3>
              <button onClick={() => setEditingProvider(null)} className="text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 font-semibold mb-1">Provider Name</label>
                <input
                  type="text"
                  value={editingProvider.name}
                  onChange={(e) => setEditingProvider({ ...editingProvider, name: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white text-xs focus:border-blue-500 outline-none"
                  placeholder="e.g. Media.net"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-semibold mb-1">Network Code (SNAKE_CASE)</label>
                <input
                  type="text"
                  value={editingProvider.code}
                  onChange={(e) => setEditingProvider({ ...editingProvider, code: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono text-xs focus:border-blue-500 outline-none"
                  placeholder="e.g. MEDIA_NET"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-semibold mb-1">Notes (Optional)</label>
                <textarea
                  rows={2}
                  value={editingProvider.notes || ""}
                  onChange={(e) => setEditingProvider({ ...editingProvider, notes: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white text-xs focus:border-blue-500 outline-none"
                  placeholder="Account notes, publisher ID, etc."
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setEditingProvider(null)}
                className="px-4 py-2 bg-zinc-900 text-zinc-300 rounded-lg text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProviderSave}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold"
              >
                Save Provider
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal: Quick Preview Unit ─── */}
      {previewUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-white">Preview: {previewUnit.name}</h3>
              <button onClick={() => setPreviewUnit(null)} className="text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-zinc-900/50 border border-dashed border-zinc-800 rounded-xl">
              {previewUnit.embedCode ? (
                <div dangerouslySetInnerHTML={{ __html: previewUnit.embedCode }} />
              ) : previewUnit.imageUrl ? (
                <img
                  src={previewUnit.imageUrl}
                  alt={previewUnit.name}
                  className="w-full rounded-lg"
                />
              ) : (
                <div className="text-center text-xs text-zinc-400 py-6">No visual preview code available</div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setPreviewUnit(null)}
                className="px-4 py-1.5 bg-zinc-800 text-zinc-300 rounded-lg text-xs font-semibold"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
