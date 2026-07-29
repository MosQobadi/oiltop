import type { ComponentType, SVGProps } from "react";
import {
  BrandsIcon,
  CarIcon,
  CategoriesIcon,
  CustomersIcon,
  DashboardIcon,
  InquiriesIcon,
  InventoryIcon,
  OrdersIcon,
  PreviewIcon,
  ProductsIcon,
  SettingsIcon,
} from "./icons";

export interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  children?: NavItem[];
}

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: DashboardIcon },
  { label: "Products", href: "/admin/products", icon: ProductsIcon },
  { label: "Categories", href: "/admin/categories", icon: CategoriesIcon },
  { label: "Brands", href: "/admin/brands", icon: BrandsIcon },
  {
    label: "Cars & Fitment",
    href: "/admin/cars",
    icon: CarIcon,
    children: [
      { label: "Car Brands", href: "/admin/cars/brands", icon: BrandsIcon },
      { label: "Fitment Preview", href: "/admin/cars/preview", icon: PreviewIcon },
    ],
  },
  { label: "Inventory", href: "/admin/inventory", icon: InventoryIcon },
  { label: "Orders", href: "/admin/orders", icon: OrdersIcon },
  { label: "Customers", href: "/admin/customers", icon: CustomersIcon },
  { label: "Inquiries", href: "/admin/inquiries", icon: InquiriesIcon },
  { label: "Settings", href: "/admin/settings", icon: SettingsIcon },
];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

// Longest matching href wins, so a child route (e.g. /admin/cars/brands)
// reports its own title rather than the parent section's.
export function getPageTitle(pathname: string): string {
  let best: NavItem | null = null;

  const consider = (item: NavItem) => {
    if (isNavItemActive(item, pathname)) {
      if (!best || item.href.length > best.href.length) {
        best = item;
      }
    }
    item.children?.forEach(consider);
  };

  navItems.forEach(consider);

  return best ? (best as NavItem).label : "Admin";
}
