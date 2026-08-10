import { serializeJsonLd, type StructuredData } from "@/lib/storefront/structured-data";

// The one place a schema.org object becomes a tag. Next has no metadata field
// for JSON-LD — the documented way is a <script> the page renders itself — so
// this keeps `dangerouslySetInnerHTML` to a single audited line instead of one
// per page, with the escaping handled in `serializeJsonLd`.
export function JsonLd({ data }: { data: StructuredData }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
