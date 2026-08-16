import type { SVGProps } from "react";

// Same hand-rolled outline set as the admin panel's icons.tsx, kept separate so
// the storefront carries only the handful of glyphs its shell needs rather than
// importing across trees.

function Svg(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export function CartIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M3 4h2.2l2 11.2a1.5 1.5 0 0 0 1.5 1.3h8.1a1.5 1.5 0 0 0 1.5-1.2L20 8H6" />
      <circle cx="9.5" cy="20" r="1.3" />
      <circle cx="17" cy="20" r="1.3" />
    </Svg>
  );
}

export function UserIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </Svg>
  );
}

export function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

// Points forward in reading order, not east: callers flip it with `rtl:` so the
// Persian tree's "go on" arrow doesn't point back where the customer came from.
export function ChevronIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="m9 5 7 7-7 7" />
    </Svg>
  );
}

// The stand-in for a product with no photo uploaded yet. An oil bottle rather
// than a broken-image glyph: most of the catalog is oil, and a shape a customer
// recognises reads as "photo coming" instead of "something failed".
export function OilBottleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M10.2 2.6h3.6v2.5h-3.6z" />
      <path d="M9.7 5.1h4.6a4.3 4.3 0 0 1 4.3 4.3v8.7a3.3 3.3 0 0 1-3.3 3.3H8.7a3.3 3.3 0 0 1-3.3-3.3V9.4a4.3 4.3 0 0 1 4.3-4.3Z" />
      <path d="M6.4 12.6h11.2" />
    </Svg>
  );
}

// The stand-in for a car with no photo — neither the type nor its model has one
// (see `variantImage`). A three-quarter-flat silhouette rather than a camera or
// a broken-image glyph, for the same reason as OilBottleIcon above.
export function CarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M4 16.5v2.2a.8.8 0 0 1-.8.8H2.4a.8.8 0 0 1-.8-.8v-2.2M22.4 16.5v2.2a.8.8 0 0 1-.8.8h-.8a.8.8 0 0 1-.8-.8v-2.2" />
      <path d="M2.6 16.5v-3.2a2 2 0 0 1 .5-1.3l1-1.2 1.7-4A2 2 0 0 1 7.6 5.5h8.8a2 2 0 0 1 1.8 1.3l1.7 4 1 1.2a2 2 0 0 1 .5 1.3v3.2Z" />
      <path d="M4.6 11.5h14.8" />
      <circle cx="7.4" cy="14" r="1" />
      <circle cx="16.6" cy="14" r="1" />
    </Svg>
  );
}

export function MailIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </Svg>
  );
}

export function PhoneIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2Z" />
    </Svg>
  );
}

// Like ChevronIcon, this points forward in reading order rather than east —
// callers flip it with `rtl:-scale-x-100`.
export function ArrowIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M4 12h15m-6-6 6 6-6 6" />
    </Svg>
  );
}

// The spin-on canister every oil/fuel filter in the catalog looks like.
export function FilterCanisterIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <rect x="6" y="3.5" width="12" height="17" rx="2.5" />
      <path d="M6.3 7.5h11.4M6.3 16.5h11.4M10 3.7v3.6M14 3.7v3.6" />
    </Svg>
  );
}

// A pleated panel — the flat air/cabin filter, as distinct from the canister.
export function FilterPanelIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7.5 6v12M12 6v12M16.5 6v12" />
    </Svg>
  );
}

// The catch-all for a category with no glyph of its own, and for "everything
// else" links.
export function GridIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </Svg>
  );
}

export function ShieldIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M12 2.8l7 2.6v6c0 4.4-2.9 8.3-7 9.8-4.1-1.5-7-5.4-7-9.8v-6Z" />
      <path d="m9 11.8 2.2 2.2L15.2 10" />
    </Svg>
  );
}

export function GearIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v2.6M12 18.9v2.6M21.5 12h-2.6M5.1 12H2.5M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8M18.7 18.7l-1.8-1.8M7.1 7.1 5.3 5.3" />
    </Svg>
  );
}

// The award rosette — "trusted brands", not a generic checkmark.
export function MedalIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="9" r="6" />
      <path d="m9.3 12.2-1.1 8.3 3.8-2.3 3.8 2.3-1.1-8.3" />
    </Svg>
  );
}

export function TruckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M3 6.5h10.5v9H3zM13.5 9.5H17l3 3v3h-6.5z" />
      <circle cx="7" cy="17.5" r="1.6" />
      <circle cx="16.5" cy="17.5" r="1.6" />
    </Svg>
  );
}

export type StorefrontIcon = typeof OilBottleIcon;

// A glyph per category, keyed on slug like every other piece of
// category-specific behaviour in this codebase (never on `nameEn`, never on
// `partType` — see CLAUDE.md). Purely decorative, so a category the seed
// doesn't know about still renders; callers fall back to `GridIcon`.
//
// A map rather than a `categoryIcon(slug)` helper on purpose: a function that
// returns a component reads as a component factory, and both React's rules and
// the lint rule enforcing them want the lookup to be a plain property access.
export const CATEGORY_ICONS: Record<string, StorefrontIcon> = {
  "engine-oil": OilBottleIcon,
  "oil-filter": FilterCanisterIcon,
  "fuel-filter": FilterCanisterIcon,
  "air-filter": FilterPanelIcon,
  "cabin-filter": FilterPanelIcon,
};
