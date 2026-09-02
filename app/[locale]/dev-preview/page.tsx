import { notFound } from "next/navigation";
import { StorefrontPrimitivesDemo } from "./StorefrontPrimitivesDemo";
import type { Locale } from "@/lib/i18n";

// Storefront counterpart to the admin panel's /dev-preview: a playground for the
// shared primitives in components/storefront/, rendered inside the real shell so
// both language trees (and RTL) can be checked at /en/dev-preview and
// /fa/dev-preview. Unlike the admin one this sits on the public tree, so it
// 404s outside development rather than shipping a demo page to customers.
export default async function StorefrontDevPreviewPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const { locale } = await params;

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-10 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-lg font-semibold text-fg">Storefront Dev Preview</h1>
        <p className="text-sm text-fg-subtle">
          Internal component playground — not a real storefront screen.
        </p>
      </div>

      <StorefrontPrimitivesDemo locale={locale} />
    </div>
  );
}
