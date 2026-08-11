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
