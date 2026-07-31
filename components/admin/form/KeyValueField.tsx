"use client";

import { useState } from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { useController } from "react-hook-form";
import { Button, Input, Label, TextField as TextFieldRoot } from "@heroui/react";
import { CloseIcon } from "../icons";

export interface KeyValueFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  className?: string;
}

interface Pair {
  key: string;
  value: string;
}

function recordToPairs(record: Record<string, unknown> | null | undefined): Pair[] {
  if (!record) return [];
  return Object.entries(record).map(([key, value]) => ({ key, value: String(value) }));
}

function pairsToRecord(pairs: Pair[]): Record<string, string> | null {
  const entries = pairs
    .filter((pair) => pair.key.trim())
    .map((pair) => [pair.key.trim(), pair.value] as const);
  return entries.length ? Object.fromEntries(entries) : null;
}

export function KeyValueField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  className,
}: KeyValueFieldProps<TFieldValues>) {
  const {
    field: { value, onChange },
    fieldState: { error },
  } = useController({ control, name });

  // Local row state so an in-progress row (e.g. a key typed before its value)
  // isn't stripped every render by pairsToRecord's "drop empty keys" filter —
  // only the emitted field value goes through that filter, not the editor.
  const [pairs, setPairs] = useState<Pair[]>(() =>
    recordToPairs(value as Record<string, unknown> | null | undefined),
  );

  const commit = (next: Pair[]) => {
    setPairs(next);
    onChange(pairsToRecord(next));
  };

  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <Label>{label}</Label>
      <div className="flex flex-col gap-2">
        {pairs.map((pair, index) => (
          <div key={index} className="flex items-center gap-2">
            <TextFieldRoot
              value={pair.key}
              onChange={(key) => commit(pairs.map((p, i) => (i === index ? { ...p, key } : p)))}
              fullWidth
              className="flex-1"
            >
              <Input placeholder="Key" fullWidth />
            </TextFieldRoot>
            <TextFieldRoot
              value={pair.value}
              onChange={(val) =>
                commit(pairs.map((p, i) => (i === index ? { ...p, value: val } : p)))
              }
              fullWidth
              className="flex-1"
            >
              <Input placeholder="Value" fullWidth />
            </TextFieldRoot>
            <button
              type="button"
              aria-label="Remove attribute"
              onClick={() => commit(pairs.filter((_, i) => i !== index))}
              className="inline-flex items-center rounded-full p-1.5 hover:opacity-70"
            >
              <CloseIcon className="size-4" />
            </button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onPress={() => commit([...pairs, { key: "", value: "" }])}
        className="self-start"
      >
        + Add Attribute
      </Button>
      {error?.message && (
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      )}
    </div>
  );
}
