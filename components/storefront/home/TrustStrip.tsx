import Image from "next/image";
import { MailIcon, PhoneIcon } from "../icons";
import { pickLocale, type Locale } from "@/lib/i18n";
import type { PublicSettings } from "@/server/setting";

// The last thing above the footer, and the only place on the homepage that
// shows rather than tells. Everything above it is drawn: the hero's ground is a
// gradient standing in for a lit workshop, the category cards are catalogue
// photography. So a customer reaches the footer having been promised six things
// — four in the hero's strip, three here — with nothing behind any of them. The
// photograph is the evidence. Stocked shelves, two bays in use, someone working.
//
// The three claims are unchanged, and two of them still end in a real way to
// reach a human. A card whose Settings field is blank drops its contact line
// rather than printing an empty one, matching StorefrontFooter's rule.
//
// Why the photo sits here rather than in the hero, which is where a shop photo
// usually goes: the hero's point is the FitmentWizard, and that white card reads
// as the one thing you're meant to touch only because the ground behind it is
// flat. A hero also wants a wide crop, and this frame is tall — its subject is a
// band across the top with a long empty floor beneath. A column beside a stacked
// list is the one shape that takes the whole frame without cropping the shop out
// of it, and being below the fold means the photo costs nothing on LCP.

// Saved by hand into public/ rather than uploaded through the admin. This is
// editorial photography of the business, not catalogue content, so it doesn't
// belong in public/uploads/ among the product and category images an admin
// manages and can replace.
//
// It's also a third kind of image, following neither of the catalogue's two
// rules: not a product's white-background pack shot, not a category's
// full-bleed photograph under a scrim. Those two treatments aren't available to
// it and it shouldn't borrow them.
const WORKSHOP_PHOTO = "/workshop.jpg";

// Matches the `lg` column below exactly; under it the figure is the full
// content width, which `92vw` covers at every step down to the smallest phone.
const PHOTO_SIZES = "(min-width: 1024px) 480px, 92vw";

// For the caption, not for the picture. The floor this crop keeps is dark
// already, but it's polished concrete under shop lights and the reflections on
// it run bright enough to eat white text.
const CAPTION_SCRIM_STYLE = {
  backgroundImage: "linear-gradient(to top, oklch(0.145 0.012 26 / 0.85) 0%, transparent 100%)",
};

