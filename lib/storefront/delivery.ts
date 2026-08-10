// The two delivery options the storefront launches with (Design Decision 10).
// Flat rates as constants on purpose: not Settings rows, and not a shipping-
// rules engine. If delivery ever has to vary by region, weight or carrier
// that's an admin-configurable feature, not another entry here.
//
// Cost is all the server needs. Labels and ETAs are locale copy and belong to
// the checkout screen with every other storefront string — putting them here
// would be the one place in `lib/storefront/` that owns customer-facing text.

export const DELIVERY_METHODS = ["nationwide", "tehran-same-day"] as const;

export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

// Whole Toman, like every other price in the app.
export const DELIVERY_COST: Record<DeliveryMethod, number> = {
  nationwide: 190_000,
  "tehran-same-day": 380_000,
};
