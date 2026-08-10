// Every list screen's search box is one text input matched against several
// columns, so the naive `contains: query` fails whenever the thing the admin
// typed isn't stored in a single column exactly as typed:
//
//   - "Sara Ahmadi" matched nothing on Orders/Customers, because the name is
//     split across firstName and lastName and neither contains the whole
//     string.
//   - "Mobil 5W-30" misses a product named "Mobil 1 5W-30" over the stray "1".
//
// Splitting on whitespace and requiring every token to match *somewhere*
// (an AND of ORs) fixes both, and lets a query span columns — "Sara Ahmadi"
// matches firstName + lastName, "Peugeot 206" matches brand + model. A
// single-word query behaves exactly as it did before.
export function searchTokens(search: string | undefined): string[] {
  return (search ?? "").trim().split(/\s+/).filter(Boolean);
}

// `as const` on the mode matters: these clauses are built inside a `.map`,
// where TypeScript infers the callback's return type before checking it
// against Prisma's where-input, so a bare "insensitive" widens to `string`.
export function contains(token: string) {
  return { contains: token, mode: "insensitive" as const };
}
