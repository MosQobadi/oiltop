// One login field, two credentials. A storefront customer registers with a
// phone number and only optionally gains an email later (Task 9.2's profile
// page), while an admin only ever has an email — so the login route can't know
// which column to look in until it has looked at the value the customer typed.

export type LoginIdentifierKind = "email" | "phone";

// The "@" is the whole test. No phone number contains one, and anything else
// is treated as a phone: choosing *which column to query* is all this has to
// get right. An identifier that is neither a real email nor a real phone finds
// no row, which is the same answer as a wrong password and so tells an
// attacker nothing either way.
export function loginIdentifierKind(identifier: string): LoginIdentifierKind {
  return identifier.includes("@") ? "email" : "phone";
}

// Phone numbers are stored the way this leaves them, so the digits a customer
// registered with still match however they space them at login: "0912 445
// 8890", "0912-445-8890" and "09124458890" are one account rather than three,
// which is also what makes the unique constraint on `User.phone` mean anything.
//
// Country-code folding is deliberately absent — "+989124458890" and
// "09124458890" stay distinct accounts. Collapsing those needs a real
// libphonenumber-style parse rather than a regex, and it isn't needed for a
// launch whose register form asks for a local 09xx number.
export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}
