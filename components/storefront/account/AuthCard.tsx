import Link from "next/link";
import { LOGIN_PATH, navHref, REGISTER_PATH } from "@/components/storefront/nav-items";
import { pickLocale, type Locale } from "@/lib/i18n";

// The prototype's account card: a two-tab pill switcher over a titled form.
// The tabs are `Link`s to two real routes rather than client state over one —
// /login and /register each deserve a URL a customer can be sent to, which is
// what the Task 7.2 route guard redirects to.

export interface AuthCardProps {
  locale: Locale;
  active: "login" | "register";
  title: string;
  subtitle: string;
  // The guard's return path, carried onto both tab links so that a customer who
  // arrives at /login and decides to register still lands back where they were
  // headed. Without this the switch would silently drop it.
  from?: string;
  children: React.ReactNode;
}

export function AuthCard({ locale, active, title, subtitle, from, children }: AuthCardProps) {
  const query = from ? `?from=${encodeURIComponent(from)}` : "";

  return (
    <div className="mx-auto w-full max-w-[460px] rounded-2xl border border-neutral-200 bg-white p-6">
      <div
        role="tablist"
        aria-label={pickLocale(locale, "Account", "حساب من")}
        className="flex gap-1 rounded-[11px] bg-neutral-100 p-1"
      >
        <Tab
          locale={locale}
          href={`${navHref(locale, LOGIN_PATH)}${query}`}
          active={active === "login"}
          label={pickLocale(locale, "Log in", "ورود")}
        />
        <Tab
          locale={locale}
          href={`${navHref(locale, REGISTER_PATH)}${query}`}
          active={active === "register"}
          label={pickLocale(locale, "Register", "ثبت‌نام")}
        />
      </div>

      <h1 className="mt-5 text-[21px] font-semibold tracking-tight text-neutral-900">{title}</h1>
      <p className="mt-1.5 text-[13.5px] text-pretty text-neutral-600">{subtitle}</p>

      <div className="mt-[18px]">{children}</div>
    </div>
  );
}

function Tab({
  href,
  active,
  label,
}: {
  locale: Locale;
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={`focus-visible:ring-accent min-h-10 flex-1 rounded-lg px-3 py-2.5 text-center text-[13.5px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none ${
        active ? "text-accent bg-white" : "hover:text-accent text-neutral-600"
      }`}
    >
      {label}
    </Link>
  );
}
