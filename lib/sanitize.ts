import sanitizeHtml from "sanitize-html";

// Every bilingual description/meta field is edited as plain text (see
// BilingualTextareaField) — no rich-text editor exists in this admin panel —
// so any markup submitted is either a mistake or a stored-XSS attempt.
// Strip it down to plain text rather than allowing an HTML allowlist.
export function stripHtml(value: string): string {
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).trim();
}
