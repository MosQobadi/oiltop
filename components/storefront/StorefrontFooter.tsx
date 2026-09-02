import Link from "next/link";
import { MailIcon, PhoneIcon } from "./icons";
import { CART_PATH, navHref, storefrontNavItems } from "./nav-items";
import { pickLocale, type Locale } from "@/lib/i18n";
import type { PublicSettings } from "@/server/setting";

const columnHeadingClass =
  "text-[11px] font-medium tracking-[0.09em] text-fg-subtle uppercase font-mono";
const footerLinkClass =
  "focus-visible:ring-accent hover:text-accent rounded text-sm text-fg-muted transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none";

// The store's own year: Persian shoppers read a Jalali calendar, so the
// copyright line follows the locale rather than printing a Gregorian year
// beside Persian digits.
function currentYear(locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", {
    year: "numeric",
  }).format(new Date());
}

export function StorefrontFooter({
  locale,
  settings,
}: {
  locale: Locale;
  settings: PublicSettings;
}) {
  const { storeName, supportEmail, supportPhone, socialLinks } = settings;
  const socials = Object.entries(socialLinks ?? {}).filter(([, url]) => url.trim() !== "");
  const shopItems = [
    ...storefrontNavItems,
    { key: "cart", labelEn: "Cart", labelFa: "سبد خرید", path: CART_PATH },
  ];

  return (
    <footer className="mt-20 border-t border-line bg-surface">
      <div className="mx-auto grid w-full max-w-[1180px] gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="text-base font-semibold tracking-tight text-fg">{storeName}</div>
          <p className="mt-2.5 max-w-[32ch] text-sm text-fg-muted">
            {pickLocale(
              locale,
              "Engine oil and filters matched to the car you actually drive.",
              "روغن موتور و فیلتر، متناسب با همان خودرویی که می‌رانید.",
            )}
          </p>
        </div>

        <nav aria-labelledby="footer-shop">
          <h2 id="footer-shop" className={columnHeadingClass}>
            {pickLocale(locale, "Shop", "خرید")}
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {shopItems.map((item) => (
              <li key={item.key}>
                <Link href={navHref(locale, item.path)} className={footerLinkClass}>
                  {pickLocale(locale, item.labelEn, item.labelFa)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Support details are only useful when Settings actually has them —
            an empty row would advertise a blank phone number. */}
        {(supportEmail || supportPhone) && (
          <div>
            <h2 className={columnHeadingClass}>{pickLocale(locale, "Contact", "تماس")}</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {supportEmail && (
                <li>
                  <a
                    href={`mailto:${supportEmail}`}
                    className={`${footerLinkClass} inline-flex items-center gap-2`}
                  >
                    <MailIcon className="h-4 w-4 shrink-0" />
                    <span dir="ltr">{supportEmail}</span>
                  </a>
                </li>
              )}
              {supportPhone && (
                <li>
                  <a
                    // Admins type phone numbers with spacing for readability;
                    // a tel: URI can't carry it.
                    href={`tel:${supportPhone.replace(/\s+/g, "")}`}
                    className={`${footerLinkClass} inline-flex items-center gap-2`}
                  >
                    <PhoneIcon className="h-4 w-4 shrink-0" />
                    <span dir="ltr">{supportPhone}</span>
                  </a>
                </li>
              )}
            </ul>
          </div>
        )}

        {socials.length > 0 && (
          <div>
            <h2 className={columnHeadingClass}>
              {pickLocale(locale, "Follow", "شبکه‌های اجتماعی")}
            </h2>
            <ul className="mt-3 flex flex-col gap-2">
              {socials.map(([name, url]) => (
                <li key={name}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={`${footerLinkClass} capitalize`}
                  >
                    {name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mx-auto w-full max-w-[1180px] px-4 pb-8 text-xs text-fg-subtle sm:px-6">
        {pickLocale(
          locale,
          `© ${currentYear(locale)} ${storeName}. Prices include VAT. Fitment data is advisory — always confirm against your owner’s manual.`,
          `© ${currentYear(locale)} ${storeName}. قیمت‌ها با احتساب مالیات بر ارزش افزوده است. اطلاعات تطابق جنبه‌ی راهنما دارد — همیشه با دفترچه‌ی خودرو مطابقت دهید.`,
        )}
      </div>
    </footer>
  );
}
