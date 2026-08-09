"use client";

import { usePathname } from "next/navigation";
import { Avatar, Button } from "@heroui/react";
import { getPageTitle } from "./nav-items";
import { LogoutIcon } from "./icons";
import { useAuthStore } from "@/lib/store/auth";

function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export function AdminTopbar() {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-6">
      <h1 className="text-base font-semibold text-neutral-900">{getPageTitle(pathname)}</h1>

      {user && (
        <div className="flex items-center gap-3">
          <Avatar>
            <Avatar.Fallback>{initials(user.firstName, user.lastName)}</Avatar.Fallback>
          </Avatar>
          <span className="text-sm font-medium text-neutral-700">
            {user.firstName} {user.lastName}
          </span>
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            aria-label="Logout"
            onPress={() => void logout()}
          >
            <LogoutIcon className="h-4 w-4" />
          </Button>
        </div>
      )}
    </header>
  );
}
