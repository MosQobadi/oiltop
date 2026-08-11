// The review queue's filter, as the DataTable select renders it (D.4). The
// empty value the select uses for "no filter" is the "any" row, so it isn't
// listed here — DataTableFilterSelect prepends it from the filter's label.
//
// Shared between Products and Categories so the two lists can't end up calling
// the same thing by two different names; the values are the members of
// `sourceFilterSchema` in lib/validation/common.ts.
export const SOURCE_OPTIONS = [
  { label: "Imported", value: "imported" },
  { label: "Manual", value: "manual" },
];
