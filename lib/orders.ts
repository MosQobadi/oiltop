// The customer-facing name of an order, shared by the admin screens and the
// storefront's confirmation. A cuid is not something anyone reads out on the
// phone, so an order is quoted by the last eight characters of its id — and
// both surfaces have to spell that the same way, or a customer's "#A1B2C3D4"
// won't match anything the admin can search for.
export function formatOrderNumber(id: string): string {
  return `#${id.slice(-8).toUpperCase()}`;
}
