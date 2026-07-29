"use client";

import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { useController } from "react-hook-form";
import { FieldError, Switch } from "@heroui/react";

export interface ToggleFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  className?: string;
}

export function ToggleField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  className,
}: ToggleFieldProps<TFieldValues>) {
  const {
    field: { value, onChange, name: fieldName },
    fieldState: { error },
  } = useController({ control, name });

  return (
    <Switch
      isSelected={!!value}
      onChange={onChange}
      name={fieldName}
      isInvalid={!!error}
      className={className}
    >
      <Switch.Content>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        {label}
      </Switch.Content>
      <FieldError>{error?.message}</FieldError>
    </Switch>
  );
}
