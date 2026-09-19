import React, { useState, useEffect } from "react";
import type {
  MonetizationPlacement,
  MonetizationConfig,
  MonetizationResponse,
  AdUnit,
  AffiliateLink,
} from "../../../services/monetization/types";
import { getMonetizationContent } from "../../../services/monetization/monetizationEngine";
import Monetization from "../../monetization/Monetization";
import {
  Play,
  RefreshCw,
  Cpu,
  CheckCircle2,
  AlertCircle,
  Eye,
  Sliders,
  Code2,
  Smartphone,
  Monitor,
  Sparkles,
} from "lucide-react";

interface SimulatorTabProps {
  placements: MonetizationPlacement[];
  configs: Record<string, MonetizationConfig>;
  adUnits: AdUnit[];
  affiliateLinks: AffiliateLink[];
  initialPlacementCode?: string;
}

export default function MonetizationSimulatorTab({
  placements,
  configs,
  adUnits,
  affiliateLinks,
  initialPlacementCode,
}: SimulatorTabProps) {
  const [selectedPlacement, setSelectedPlacement] = useState<string>(
    initialPlacementCode || (placements[0]?.code ?? "ARTICLE_MIDDLE")
  );
  const [simulatedPlan, setSimulatedPlan] = useState<"free" | "pro" | "super">("free");
  const [supportWithAds, setSupportWithAds] = useState<boolean>(false);
  const [previewMode, setPreviewMode] = useState<boolean>(true);
  const [deviceWidth, setDeviceWidth] = useState<"desktop" | "mobile">("desktop");

  const [simResult, setSimResult] = useState<MonetizationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [renderNonce, setRenderNonce] = useState(0);

  const runSimulation = async () => {
    setLoading(true);
    try {
      const res = await getMonetizationContent(selectedPlacement, {
        preview: previewMode,
        userPlan: simulatedPlan,
        supportWithAds,
        forceRefresh: true,
      });
      setSimResult(res);
      setRenderNonce((n) => n + 1);
    } catch (err) {
      console.error("Simulation error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runSimulation();
  }, [selectedPlacement, simulatedPlan, supportWithAds, previewMode]);

  const currentCfg = configs[selectedPlacement];

  const matchingAffiliates = affiliateLinks.filter(
    (l) =>
      l.status === "ACTIVE" &&
      (l.placementCodes.includes(selectedPlacement) || l.placementCodes.length === 0)
  );

  const matchingAds = adUnits.filter(
    (u) =>
      u.status === "ACTIVE" &&
      (u.placementCodes.includes(selectedPlacement) || u.placementCodes.length === 0)
  );

  return (
    <div className="space-y-6">
      {/* ─── Simulator Controls Header ─── */}
      <div className="p-5 rounded-2xl admin-panel-card space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
              Live Monetization Engine Simulator & Placement Inspector
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
              Simulate backend placement queries in real time. Test display modes, candidate matching, and fallback logic.
            </p>
          </div>

          <button
            onClick={runSimulation}
            disabled={loading}
            className="btn-admin-primary shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Re-run Simulation</span>
          </button>
        </div>

        {/* Configuration Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2 text-xs">
          {/* Target Placement */}
          <div>
            <label className="block text-zinc-700 dark:text-zinc-400 font-semibold mb-1">Target Placement Slot</label>
            <select
              value={selectedPlacement}
              onChange={(e) => setSelectedPlacement(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2 text-zinc-900 dark:text-white font-mono text-xs focus:border-indigo-500 outline-none"
            >
              {placements.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* User Subscription Plan */}
          <div>
            <label className="block text-zinc-700 dark:text-zinc-400 font-semibold mb-1">Simulated User Plan</label>
            <select
              value={simulatedPlan}
              onChange={(e) => setSimulatedPlan(e.target.value as any)}
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2 text-zinc-900 dark:text-white text-xs focus:border-indigo-500 outline-none"
            >
              <option value="free">Free User Tier (Ads shown)</option>
              <option value="pro">Pro Subscriber (Ads shown)</option>
              <option value="super">Super Lifetime Subscriber (Ad-Free)</option>
            </select>
          </div>

          {/* Support With Ads */}
          <div>
            <label className="block text-zinc-700 dark:text-zinc-400 font-semibold mb-1">Support With Ads Checkbox</label>
            <select
              value={supportWithAds ? "yes" : "no"}
              onChange={(e) => setSupportWithAds(e.target.value === "yes")}
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2 text-zinc-900 dark:text-white text-xs focus:border-indigo-500 outline-none"
            >
              <option value="no">Disabled (Default)</option>
              <option value="yes">Enabled (Opt-in to ads)</option>
            </select>
          </div>

          {/* Preview Bypass */}
          <div>
            <label className="block text-zinc-700 dark:text-zinc-400 font-semibold mb-1">Preview Bypass Flag</label>
            <select
              value={previewMode ? "yes" : "no"}
              onChange={(e) => setPreviewMode(e.target.value === "yes")}
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2 text-zinc-900 dark:text-white text-xs focus:border-indigo-500 outline-none"
            >
              <option value="yes">True (Simulate all active units)</option>
              <option value="no">False (Strict live visitor simulation)</option>
            </select>
          </div>
        </div>
      </div>

      {/* ─── Engine Resolution Trace & Logic Stepper ─── */}
      {simResult && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Decision Pipeline Stepper (Left 2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="p-4 rounded-xl admin-panel-card space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                <span>Engine Resolution Trace</span>
              </h3>

              <div className="space-y-3 text-xs">
                {/* Step 1: Placement & Rule */}
                <div className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-lg flex items-center justify-between">
                  <div>
                    <span className="text-zinc-500 text-[10px] uppercase font-mono block">Step 1 • Rule Resolved</span>
                    <span className="text-zinc-900 dark:text-white font-semibold">
                      Mode: <span className="text-indigo-600 dark:text-indigo-400 font-mono">{simResult.mode}</span>
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-zinc-600 dark:text-zinc-400 text-[11px]">
                      Fallback: {currentCfg?.fallbackEnabled ? "ON (Auto-expand)" : "OFF (Strict)"}
                    </span>
                  </div>
                </div>

                {/* Step 2: Pool Matching */}
                <div className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-lg flex items-center justify-between">
                  <div>
                    <span className="text-zinc-500 text-[10px] uppercase font-mono block">Step 2 • Candidate Pool</span>
                    <span className="text-zinc-700 dark:text-zinc-300">
                      Found <strong className="text-amber-600 dark:text-amber-400">{matchingAffiliates.length}</strong> affiliates,{" "}
                      <strong className="text-blue-600 dark:text-blue-400">{matchingAds.length}</strong> ads for &ldquo;{selectedPlacement}&rdquo;
                    </span>
                  </div>
                </div>

                {/* Step 3: Selection & Fallback Evaluation */}
                <div className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-lg space-y-1.5">
                  <span className="text-zinc-500 text-[10px] uppercase font-mono block">Step 3 • Decision Outcome</span>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 rounded bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800">
                      <span className="text-zinc-500 dark:text-zinc-400 block text-[10px]">Affiliate Slot:</span>
                      {simResult.affiliate ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium truncate block">
                          ✓ {simResult.affiliate.title}
                        </span>
                      ) : (
                        <span className="text-zinc-400 dark:text-zinc-500 italic">None / Excluded</span>
                      )}
                    </div>
                    <div className="p-2 rounded bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800">
                      <span className="text-zinc-500 dark:text-zinc-400 block text-[10px]">Ad Slot:</span>
                      {simResult.ad ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium truncate block">
                          ✓ {simResult.ad.title} ({simResult.ad.adType})
                        </span>
                      ) : (
                        <span className="text-zinc-400 dark:text-zinc-500 italic">None / Excluded</span>
                      )}
                    </div>
                  </div>

                  {simResult.empty && (
                    <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-[11px] flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Result is EMPTY. Reason: {simResult.reason || "NO_CANDIDATES"}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Live Frontend Mockup Preview */}
            <div className="p-4 rounded-xl admin-panel-card space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                    Live Component Render Preview
                  </h3>
                </div>

                <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <button
                    onClick={() => setDeviceWidth("desktop")}
                    className={`p-1.5 rounded transition-all cursor-pointer ${
                      deviceWidth === "desktop"
                        ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm"
                        : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                    }`}
                    title="Desktop View"
                  >
                    <Monitor className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeviceWidth("mobile")}
                    className={`p-1.5 rounded transition-all cursor-pointer ${
                      deviceWidth === "mobile"
                        ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm"
                        : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                    }`}
                    title="Mobile View (360px)"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Render viewport */}
              <div className="p-4 bg-zinc-100 dark:bg-black/60 border border-dashed border-zinc-300 dark:border-zinc-800 rounded-xl flex items-center justify-center overflow-x-auto min-h-[140px]">
                <div
                  className={`transition-all duration-300 ${
                    deviceWidth === "mobile" ? "w-[360px] max-w-full" : "w-full"
                  }`}
                >
                  <Monetization
                    key={`${selectedPlacement}-${renderNonce}`}
                    placement={selectedPlacement}
                    preview={previewMode}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Raw JSON Payload (Right col) */}
          <div className="p-4 rounded-xl admin-panel-card space-y-3 flex flex-col h-full">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                Raw JSON API Payload
              </h3>
            </div>
            <pre className="flex-1 p-3 admin-code-block text-[10px] font-mono overflow-x-auto max-h-[500px] leading-relaxed">
              {JSON.stringify(simResult, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
