"use client";

import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { TextareaField } from "./TextareaField";

export interface BilingualTextareaFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  nameEn: FieldPath<TFieldValues>;
  nameFa: FieldPath<TFieldValues>;
  label: string;
  placeholderEn?: string;
  placeholderFa?: string;
  rows?: number;
  isRequired?: boolean;
  className?: string;
}

export function BilingualTextareaField<TFieldValues extends FieldValues>({
  control,
  nameEn,
  nameFa,
  label,
  placeholderEn,
  placeholderFa,
  rows,
  isRequired,
  className,
}: BilingualTextareaFieldProps<TFieldValues>) {
  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <span className="text-sm font-medium text-neutral-700">
        {label}
        {isRequired && <span className="text-danger ms-0.5">*</span>}
      </span>
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        <TextareaField
          control={control}
          name={nameEn}
          label="English"
          placeholder={placeholderEn}
          rows={rows}
          isRequired={isRequired}
          className="flex-1"
        />
        <TextareaField
          control={control}
          name={nameFa}
          label="فارسی"
          placeholder={placeholderFa}
          rows={rows}
          isRequired={isRequired}
          dir="rtl"
          className="font-farsi flex-1"
        />
      </div>
    </div>
  );
}
