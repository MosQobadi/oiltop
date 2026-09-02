import { Breadcrumbs } from "@/components/storefront/Breadcrumbs";
import { FitmentWizard } from "@/components/storefront/fitment/FitmentWizard";
import { PriceDisplay } from "@/components/storefront/PriceDisplay";
import {
  ProductCard,
  ProductCardSkeleton,
  type ProductCardProduct,
} from "@/components/storefront/ProductCard";
import { navHref } from "@/components/storefront/nav-items";
import { StockBadge } from "@/components/storefront/StockBadge";
import { pickLocale, type Locale } from "@/lib/i18n";

const BASE: ProductCardProduct = {
  id: "demo-1",
  slug: "mobil-1-esp-5w30-4l",
  nameEn: "Mobil 1 ESP 5W-30 · 4 L",
  nameFa: "موبیل ۱ ای‌اس‌پی ۵W-۳۰ — ۴ لیتری",
  image: null,
  price: 5400000,
  finalPrice: 4850000,
  stockStatus: null,
  brand: { nameEn: "MOBIL 1", nameFa: "موبیل ۱" },
};

const CARDS: { caption: string; product: ProductCardProduct; ribbon?: boolean }[] = [
  { caption: "default · discounted · in stock", product: BASE },
  {
    caption: "no discount · low stock",
    product: {
      ...BASE,
      id: "demo-2",
      slug: "shell-helix-ultra-5w40",
      nameEn: "Shell Helix Ultra 5W-40 · 4 L",
      nameFa: "شل هلیکس اولترا ۵W-۴۰ — ۴ لیتری",
      price: 4290000,
      finalPrice: 4290000,
      stockStatus: "LOW_STOCK",
      brand: { nameEn: "SHELL", nameFa: "شل" },
    },
  },
  {
    caption: "out of stock · CTA discloses Notify me",
    product: {
      ...BASE,
      id: "demo-3",
      slug: "liqui-moly-top-tec-4200-5w30",
      nameEn: "Liqui Moly Top Tec 4200 5W-30",
      nameFa: "لیکومولی تاپ‌تک ۴۲۰۰ ۵W-۳۰",
      price: 5640000,
      finalPrice: 5640000,
      stockStatus: "OUT_OF_STOCK",
      brand: { nameEn: "LIQUI MOLY", nameFa: "لیکومولی" },
    },
  },
  { caption: "fits-your-car ribbon slot", product: { ...BASE, id: "demo-4" }, ribbon: true },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-mono text-[11px] tracking-[0.09em] text-fg-subtle uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function StorefrontPrimitivesDemo({ locale }: { locale: Locale }) {
  return (
    <div className="flex flex-col gap-10">
      <Section title="Breadcrumbs">
        <Breadcrumbs
          locale={locale}
          items={[
            { label: pickLocale(locale, "Home", "خانه"), href: navHref(locale, "") },
            { label: pickLocale(locale, "Engine oil", "روغن موتور") },
          ]}
        />
      </Section>

      <Section title="StockBadge">
        <div className="flex flex-wrap items-center gap-4">
          <StockBadge locale={locale} status={null} />
          <StockBadge locale={locale} status="LOW_STOCK" />
          <StockBadge locale={locale} status="OUT_OF_STOCK" />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <StockBadge locale={locale} status={null} variant="pill" />
          <StockBadge locale={locale} status="LOW_STOCK" variant="pill" />
          <StockBadge locale={locale} status="OUT_OF_STOCK" variant="pill" />
        </div>
      </Section>

      <Section title="PriceDisplay">
        <PriceDisplay locale={locale} price={5400000} finalPrice={4850000} />
        <PriceDisplay locale={locale} price={4290000} finalPrice={4290000} />
        <PriceDisplay locale={locale} price={5400000} finalPrice={4850000} size="lg" />
      </Section>

      <Section title="ProductCard">
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {CARDS.map(({ caption, product, ribbon }) => (
            <div key={product.id} className="flex flex-col gap-2">
              <ProductCard
                locale={locale}
                product={product}
                fitsRibbon={
                  ribbon ? (
                    <span className="bg-accent/10 text-accent rounded-md px-1.5 py-0.5 text-[11px] font-medium">
                      {pickLocale(locale, "Fits your car", "مناسب خودروی شما")}
                    </span>
                  ) : undefined
                }
              />
              <p className="text-[11px] text-fg-faint">{caption}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Both wizards run against the real /api/storefront/cars/* routes, so
          resolving one navigates to /{locale}/fitment?fit=… — a 404 until the
          results page (Task 3.2) exists. */}
      <Section title="FitmentWizard · full">
        <div className="max-w-[560px]">
          <FitmentWizard locale={locale} />
        </div>
      </Section>

      <Section title="FitmentWizard · compact (homepage widget)">
        <div className="max-w-[720px]">
          <FitmentWizard locale={locale} mode="compact" />
        </div>
      </Section>

      <Section title="ProductCardSkeleton">
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <ProductCardSkeleton />
          <ProductCardSkeleton />
          <ProductCardSkeleton />
          <ProductCardSkeleton />
        </div>
      </Section>
    </div>
  );
}
