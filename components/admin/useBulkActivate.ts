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
          return result.success === true;
        } catch {
          return false;
        }
      }),
    );

    const activated = results.filter(Boolean).length;
    const failed = results.length - activated;
    if (failed > 0) {
      setError(`${failed} of ${results.length} could not be activated.`);
    }

    setIsActivating(false);
    return { activated, failed };
  };

  return { activate, isActivating, error, clearError: () => setError(null) };
}
