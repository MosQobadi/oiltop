"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDownIcon, LogoutIcon } from "./icons";
import { isNavItemActive, navItems, type NavItem } from "./nav-items";
import { useAuthStore } from "@/lib/store/auth";

const linkClasses = (active: boolean) =>
  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
    active
      ? "bg-accent-soft text-accent-soft-foreground"
      : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
  }`;

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} className={linkClasses(active)}>
      <Icon className="h-5 w-5 shrink-0" />
      <span>{item.label}</span>
    </Link>
  );
}

function NavSection({ item, pathname }: { item: NavItem; pathname: string }) {
  const sectionActive = isNavItemActive(item, pathname);
  const [isOpen, setIsOpen] = useState(sectionActive);
  const Icon = item.icon;

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className={`${linkClasses(sectionActive && !isOpen)} w-full justify-between`}
      >
        <span className="flex items-center gap-3">
          <Icon className="h-5 w-5 shrink-0" />
          <span>{item.label}</span>
        </span>
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen && (
        <div className="mt-1 flex flex-col gap-1 border-l border-neutral-200 pl-4">
          {item.children?.map((child) => (
            <NavLink key={child.href} item={child} active={isNavItemActive(child, pathname)} />
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();
  const logout = useAuthStore((state) => state.logout);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="px-5 py-6">
        <span className="text-accent text-lg font-semibold">Top Oil</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3">
        {navItems.map((item) =>
          item.children ? (
            <NavSection key={item.href} item={item} pathname={pathname} />
          ) : (
            <NavLink key={item.href} item={item} active={isNavItemActive(item, pathname)} />
          ),
        )}
      </nav>

      <div className="border-t border-neutral-200 px-3 py-3">
        <button
          type="button"
          onClick={() => void logout()}
          className={`${linkClasses(false)} w-full`}
        >
          <LogoutIcon className="h-5 w-5 shrink-0" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
