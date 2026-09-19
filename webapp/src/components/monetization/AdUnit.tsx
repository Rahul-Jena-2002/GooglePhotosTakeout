import React from "react";
import Monetization from "./Monetization";

export interface AdUnitProps {
  type?: "horizontal" | "vertical" | "square" | "compact" | "auto" | "sponsor";
  slot?: string;
  format?: string;
  className?: string;
  placement?: string;
}

/**
 * Slot-to-Placement resolver
 * Maps legacy slot and layout props to the new decoupled Monetization Architecture placements
 */
function resolvePlacementCode(placement?: string, slot?: string, type?: string): string {
  if (placement) return placement;

  if (type === "vertical" || type === "compact") {
    return "SIDEBAR";
  }

  switch (slot) {
    case "1":
      return "HOMEPAGE_TOP";
    case "2":
      return "HOMEPAGE_MIDDLE";
    case "3":
      return "HOMEPAGE_BOTTOM";
    case "4":
      return "HOMEPAGE_SLOT_4";
    default:
      return "ARTICLE_MIDDLE";
  }
}

/**
 * AdUnit - Upgraded to wrap the dynamic Monetization Engine
 * Maintains 100% backwards-compatibility with existing calls while eliminating hardcoded providers.
 */
export default function AdUnit({
  type = "auto",
  slot,
  className = "",
  placement,
}: AdUnitProps) {
  const resolvedPlacement = resolvePlacementCode(placement, slot, type);

  return (
    <Monetization
      placement={resolvedPlacement}
      layout={type}
      className={className}
    />
  );
}
