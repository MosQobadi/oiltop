import type { SVGProps } from "react";

// Hand-rolled outline icons for the admin sidebar/topbar — one component each
// for Dashboard, Products, Categories, Brands, Cars & Fitment, Inventory,
// Orders, Customers, Inquiries, Settings, Logout, plus Preview (Fitment
// Preview sub-item) and Chevron (collapsible section indicator). Kept local
// instead of pulling in an icon library for a handful of glyphs.

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

export function DashboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.25" />
      <rect x="13.5" y="3.5" width="7" height="4.5" rx="1.25" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="1.25" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.25" />
    </Svg>
  );
}

export function ProductsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z" />
      <path d="M3.5 7.5 12 11.5l8.5-4" />
      <path d="M12 11.5v9" />
    </Svg>
  );
}

export function CategoriesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M12 3.5 3.5 8.25 12 13l8.5-4.75z" />
      <path d="m3.5 12.75 8.5 4.75 8.5-4.75" />
      <path d="m3.5 17.25 8.5 4.75 8.5-4.75" />
    </Svg>
  );
}

export function BrandsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M6 3.5h12v17l-6-3.5-6 3.5z" />
    </Svg>
  );
}

export function CarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M4.5 15v-2.5L6.5 7h11l2 5.5V15" />
      <path d="M3.5 15h17v3.5a1 1 0 0 1-1 1H16a1 1 0 0 1-1-1V17H9v1.5a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1z" />
      <circle cx="7.25" cy="15" r="1.25" />
      <circle cx="16.75" cy="15" r="1.25" />
    </Svg>
  );
}

export function PreviewIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.75" />
    </Svg>
  );
}

export function InventoryIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="4" width="17" height="4" rx="1" />
      <path d="M4.5 8v10.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V8" />
      <path d="M10 12.5h4" />
    </Svg>
  );
}

export function OrdersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <rect x="5" y="3.5" width="14" height="17" rx="1.5" />
      <path d="M9 3.5v2.5h6V3.5" />
      <path d="M8.5 11h7M8.5 14.5h7M8.5 18h4.5" />
    </Svg>
  );
}

export function CustomersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
      <path d="M15.5 5.5a3.25 3.25 0 0 1 0 6.4" />
      <path d="M17 13.75c2.1.5 3.5 2.5 3.5 5.75" />
    </Svg>
  );
}

export function InquiriesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M4 5.5h16v10.5H9l-4 3.5v-3.5H4z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </Svg>
  );
}

export function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.25M12 18.25v2.25M20.5 12h-2.25M5.75 12H3.5M17.66 6.34l-1.59 1.59M7.93 16.07l-1.59 1.59M17.66 17.66l-1.59-1.59M7.93 7.93 6.34 6.34" />
    </Svg>
  );
}

export function LogoutIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M9 20H5.5a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 5.5 4H9" />
      <path d="M15.5 16.5 20 12l-4.5-4.5" />
      <path d="M20 12H9" />
    </Svg>
  );
}

export function ChevronDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}
