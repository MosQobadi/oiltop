"use client";

import type { HTMLInputTypeAttribute } from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { useController } from "react-hook-form";
import { FieldError, Input, Label, TextField as TextFieldRoot } from "@heroui/react";

export interface TextFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  type?: HTMLInputTypeAttribute;
  placeholder?: string;
  isRequired?: boolean;
  dir?: "ltr" | "rtl";
  className?: string;
}

export function TextField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  type = "text",
  placeholder,
  isRequired,
  dir,
  className,
}: TextFieldProps<TFieldValues>) {
  const {
    field: { value, onChange, onBlur, name: fieldName, ref },
    fieldState: { error },
  } = useController({ control, name });

  return (
    <TextFieldRoot
      value={(value as string | number | undefined)?.toString() ?? ""}
      onChange={onChange}
      onBlur={onBlur}
      name={fieldName}
      isInvalid={!!error}
      isRequired={isRequired}
      fullWidth
      className={className}
    >
      <Label>{label}</Label>
      <Input ref={ref} type={type} placeholder={placeholder} dir={dir} fullWidth />
      <FieldError>{error?.message}</FieldError>
    </TextFieldRoot>
  );
}
