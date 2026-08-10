// The storefront's label + control + error grouping, shared by every form on
// the customer side (fitment request, register, login). Extracted from
// RequestItForm once the account screens needed the same three-part row —
// the styling of an input is a decision that belongs in one place, not copied
// per form.

export const CONTROL_CLASS =
  "focus-visible:border-accent focus-visible:ring-accent min-h-11 w-full rounded-[10px] border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus-visible:ring-1 focus-visible:outline-none";

export interface FieldProps {
  id: string;
  label: string;
  /** `false` as well as `undefined` so callers can pass `errors.x && "…"`. */
  error: string | false | undefined;
  children: (props: {
    id: string;
    "aria-invalid": true | undefined;
    "aria-describedby": string | undefined;
    className: string;
  }) => React.ReactNode;
}

// The control is a render prop rather than a `type` switch so an input, a
// textarea and a select can each keep their own attributes without this
// growing a props passthrough for every one of them.
export function Field({ id, label, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12.5px] text-neutral-600">
        {label}
      </label>
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": error ? `${id}-error` : undefined,
        className: CONTROL_CLASS,
      })}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[12.5px] text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
