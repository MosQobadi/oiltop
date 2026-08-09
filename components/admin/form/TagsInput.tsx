"use client";

import { useState, type KeyboardEvent } from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { useController } from "react-hook-form";
import { Chip, Label } from "@heroui/react";
import { CloseIcon } from "../icons";

export interface TagsInputProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  placeholder?: string;
  className?: string;
}

export function TagsInput<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  placeholder = "Type and press Enter",
  className,
}: TagsInputProps<TFieldValues>) {
  const {
    field: { value, onChange, onBlur },
    fieldState: { error },
  } = useController({ control, name });

  const tags = (value as string[] | undefined) ?? [];
  const [draft, setDraft] = useState("");

  const addTag = (raw: string) => {
    const tag = raw.trim();
    if (!tag || tags.includes(tag)) return;
    onChange([...tags, tag]);
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(draft);
      setDraft("");
    } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  const handleBlur = () => {
    if (draft.trim()) {
      addTag(draft);
      setDraft("");
    }
    onBlur();
  };

  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      <div className="input flex min-h-9 flex-wrap items-center gap-1.5" data-invalid={!!error}>
        {tags.map((tag) => (
          <Chip key={tag} size="sm" variant="soft">
            <Chip.Label>{tag}</Chip.Label>
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              onClick={() => removeTag(tag)}
              className="ms-1 inline-flex items-center rounded-full hover:opacity-70"
            >
              <CloseIcon className="size-3" />
            </button>
          </Chip>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="min-w-[8ch] flex-1 border-none bg-transparent text-sm outline-none"
        />
      </div>
      {error?.message && (
        <p role="alert" className="text-danger text-sm">
          {error.message}
        </p>
      )}
    </div>
  );
}