export function TrustStrip({ locale, settings }: { locale: Locale; settings: PublicSettings }) {
  const { storeName, supportPhone, supportEmail } = settings;

  return (
    <section className="mx-auto w-full max-w-[1180px] px-4 py-14 sm:px-6 lg:py-16">
      {/* Centred rather than stretched: the photo column is the taller of the
          two at `lg`, and a three-item list pulled to match its height would
          space itself out until the claims stopped reading as a list. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)] lg:items-center lg:gap-16">
        <figure className="relative m-0 overflow-hidden rounded-2xl ring-1 ring-fg/10 ring-inset">
          {/* Two shapes, both anchored to the top of the frame, and both
              shorter than the source. The shop — shelves, the two bays, the
              technician — sits in a band across the top of the frame, and
              everything under it is empty floor. Printed at its own proportions
              that floor takes over half the picture and the evidence shrinks to
              a strip, so both crops cut it back: enough left under the subject
              to read as a room and to give the caption somewhere to sit, not so
              much that the room is mostly floor. */}
          <div className="relative aspect-[4/3] w-full lg:aspect-square">
            <Image
              src={WORKSHOP_PHOTO}
              alt={pickLocale(
                locale,
                "Inside our workshop: oil and filters stocked along the wall, two cars up on the lifts, and a technician at work.",
                "داخل تعمیرگاه ما: روغن و فیلتر روی قفسه‌های دیوار، دو خودرو روی جک، و تکنسینی در حال کار.",
              )}
              fill
              sizes={PHOTO_SIZES}
              // The one image on the homepage that is genuinely below the fold
              // on every screen size, so it waits its turn rather than
              // competing with the hero for the connection.
              loading="lazy"
              className="object-cover object-top"
            />
          </div>

          <span
            aria-hidden="true"
            style={CAPTION_SCRIM_STYLE}
            className="pointer-events-none absolute inset-x-0 bottom-0 h-32"
          />

          {/* The hero's eyebrow — accent hairline, small muted line — reused
              here so the page's first band and its last are visibly the same
              site. Naming the shop is what turns this from a photograph of a
              workshop into a photograph of *ours*. */}
          <figcaption className="absolute inset-x-0 bottom-0 p-5">
            <p
              className={`flex items-center gap-3 text-[12px] text-white/70 ${
                // Persian has no capital letters, and letter-spacing breaks its
                // joined letterforms. Same carve-out the hero makes.
                locale === "en" ? "tracking-[0.14em] uppercase" : "tracking-normal"
              }`}
            >
              <span aria-hidden="true" className="bg-accent-on-dark h-px w-9 shrink-0" />
              {pickLocale(locale, "Our workshop", "تعمیرگاه ما")}
            </p>

            {storeName.trim() !== "" && (
              <p className="mt-1.5 text-[16px] font-semibold tracking-[-0.015em] text-white">
                {storeName}
              </p>
            )}
          </figcaption>
        </figure>

        {/* One measure for the whole column rather than a max-width per
            paragraph. The claims below are separated by hairlines, and a rule
            is only readable as a divider if it ends where the text does — left
            to fill the column it strands across empty space, most visibly in
            the Persian tree, where the text sets to the right and the slack all
            collects on one side. */}
        <div className="max-w-[46ch]">
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-fg">
            {pickLocale(locale, "The shop behind the site", "فروشگاه پشت این سایت")}
          </h2>
          <p className="mt-1.5 text-[13.5px] text-pretty text-fg-subtle">
            {pickLocale(
              locale,
              "Same shelves, same technicians, same oil — whether you order online or bring the car in.",
              "همان قفسه‌ها، همان تکنسین‌ها، همان روغن — چه آنلاین سفارش دهید، چه خودرو را بیاورید.",
            )}
          </p>

          {/* Hairline-separated rows rather than the three bordered cards this
              was before. Beside a photograph, three boxes read as a second
              picture competing with the first; a list reads as its caption. */}
          <ul className="mt-7">
            <TrustClaim
              title={pickLocale(locale, "Genuine stock only", "فقط کالای اصل")}
              body={pickLocale(
                locale,
                "Direct import, with a traceable batch code on every pack.",
                "واردات مستقیم، با کد رهگیری روی هر بسته.",
              )}
            />

            <TrustClaim
              title={pickLocale(locale, "Talk to a mechanic", "پشتیبانی کارشناسی")}
              body={pickLocale(
                locale,
                "Not sure which grade your engine takes? Ask before you buy.",
                "مطمئن نیستید موتورتان چه گریدی می‌خواهد؟ پیش از خرید بپرسید.",
              )}
              contact={
                supportPhone
                  ? {
                      // Admins type phone numbers with spacing for readability;
                      // a tel: URI can't carry it. Same treatment as the footer.
                      href: `tel:${supportPhone.replace(/\s+/g, "")}`,
                      label: supportPhone,
                      icon: <PhoneIcon className="h-3.5 w-3.5 shrink-0" />,
                    }
                  : undefined
              }
            />

            <TrustClaim
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
        </div>
      </div>
    </section>
  );
}

function TrustClaim({
  title,
  body,
  contact,
}: {
  title: string;
  body: string;
  contact?: { href: string; label: string; icon: React.ReactNode };
}) {
  return (
    <li className="border-t border-line py-4 first:border-t-0 first:pt-0 last:pb-0">
      {/* An h3 now, not an h2: the band above them is the section's heading, and
          three sibling h2s under it would flatten the outline a screen reader
          reads out. */}
      <h3 className="text-[15px] font-medium text-fg">{title}</h3>
      <p className="mt-1 text-[13.5px] text-pretty text-fg-subtle">{body}</p>
      {contact && (
        <a
          href={contact.href}
          className="focus-visible:ring-accent text-accent mt-1.5 inline-flex min-h-11 items-center gap-2 rounded font-mono text-[13.5px] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {contact.icon}
          <span dir="ltr">{contact.label}</span>
        </a>
      )}
    </li>
  );
}
