// The admin's meta fields are optional, and `BilingualTextField` sends an
// untouched one to the database as "" rather than null — so "does this page have
// a meta title" is a trim check, not a null check, everywhere a `generateMetadata`
// falls back from its SEO pair to the content's own name and description.
//
// Returns `undefined` rather than "", because that's what Next omits the tag for:
// no description beats an empty one.
export function firstFilled(...values: (string | null | undefined)[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return undefined;
}
