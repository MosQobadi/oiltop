"use client";

import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { useController } from "react-hook-form";
import { FieldError, Label, ListBox, Select } from "@heroui/react";

export interface SelectFieldOption {
  label: string;
  value: string;
}

export interface SelectFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  options: SelectFieldOption[];
  placeholder?: string;
  isRequired?: boolean;
  className?: string;
}

export function SelectField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  options,
  placeholder = "Select...",
  isRequired,
  className,
}: SelectFieldProps<TFieldValues>) {
  const {
    field: { value, onChange, onBlur, name: fieldName, ref },
    fieldState: { error },
  } = useController({ control, name });

  return (
    <Select
      ref={ref}
      selectedKey={(value as string | undefined) ?? null}
      onSelectionChange={(key) => onChange(key == null ? "" : String(key))}
      onBlur={onBlur}
      name={fieldName}
      placeholder={placeholder}
      isInvalid={!!error}
      isRequired={isRequired}
      fullWidth
      className={className}
    >
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox items={options}>
          {(option) => (
            <ListBox.Item id={option.value} textValue={option.label}>
              {option.label}
            </ListBox.Item>
          )}
        </ListBox>
      </Select.Popover>
      <FieldError>{error?.message}</FieldError>
    </Select>
  );
}
