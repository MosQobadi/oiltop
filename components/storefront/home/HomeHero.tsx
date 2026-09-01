import Link from "next/link";
import { ArrowIcon, GearIcon, MedalIcon, ShieldIcon, TruckIcon } from "../icons";
import { FitmentWizard } from "../fitment/FitmentWizard";
import { navHref, PRODUCTS_PATH } from "../nav-items";
import { pickLocale, type Locale } from "@/lib/i18n";

// The homepage's opening screen: a dark banner carrying the pitch on one side
// and the car-finder on the other. The wizard is the point of the page —
// everything beside it is there to say what this shop sells and to give a
// customer who already knows what they want a way past it.
//
// Three bands, top to bottom: eyebrow + headline + line of copy (with the
// wizard alongside on desktop, under them on mobile), the "browse everything"
// button, and a strip of four promises closing the banner off. The button sits
// *after* the wizard in both layouts — it's the way out of the finder, so it
// shouldn't be reachable before you've seen the finder.

// Warm near-black, with an accent-tinted glow low on the wizard's side — the
// same ground the category cards sit on, lit rather than flat.
const HERO_STYLE = {
  backgroundColor: "oklch(0.22 0.012 55)",
  backgroundImage: [
    "radial-gradient(80% 70% at 78% 8%, oklch(0.36 0.06 42 / 0.75) 0%, transparent 62%)",
    "radial-gradient(60% 60% at 8% 100%, oklch(0.30 0.03 50 / 0.6) 0%, transparent 70%)",
  ].join(","),
};

export function HomeHero({ locale }: { locale: Locale }) {
  // Persian has no capital letters, and letter-spacing breaks its joined
  // letterforms — so the banner's all-caps, wide-tracked treatment is applied
  // to the English tree only. Both trees get the same layout and weight.
  const isEn = locale === "en";
  const capsClass = isEn ? "uppercase tracking-[0.14em]" : "tracking-normal";

  return (
    <section style={HERO_STYLE} className="text-white">
      {/* The promise strip carries the banner's bottom padding, and it's gone
          on phones — so the container has to supply that padding itself there. */}
      <div className="mx-auto w-full max-w-[1180px] px-4 pt-12 pb-10 sm:px-6 sm:pb-0 lg:pt-16">
        <div className="grid gap-10 lg:grid-cols-[1fr_minmax(0,430px)] lg:items-center lg:gap-14">
          <div>
            <p className={`flex items-center gap-3 text-[12px] text-white/70 ${capsClass}`}>
              <span aria-hidden="true" className="bg-accent-on-dark h-px w-9 shrink-0" />
              {pickLocale(locale, "Premium", "اصل و تضمینی")}
            </p>

            {/* Two lines by design, the second in the accent — the banner's
                whole shape depends on the break landing in the same place, so
                it's a block element rather than a wrapped phrase. */}
            <h1
              className={`mt-4 text-[34px] leading-[1.05] font-bold text-balance sm:text-[46px] lg:text-[52px] ${
                // The optical tightening a big Latin headline wants is the same
                // adjustment that pulls joined Persian letterforms into each
                // other, so it stops at the English tree too.
                isEn ? "tracking-[-0.02em] uppercase" : ""
              }`}
            >
              <span className="block">{pickLocale(locale, "The right parts", "قطعه‌ی درست")}</span>
              <span className="text-accent-on-dark block">
                {pickLocale(locale, "for your car", "برای خودروی شما")}
              </span>
            </h1>

            <p className="mt-5 max-w-[46ch] text-[15px] text-pretty text-white/70 sm:text-[16px]">
              {pickLocale(
                locale,
                "Tell us what you drive. We match the exact viscosity, spec and filter your engine was built for.",
                "بگویید چه خودرویی دارید. ما دقیقاً همان گرانروی، استاندارد و فیلتری را پیدا می‌کنیم که موتور شما برایش ساخته شده است.",
              )}
            </p>
          </div>

          {/* The wizard keeps its own white card — on this background it reads as
              the one thing on the page you're meant to touch. */}
          <FitmentWizard locale={locale} mode="compact" />
        </div>

        {/* Outside the grid so it lands under the wizard in both layouts, not
            beside it. */}
        <Link
          href={navHref(locale, PRODUCTS_PATH)}
          className={`bg-accent hover:bg-accent/90 focus-visible:ring-accent-on-dark mt-8 inline-flex min-h-12 items-center gap-3 rounded-[10px] px-6 text-[14px] font-semibold text-white transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 focus-visible:outline-none ${capsClass}`}
        >
          {pickLocale(locale, "Shop now", "شروع خرید")}
          <ArrowIcon className="h-4 w-4 rtl:-scale-x-100" />
        </Link>

        <PromiseStrip locale={locale} />
      </div>
    </section>
  );
}

// The four claims closing the banner. Deliberately terse — the pre-footer
// TrustStrip is where the same promises get a sentence each and a phone number
// to act on; here they're a reassurance you read on the way to the wizard.
//
// Hidden on phones: on a narrow screen they stack into four full-width rows
// that push the whole banner past a screen and a half, and the TrustStrip says
// all of it again further down the page anyway.
function PromiseStrip({ locale }: { locale: Locale }) {
  const items = [
    {
      icon: ShieldIcon,
      title: pickLocale(locale, "Premium quality", "کیفیت اصل"),
      body: pickLocale(locale, "Reliable performance", "عملکرد مطمئن"),
    },
    {
      icon: GearIcon,
      title: pickLocale(locale, "Engine protection", "محافظت از موتور"),
      body: pickLocale(locale, "Longer engine life", "عمر بیشتر موتور"),
    },
    {
      icon: MedalIcon,
      title: pickLocale(locale, "Trusted brands", "برندهای معتبر"),
      body: pickLocale(locale, "Only the best", "فقط بهترین‌ها"),
    },
    {
      icon: TruckIcon,
      title: pickLocale(locale, "Fast delivery", "ارسال سریع"),
      body: pickLocale(locale, "To your door", "درب منزل شما"),
    },
  ];

  return (
    <ul className="mt-12 hidden gap-x-6 gap-y-5 border-t border-white/12 py-6 sm:grid sm:grid-cols-2 lg:mt-16 lg:grid-cols-4 lg:gap-x-0">
      {items.map(({ icon: Icon, title, body }) => (
        <li
          key={title}
          className="flex items-center gap-3.5 lg:border-s lg:border-white/12 lg:ps-6 lg:first:border-s-0 lg:first:ps-0"
        >
          <Icon className="text-accent-on-dark h-6 w-6 shrink-0" />
          <div className="min-w-0">
            <div className="text-[13.5px] font-medium text-white">{title}</div>
            <p className="text-[12.5px] text-white/55">{body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
