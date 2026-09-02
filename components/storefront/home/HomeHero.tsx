import Image from "next/image";
import { GearIcon, MedalIcon, ShieldIcon, TruckIcon } from "../icons";
import { FitmentWizard } from "../fitment/FitmentWizard";
import { pickLocale, type Locale } from "@/lib/i18n";

// The homepage's opening screen: a lit product still-life on a near-black
// ground, with the pitch and the car-finder stacked in a column beside it.
//
// One column, top to bottom: eyebrow, two-line headline, a line of copy, the
// finder, and a strip of four promises closing the banner off. The photograph
// takes the other half of the banner from `lg` up and is dropped entirely below
// that — on a phone it would push the finder a screen and a half down, which is
// the opposite of what this banner is for.
//
// The wizard is still the point of the page. It reads as the thing to touch
// because it is the only bordered, blurred panel on the banner, not because it
// is the only white thing — see `tone="dark"` on FitmentWizard.

// The photograph: parts lit against black, no background of its own — cut out
// so its edges dissolve into the banner rather than ending on a visible
// rectangle, and cropped tight to the subject so `object-bottom` stands the
// parts on the floor line instead of on invisible padding.
//
// Deliberately *not* mirrored on /fa, unlike every decorative layer here: the
// bottle is labelled, and a flipped label is unreadable rather than merely
// backwards. The composition is close enough to symmetric to take being read
// from either side — in LTR its open side (the air filter) faces the copy, in
// RTL the bottle's mass does.
//
// Saved by hand into public/ rather than uploaded through the admin, the same
// as TrustStrip's workshop photo: this is art direction for the banner, not
// catalogue content, and it follows neither of the catalogue's two image rules
// (it is emphatically not a white-background pack shot).
const HERO_PHOTO = "/hero-parts.png";

// The slot lives *inside* the 1180px content container, not in the full-bleed
// section. That is what keeps the parts still: measured against the viewport
// they drift outward as the window widens — the container stops growing at
// 1180px but the viewport does not, so every pixel past that pushed the
// still-life further from the copy and made it look bigger and bigger. Bounded
// by the container instead, the photograph stops where the promise strip below
// it stops, and past 1180px nothing about it changes.
//
// 620px is the copy column's own width — a fixed 560px — plus the container's
// 24px of padding and a 36px gutter. Below that the parts would run under the
// finder card, which is exactly what a viewport percentage did at 1024px.
const HERO_PHOTO_SLOT_STYLE = {
  top: 0,
  // Clear of the promise strip, so the parts stand on something rather than
  // overlapping four lines of text.
  bottom: "6rem",
  insetInlineStart: "620px",
  insetInlineEnd: 0,
};

// Only ever rendered at `lg` and up, where the slot tops out a little over
// 500px — so one width covers every case that actually draws it. Under `lg`
// the slot is `display:none` and the browser skips the download; `1px` rather
// than the more obvious `0px` because a zero slot makes some browsers pick the
// *smallest* candidate in the srcset and paint that, rather than fetching
// nothing.
const HERO_PHOTO_SIZES = "(min-width: 1024px) 560px, 1px";

// Near-black, warm rather than blue — the same family as the category cards'
// ground, dropped to banner depth. Everything lit on top of it is one accent
// hue (50), so the banner reads as a single light source rather than a set of
// separate gradients.
const HERO_STYLE = {
  backgroundColor: "oklch(0.16 0.007 55)",
};

// Three lighting layers, drawn in one element behind everything else.
//
// The key light sits behind the photograph and falls off before it reaches the
// text, so the copy column keeps a flat ground to read against. The floor line
// is what the reference gets from a studio sweep — a bright horizontal at the
// height the parts stand on, which is what stops the bottom of the banner from
// reading as a void. The streaks are the one purely graphic element: thin
// accent rules raked across the far corner, faded out by a mask before they
// reach the headline.
const BACKDROP_STYLE = {
  backgroundImage: [
    // Key light, behind the parts.
    "radial-gradient(58% 70% at 74% 46%, oklch(0.42 0.09 45 / 0.5) 0%, transparent 68%)",
    // A cooler lift low on the copy side, so the column isn't sitting on pure black.
    "radial-gradient(46% 55% at 6% 96%, oklch(0.26 0.02 55 / 0.55) 0%, transparent 72%)",
  ].join(","),
};

// Separate from BACKDROP_STYLE because it carries its own mask: the rules have
// to stop before they cross the headline, and a mask applies to the whole
// element, not to one background layer.
// The mask is in percentages of the banner, so it tightens on its own as the
// screen narrows — which it has to: on a phone a corner big enough to look
// right at 1440px rakes the rules straight across the headline.
const STREAK_MASK = "radial-gradient(54% 68% at 100% 0%, #000 0%, transparent 72%)";

const STREAK_STYLE = {
  backgroundImage:
    "repeating-linear-gradient(64deg, transparent 0 34px, oklch(0.62 0.18 45 / 0.5) 34px 36px)",
  maskImage: STREAK_MASK,
  WebkitMaskImage: STREAK_MASK,
};

// The bright horizontal the parts stand on, plus the haze it throws upward.
// Kept low: the promise strip sits in this band, and a haze strong enough to
// read as a lit floor is also strong enough to lift the ground behind those
// four lines of white text until they stop being white *on* something. The
// hairline is what does the work — the glow only has to say where it came from.
const FLOOR_STYLE = {
  backgroundImage: [
    "linear-gradient(to top, oklch(0.55 0.16 45 / 0.1) 0%, transparent 100%)",
    // Symmetric about the centre on purpose. Everything else on this banner is
    // keyed to a side and mirrors on /fa; a hairline that brightens toward the
    // middle reads the same in both trees and needs no flip.
    "linear-gradient(to right, transparent 0%, oklch(0.7 0.19 45 / 0.5) 28%, oklch(0.76 0.2 45 / 0.8) 52%, oklch(0.7 0.19 45 / 0.5) 74%, transparent 100%)",
  ].join(","),
  backgroundSize: "100% 100%, 100% 1px",
  backgroundPosition: "bottom, bottom",
  backgroundRepeat: "no-repeat, no-repeat",
};

