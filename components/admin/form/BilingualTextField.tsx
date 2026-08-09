"use client";

import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { TextField } from "./TextField";

export interface BilingualTextFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  nameEn: FieldPath<TFieldValues>;
  nameFa: FieldPath<TFieldValues>;
  label: string;
  placeholderEn?: string;
  placeholderFa?: string;
  isRequired?: boolean;
  className?: string;
}

export function BilingualTextField<TFieldValues extends FieldValues>({
  control,
  nameEn,
  nameFa,
  label,
  placeholderEn,
  placeholderFa,
  isRequired,
  className,
}: BilingualTextFieldProps<TFieldValues>) {
  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <span className="text-sm font-medium text-neutral-700">
        {label}
        {isRequired && <span className="text-danger ms-0.5">*</span>}
      </span>
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        <TextField
          control={control}
          name={nameEn}
          label="English"
          placeholder={placeholderEn}
          isRequired={isRequired}
          className="flex-1"
        />
        <TextField
          control={control}
          name={nameFa}
          label="فارسی"
          placeholder={placeholderFa}
          isRequired={isRequired}
          dir="rtl"
          className="font-farsi flex-1"
        />
      </div>
    </div>
  );
}
