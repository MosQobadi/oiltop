// Turns a display name into a slug matching lib/validation/common.ts'
// slugSchema (lowercase letters, numbers, and single hyphens only).
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
