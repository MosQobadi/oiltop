"use client";

import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { useController } from "react-hook-form";
import { FieldError, Label, TextArea, TextField as TextFieldRoot } from "@heroui/react";

export interface TextareaFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  placeholder?: string;
  rows?: number;
  isRequired?: boolean;
  dir?: "ltr" | "rtl";
  className?: string;
}

export function TextareaField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  rows = 4,
  isRequired,
  dir,
  className,
}: TextareaFieldProps<TFieldValues>) {
  const {
    field: { value, onChange, onBlur, name: fieldName, ref },
    fieldState: { error },
  } = useController({ control, name });

  return (
    <TextFieldRoot
      value={(value as string | undefined) ?? ""}
      onChange={onChange}
      onBlur={onBlur}
      name={fieldName}
      isInvalid={!!error}
      isRequired={isRequired}
      fullWidth
      className={className}
    >
      <Label>{label}</Label>
      <TextArea ref={ref} placeholder={placeholder} rows={rows} dir={dir} fullWidth />
      <FieldError>{error?.message}</FieldError>
    </TextFieldRoot>
  );
}
