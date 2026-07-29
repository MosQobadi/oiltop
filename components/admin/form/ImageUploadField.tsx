"use client";

import { useEffect, useMemo, useRef, type ChangeEvent } from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { useController } from "react-hook-form";
import { Button, Label } from "@heroui/react";
import { CloseIcon } from "../icons";

export interface ImageUploadFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  className?: string;
}

export function ImageUploadField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  className,
}: ImageUploadFieldProps<TFieldValues>) {
  const {
    field: { value, onChange },
    fieldState: { error },
  } = useController({ control, name });

  const fileValue = value as File | string | null | undefined;
  const inputRef = useRef<HTMLInputElement>(null);

  const previewUrl = useMemo(() => {
    if (fileValue instanceof File) return URL.createObjectURL(fileValue);
    return typeof fileValue === "string" ? fileValue : null;
  }, [fileValue]);

  useEffect(() => {
    return () => {
      if (fileValue instanceof File && previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [fileValue, previewUrl]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    onChange(file);
    e.target.value = "";
  };

  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      <div className="flex items-center gap-4">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-field border border-dashed bg-field [border-width:var(--border-width-field)]">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- ephemeral client-side object-URL preview, not an optimized asset
            <img
              src={previewUrl}
              alt={`${label} preview`}
              className="size-full object-cover"
            />
          ) : (
            <span className="text-xs text-neutral-400">No image</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onPress={() => inputRef.current?.click()}
          >
            {previewUrl ? "Change Image" : "Upload Image"}
          </Button>
          {previewUrl && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="inline-flex items-center gap-1 text-sm text-danger hover:opacity-80"
            >
              <CloseIcon className="size-3" />
              Remove
            </button>
          )}
        </div>
      </div>
      {error?.message && (
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      )}
    </div>
  );
}
