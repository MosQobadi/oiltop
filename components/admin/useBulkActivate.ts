"use client";

import { useState } from "react";

// The review queue's other half (D.4). Imported rows land INACTIVE, so the
// activation an admin performs after reviewing them is the same PATCH the edit
// form already sends — just issued once per selected row rather than once per
// visit to the form.
//
// Deliberately N calls to the existing `PATCH /api/admin/<resource>/[id]`
// rather than a bulk endpoint: the route already validates a partial update and
// re-checks the admin session, and a `/bulk` route would be a second way to
// write the same column. The page size caps N at 20.

type BulkActivateResult = { activated: number; failed: number };

export function useBulkActivate(resource: "products" | "categories") {
  const [isActivating, setIsActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rows are independent, so one failure doesn't cancel the rest — a product
  // whose PATCH 404s because someone else deleted it shouldn't leave the other
  // nineteen inactive. What the admin gets told is the count that got through.
  const activate = async (ids: string[]): Promise<BulkActivateResult> => {
    setIsActivating(true);
    setError(null);

    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          const response = await fetch(`/api/admin/${resource}/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "ACTIVE" }),
          });
          const result = await response.json();
          return result.success === true ? null : ((result.error as string) ?? "Unknown error");
        } catch {
          return "Request failed";
        }
      }),
    );

    const activated = results.filter((reason) => reason === null).length;
    const reasons = results.filter((reason): reason is string => reason !== null);
    if (reasons.length > 0) {
      // The count alone is not actionable, and after the import most refusals
      // have one specific cause: a product the source gave no price for cannot
      // go live at zero. Naming the commonest reason turns "6 of 20 failed"
      // into something the reviewer can actually do something about.
      const commonest = [...new Set(reasons)].sort(
        (a, b) => reasons.filter((r) => r === b).length - reasons.filter((r) => r === a).length,
      )[0];
      setError(`${reasons.length} of ${results.length} could not be activated. ${commonest}`);
    }

    setIsActivating(false);
    return { activated, failed: reasons.length };
  };

  return { activate, isActivating, error, clearError: () => setError(null) };
}
