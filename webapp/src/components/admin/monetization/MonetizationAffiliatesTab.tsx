import React, { useState } from "react";
import type {
  AffiliateProvider,
  AffiliateLink,
  MonetizationPlacement,
} from "../../../services/monetization/types";
import {
  ShoppingBag,
  Plus,
  Edit2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  ExternalLink,
  Save,
  X,
  Eye,
  Loader2,
  Wand2,
} from "lucide-react";

interface AffiliatesTabProps {
  affiliateProviders: AffiliateProvider[];
  affiliateLinks: AffiliateLink[];
  placements: MonetizationPlacement[];
  onSaveAffiliateLink: (link: AffiliateLink) => Promise<void>;
  onDeleteAffiliateLink: (linkId: string) => Promise<void>;
  onToggleAffiliateLinkStatus: (linkId: string) => Promise<void>;
  onSaveAffiliateProvider: (provider: AffiliateProvider) => Promise<void>;
  onToggleAffiliateProviderStatus: (providerId: string) => Promise<void>;
  saving: boolean;
}

export default function MonetizationAffiliatesTab({
  affiliateProviders,
  affiliateLinks,
  placements,
  onSaveAffiliateLink,
  onDeleteAffiliateLink,
  onToggleAffiliateLinkStatus,
  onSaveAffiliateProvider,
  onToggleAffiliateProviderStatus,
  saving,
}: AffiliatesTabProps) {
  const [editingLink, setEditingLink] = useState<AffiliateLink | null>(null);
  const [editingProvider, setEditingProvider] = useState<AffiliateProvider | null>(null);
  const [previewLink, setPreviewLink] = useState<AffiliateLink | null>(null);
  const [filterProvider, setFilterProvider] = useState<string>("ALL");
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const handleAutoExtract = async () => {
    if (!editingLink?.destinationUrl) {
      setExtractError("Please paste a destination URL first.");
      return;
    }
    setIsExtracting(true);
    setExtractError(null);
    try {
      const res = await fetch("/api/extract-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: editingLink.destinationUrl }),
      });
      const data = await res.json();
      if (data.success) {
        setEditingLink({
          ...editingLink,
          imageUrl: data.imageUrl || editingLink.imageUrl,
          title: editingLink.title.trim() ? editingLink.title : (data.title || editingLink.title),
          description: editingLink.description.trim() ? editingLink.description : (data.description || editingLink.description),
        });
      } else {
        setExtractError(data.error || "Could not extract details from this link.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Extraction failed";
      setExtractError(msg);
    } finally {
      setIsExtracting(false);
    }
  };

  const openNewLinkModal = () => {
    const newId = `aff_link_${Date.now().toString().slice(-6)}`;
    const defaultProv = affiliateProviders[0] || { id: "aff_prov_amazon", name: "Amazon Associates" };
    setEditingLink({
      id: newId,
      providerId: defaultProv.id,
      providerName: defaultProv.name,
      title: "",
      description: "",
      destinationUrl: "",
      imageUrl: "",
      ctaText: "Shop on Amazon",
      tag: "Featured Deal",
      status: "ACTIVE",
      priority: 10,
      placementCodes: ["ARTICLE_MIDDLE", "ARTICLE_BOTTOM", "SIDEBAR"],
      isExternal: true,
    });
  };

  const openNewProviderModal = () => {
    const newId = `aff_prov_${Date.now().toString().slice(-6)}`;
    setEditingProvider({
      id: newId,
      name: "",
      code: "AMAZON",
      status: "ACTIVE",
      tag: "",
    });
  };

  const handleLinkSave = async () => {
    if (!editingLink) return;
    if (!editingLink.title.trim()) {
      alert("Title is required");
      return;
    }
    const prov = affiliateProviders.find((p) => p.id === editingLink.providerId);
    await onSaveAffiliateLink({
      ...editingLink,
      providerName: prov ? prov.name : editingLink.providerName,
    });
    setEditingLink(null);
  };

  const handleProviderSave = async () => {
    if (!editingProvider) return;
    if (!editingProvider.name.trim()) {
      alert("Provider name is required");
      return;
    }
    await onSaveAffiliateProvider({
      ...editingProvider,
      code: editingProvider.code.toUpperCase().replace(/\s+/g, "_"),
    });
    setEditingProvider(null);
  };

  const filteredLinks =
    filterProvider === "ALL"
      ? affiliateLinks
      : affiliateLinks.filter((l) => l.providerId === filterProvider);

  return (
    <div className="space-y-6">
      {/* ─── Affiliate Providers Ribbon ─── */}
      <div className="admin-panel-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-amber-500 dark:text-amber-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-300">
              Affiliate Networks & Accounts
            </h3>
          </div>
          <button
            onClick={openNewProviderModal}
            className="btn-admin-primary"
          >
            <Plus className="w-3 h-3" />
            <span>Add Network</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setFilterProvider("ALL")}
            className={`btn-admin-filter ${
              filterProvider === "ALL" ? "btn-admin-filter-active" : "btn-admin-filter-inactive"
            }`}
          >
            All Accounts ({affiliateLinks.length})
          </button>

          {affiliateProviders.map((prov) => {
            const count = affiliateLinks.filter((l) => l.providerId === prov.id).length;
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
                  onClick={() => onToggleAffiliateProviderStatus(prov.id)}
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

      {/* ─── Links Header Bar ─── */}
      <div className="admin-panel-card p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-white">Affiliate Links & Product Deals</h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
            Configure partner products, high-converting copy, tracking links, and placement targets.
          </p>
        </div>
        <button
          onClick={openNewLinkModal}
          disabled={saving}
          className="btn-admin-primary"
        >
          <Plus className="w-4 h-4" />
          <span>New Affiliate Link</span>
        </button>
      </div>

      {/* ─── Links Grid ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredLinks.length === 0 ? (
          <div className="admin-panel-card col-span-2 py-12 text-center text-zinc-500 border-dashed">
            No affiliate links configured for this filter. Click &ldquo;New Affiliate Link&rdquo; to add one.
          </div>
        ) : (
          filteredLinks.map((link) => {
            const isActive = link.status === "ACTIVE";

            return (
              <div
                key={link.id}
                className={`admin-panel-card p-5 flex flex-col justify-between space-y-4 transition-all duration-200 ${
                  isActive
                    ? "hover:border-zinc-400 dark:hover:border-zinc-700"
                    : "opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-300 flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5" />
                        {link.tag || "Deal"}
                      </span>
                      <span className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">
                        {link.providerName || "Affiliate"}
                      </span>
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
                        Priority: {link.priority}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white tracking-tight truncate">
                      {link.title}
                    </h3>

                    <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                      {link.description}
                    </p>
                  </div>

                  <button
                    onClick={() => onToggleAffiliateLinkStatus(link.id)}
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
                  {link.placementCodes.length === 0 ? (
                    <span className="admin-placement-tag">
                      ALL
                    </span>
                  ) : (
                    link.placementCodes.map((code) => (
                      <span
                        key={code}
                        className="admin-placement-tag"
                      >
                        {code}
                      </span>
                    ))
                  )}
                </div>

                {/* Footer Controls */}
                <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800/80 text-xs">
                  <button
                    onClick={() => setPreviewLink(link)}
                    className="text-zinc-600 dark:text-zinc-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors flex items-center gap-1 text-[11px] cursor-pointer"
                  >
                    <Eye className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                    <span>Quick Preview</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingLink({ ...link })}
                      className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                      title="Edit"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDeleteAffiliateLink(link.id)}
                      className="p-1.5 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
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

      {/* ─── Modal: Edit / New Affiliate Link ─── */}
      {editingLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Configure Affiliate Deal</h3>
                <p className="text-xs text-zinc-400">
                  Target this product offer to specific placements and customize conversion copy.
                </p>
              </div>
              <button onClick={() => setEditingLink(null)} className="text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Provider & Category Tag */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Affiliate Account</label>
                  <select
                    value={editingLink.providerId}
                    onChange={(e) => {
                      const p = affiliateProviders.find((x) => x.id === e.target.value);
                      setEditingLink({
                        ...editingLink,
                        providerId: e.target.value,
                        providerName: p ? p.name : editingLink.providerName,
                      });
                    }}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white text-xs focus:border-amber-500 outline-none"
                  >
                    {affiliateProviders.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Badge Tag</label>
                  <input
                    type="text"
                    value={editingLink.tag || ""}
                    onChange={(e) => setEditingLink({ ...editingLink, tag: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white text-xs focus:border-amber-500 outline-none"
                    placeholder="e.g. Audio & Acoustics"
                  />
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-zinc-400 font-semibold mb-1">Product Title</label>
                <input
                  type="text"
                  value={editingLink.title}
                  onChange={(e) => setEditingLink({ ...editingLink, title: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white text-xs focus:border-amber-500 outline-none"
                  placeholder="e.g. Sony WF-1000XM5 Noise-Cancelling Earbuds"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-zinc-400 font-semibold mb-1">Copy / Description</label>
                <textarea
                  rows={3}
                  value={editingLink.description}
                  onChange={(e) => setEditingLink({ ...editingLink, description: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-200 focus:border-amber-500 outline-none"
                  placeholder="Highlight key specs, discounts, or value proposition..."
                />
              </div>

              {/* Destination URL & CTA Text */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-zinc-400 font-semibold">
                        Destination URL (with tracking tag)
                      </label>
                      <button
                        type="button"
                        onClick={handleAutoExtract}
                        disabled={isExtracting || !editingLink.destinationUrl}
                        className="text-[11px] font-bold text-amber-500 hover:text-amber-400 flex items-center gap-1 disabled:opacity-40 transition-all cursor-pointer"
                        title="Automatically scrape and populate product title, description, and image URL"
                      >
                        {isExtracting ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Extracting...</span>
                          </>
                        ) : (
                          <>
                            <Wand2 className="w-3 h-3" />
                            <span>Auto-Extract Details</span>
                          </>
                        )}
                      </button>
                    </div>
                    <input
                      type="text"
                      value={editingLink.destinationUrl}
                      onChange={(e) =>
                        setEditingLink({ ...editingLink, destinationUrl: e.target.value })
                      }
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white text-xs focus:border-amber-500 outline-none"
                      placeholder="https://amazon.com/dp/... or affiliate tracking link"
                    />
                    {extractError && (
                      <p className="text-[11px] text-red-400 mt-1">{extractError}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-zinc-400 font-semibold mb-1">CTA Button Text</label>
                    <input
                      type="text"
                      value={editingLink.ctaText}
                      onChange={(e) => setEditingLink({ ...editingLink, ctaText: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white text-xs focus:border-amber-500 outline-none"
                      placeholder="e.g. Shop on Amazon"
                    />
                  </div>
                </div>

                {/* Image URL & Priority with live thumbnail */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-zinc-400 font-semibold mb-1">Product Image URL (Optional)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingLink.imageUrl || ""}
                        onChange={(e) => setEditingLink({ ...editingLink, imageUrl: e.target.value })}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white text-xs focus:border-amber-500 outline-none"
                        placeholder="https://..."
                      />
                      {editingLink.imageUrl && (
                        <div className="w-9 h-9 rounded-lg border border-zinc-700 overflow-hidden shrink-0 bg-white/5 flex items-center justify-center">
                          <img
                            src={editingLink.imageUrl}
                            alt="Extracted preview"
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-zinc-400 font-semibold mb-1">Priority (Higher = Priority)</label>
                    <input
                      type="number"
                      value={editingLink.priority}
                      onChange={(e) =>
                        setEditingLink({ ...editingLink, priority: parseInt(e.target.value, 10) || 0 })
                      }
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white text-xs focus:border-amber-500 outline-none"
                      placeholder="10"
                    />
                  </div>
                </div>
              </div>

              {/* Target Placements Checklist */}
              <div>
                <label className="block text-zinc-400 font-semibold mb-1.5">
                  Assigned Target Placements
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-zinc-900/60 border border-zinc-800 rounded-xl max-h-36 overflow-y-auto">
                  {placements.map((p) => {
                    const checked = editingLink.placementCodes.includes(p.code);
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
                              ? [...editingLink.placementCodes, p.code]
                              : editingLink.placementCodes.filter((c) => c !== p.code);
                            setEditingLink({ ...editingLink, placementCodes: next });
                          }}
                          className="rounded border-zinc-700 bg-zinc-800 text-amber-600"
                        />
                        <span className="font-mono text-[10px] truncate">{p.code}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setEditingLink(null)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLinkSave}
                disabled={saving}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-md active:scale-95"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Affiliate Deal</span>
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
              <h3 className="text-base font-bold text-white">Add Affiliate Network</h3>
              <button onClick={() => setEditingProvider(null)} className="text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 font-semibold mb-1">Network Name</label>
                <input
                  type="text"
                  value={editingProvider.name}
                  onChange={(e) => setEditingProvider({ ...editingProvider, name: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white text-xs focus:border-amber-500 outline-none"
                  placeholder="e.g. Cuelinks"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-semibold mb-1">Network Code (SNAKE_CASE)</label>
                <input
                  type="text"
                  value={editingProvider.code}
                  onChange={(e) => setEditingProvider({ ...editingProvider, code: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white font-mono text-xs focus:border-amber-500 outline-none"
                  placeholder="e.g. CUELINKS"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-semibold mb-1">Default Tag / Affiliate ID</label>
                <input
                  type="text"
                  value={editingProvider.tag || ""}
                  onChange={(e) => setEditingProvider({ ...editingProvider, tag: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white text-xs focus:border-amber-500 outline-none"
                  placeholder="e.g. rjtools-21"
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
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold"
              >
                Save Network
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal: Quick Preview Link ─── */}
      {previewLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-white">Preview: {previewLink.title}</h3>
              <button onClick={() => setPreviewLink(null)} className="text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-zinc-900/50 border border-dashed border-zinc-800 rounded-xl space-y-3">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold uppercase tracking-wider text-amber-400 bg-amber-950/40 border border-amber-800/60 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" />
                  {previewLink.tag || "Featured"}
                </span>
                <span className="text-[8px] uppercase tracking-wider text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded">
                  {previewLink.providerName}
                </span>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-lg shrink-0">
                  🎁
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">{previewLink.title}</h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5">{previewLink.description}</p>
                </div>
              </div>

              <div className="pt-2">
                <button className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-zinc-100 text-black flex items-center gap-1.5">
                  <span>{previewLink.ctaText}</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setPreviewLink(null)}
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
