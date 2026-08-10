import { MailIcon, PhoneIcon } from "../icons";
import { pickLocale, type Locale } from "@/lib/i18n";
import type { PublicSettings } from "@/server/setting";

// The last thing above the footer: three plain claims, two of which end in a
// real way to reach a human. The contact details come from Settings (same read
// the shell already does), so a changed support number updates here too — and a
// card whose Settings field is blank simply drops its contact line rather than
// printing an empty one, matching StorefrontFooter's rule.

export function TrustStrip({ locale, settings }: { locale: Locale; settings: PublicSettings }) {
  const { supportPhone, supportEmail } = settings;

  return (
    <section className="mx-auto w-full max-w-[1180px] px-4 pb-4 sm:px-6">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <TrustCard
          title={pickLocale(locale, "Genuine stock only", "فقط کالای اصل")}
          body={pickLocale(
            locale,
            "Direct import, with a traceable batch code on every pack.",
            "واردات مستقیم، با کد رهگیری روی هر بسته.",
          )}
        />

        <TrustCard
          title={pickLocale(locale, "Talk to a mechanic", "پشتیبانی کارشناسی")}
          body={pickLocale(
            locale,
            "Not sure which grade your engine takes? Ask before you buy.",
            "مطمئن نیستید موتورتان چه گریدی می‌خواهد؟ پیش از خرید بپرسید.",
          )}
          contact={
            supportPhone
              ? {
                  // Admins type phone numbers with spacing for readability; a
                  // tel: URI can't carry it. Same treatment as the footer.
                  href: `tel:${supportPhone.replace(/\s+/g, "")}`,
                  label: supportPhone,
                  icon: <PhoneIcon className="h-3.5 w-3.5 shrink-0" />,
                }
              : undefined
          }
        />

        <TrustCard
          title={pickLocale(locale, "Nationwide delivery", "ارسال سراسری")}
          body={pickLocale(
            locale,
            "Same-day in Tehran, 2–4 working days everywhere else.",
            "تهران همان روز، سایر شهرها ۲ تا ۴ روز کاری.",
          )}
          contact={
            supportEmail
              ? {
                  href: `mailto:${supportEmail}`,
                  label: supportEmail,
                  icon: <MailIcon className="h-3.5 w-3.5 shrink-0" />,
                }
              : undefined
          }
        />
      </ul>
    </section>
  );
}

function TrustCard({
  title,
  body,
  contact,
}: {
  title: string;
  body: string;
  contact?: { href: string; label: string; icon: React.ReactNode };
}) {
  return (
    <li className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-[15px] font-medium text-neutral-900">{title}</h2>
      <p className="mt-1.5 text-[13.5px] text-pretty text-neutral-500">{body}</p>
      {contact && (
        <a
          href={contact.href}
          className="focus-visible:ring-accent text-accent mt-2.5 inline-flex min-h-11 items-center gap-2 rounded font-mono text-[13.5px] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {contact.icon}
          <span dir="ltr">{contact.label}</span>
        </a>
      )}
    </li>
  );
}