export function HomeHero({ locale }: { locale: Locale }) {
  // Persian has no capital letters, and letter-spacing breaks its joined
  // letterforms — so the banner's all-caps, wide-tracked treatment is applied
  // to the English tree only. Both trees get the same layout and weight.
  const isEn = locale === "en";
  const capsClass = isEn ? "uppercase tracking-[0.14em]" : "tracking-normal";

  return (
    <section style={HERO_STYLE} className="relative isolate overflow-hidden text-white">
      {/* All four decorative layers are siblings of the content rather than
          backgrounds on it, so each can carry its own mask, blend and RTL
          behaviour without fighting the others.

          The first two are keyed to a side — the key light belongs behind the
          photograph and the cool lift belongs under the copy — so both mirror
          on /fa, where those two sides swap. Nothing in either layer is
          legible, which is what makes mirroring safe: the photograph itself is
          *not* mirrored, because the labels on it are. */}
      <span
        aria-hidden="true"
        style={BACKDROP_STYLE}
        className="pointer-events-none absolute inset-0 -z-10 rtl:-scale-x-100"
      />
      <span
        aria-hidden="true"
        style={STREAK_STYLE}
        className="pointer-events-none absolute inset-0 -z-10 rtl:-scale-x-100"
      />
      <span
        aria-hidden="true"
        style={FLOOR_STYLE}
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-32"
      />

      <div className="relative mx-auto w-full max-w-[1180px] px-4 pt-12 pb-10 sm:px-6 sm:pb-0 lg:pt-20">
        {/* Runs from the copy column's edge to the container's, so it lands
            opposite the copy in both trees and ends where the promise strip
            below it ends. `contain` keeps the still-life whole at every width;
            the banner's height is set by the column beside it, not by the
            photograph, which is why the parts get smaller on a narrow desktop
            instead of the banner getting taller. */}
        <div
          style={HERO_PHOTO_SLOT_STYLE}
          className="pointer-events-none absolute -z-10 hidden lg:block"
        >
          <Image
            src={HERO_PHOTO}
            // Decorative: the parts are named in the copy and in every section
            // below. A description here would be read out before the headline.
            alt=""
            fill
            sizes={HERO_PHOTO_SIZES}
            // Above the fold on the screens that render it, and large enough to
            // be the LCP element on most of them.
            priority
            className="object-contain object-bottom"
          />
        </div>

        {/* The copy column is capped rather than fractional: past about 560px
            the headline stops being two lines and the whole composition
            changes shape. The photograph takes whatever is left. */}
        <div className="max-w-[560px]">
          <p
            className={`text-accent-on-dark flex items-center gap-3 text-[12px] font-medium ${capsClass}`}
          >
            <span aria-hidden="true" className="bg-accent-on-dark h-px w-9 shrink-0" />
            {pickLocale(locale, "Premium quality", "اصل و تضمینی")}
          </p>

          {/* Two lines by design, the second in the accent — the banner's whole
              shape depends on the break landing in the same place, so each is a
              block element rather than a wrapped phrase. */}
          <h1
            className={`mt-5 text-[40px] leading-[1.02] font-bold text-balance sm:text-[56px] lg:text-[64px] ${
              // The optical tightening a big Latin headline wants is the same
              // adjustment that pulls joined Persian letterforms into each
              // other, so it stops at the English tree.
              isEn ? "tracking-[-0.035em]" : ""
            }`}
          >
            <span className="block">{pickLocale(locale, "The right parts", "قطعه‌ی درست")}</span>
            <span className="text-accent-on-dark block">
              {pickLocale(locale, "for your car", "برای خودروی شما")}
            </span>
          </h1>

          <p className="mt-6 max-w-[44ch] text-[15px] text-pretty text-white/65 sm:text-[16.5px]">
            {pickLocale(
              locale,
              "Tell us what you drive. We match the exact viscosity, spec and filter your engine was built for.",
              "بگویید چه خودرویی دارید. ما دقیقاً همان گرانروی، استاندارد و فیلتری را پیدا می‌کنیم که موتور شما برایش ساخته شده است.",
            )}
          </p>

          <FitmentWizard locale={locale} mode="compact" tone="dark" className="mt-9" />
        </div>

        <PromiseStrip locale={locale} />
      </div>
    </section>
  );
}

// The four claims closing the banner. Deliberately terse — the pre-footer
// TrustStrip is where the same promises get a sentence each and a phone number
// to act on; here they're a reassurance you read on the way to the finder.
//
// Hidden on phones: on a narrow screen they stack into four full-width rows
// that push the whole banner past a screen and a half, and the TrustStrip says
// all of it again further down the page anyway.
function PromiseStrip({ locale }: { locale: Locale }) {
  const items = [
    {
      icon: ShieldIcon,
      title: pickLocale(locale, "High performance", "عملکرد بالا"),
      body: pickLocale(locale, "Reliable protection", "محافظت مطمئن"),
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

  // No top rule: the floor line behind the strip already draws one across the
  // banner, and a second hairline a few pixels off it reads as a mistake. The
  // four items keep the dividers *between* them, which is what makes them a
  // row rather than four loose blocks.
  return (
    <ul className="mt-14 hidden gap-x-6 gap-y-5 pb-8 sm:grid sm:grid-cols-2 lg:mt-20 lg:grid-cols-4 lg:gap-x-0">
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
