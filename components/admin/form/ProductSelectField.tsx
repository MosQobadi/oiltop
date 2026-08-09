"use client";

import { useEffect, useRef, useState } from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { useController } from "react-hook-form";
import { ComboBox, FieldError, Input, Label, ListBox } from "@heroui/react";

export interface ProductOption {
  id: string;
  label: string;
}

export interface ProductSelectFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  placeholder?: string;
  // The currently-linked product (edit mode), so its name renders immediately
  // without waiting on a search — see initialOption usage below.
  initialOption?: ProductOption | null;
  className?: string;
}

const SEARCH_DEBOUNCE_MS = 300;

export function ProductSelectField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  placeholder = "Search products by name or SKU...",
  initialOption,
  className,
}: ProductSelectFieldProps<TFieldValues>) {
  const {
    field: { value, onChange },
    fieldState: { error },
  } = useController({ control, name });

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductOption[]>([]);
  // Tracked separately from `results` so the selected item's label stays
  // resolvable in `items` even after a later search replaces `results`.
  const [selectedOption, setSelectedOption] = useState<ProductOption | null>(initialOption ?? null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let ignore = false;

    async function search() {
      const params = new URLSearchParams({ status: "ACTIVE", pageSize: "20" });
      if (query) params.set("search", query);

      const response = await fetch(`/api/admin/products?${params.toString()}`);
      const result = await response.json();
      if (ignore || !result.success) return;

      setResults(
        result.data.products.map((product: { id: string; nameEn: string; sku: string }) => ({
          id: product.id,
          label: `${product.nameEn} (${product.sku})`,
        })),
      );
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void search(), SEARCH_DEBOUNCE_MS);

    return () => {
      ignore = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const items = selectedOption
    ? [selectedOption, ...results.filter((r) => r.id !== selectedOption.id)]
    : results;

  return (
    <ComboBox
      items={items}
      selectedKey={(value as string | null | undefined) ?? null}
      onSelectionChange={(key) => {
        if (key == null) {
          onChange(null);
          setSelectedOption(null);
          return;
        }
        const picked = items.find((item) => item.id === String(key)) ?? null;
        onChange(String(key));
        setSelectedOption(picked);
      }}
      onInputChange={setQuery}
      defaultInputValue={initialOption?.label ?? ""}
      allowsEmptyCollection
      isInvalid={!!error}
      fullWidth
      className={className}
    >
      <Label>{label}</Label>
      <ComboBox.InputGroup>
        <Input placeholder={placeholder} fullWidth />
        <ComboBox.Trigger />
      </ComboBox.InputGroup>
      <ComboBox.Popover>
        <ListBox
          items={items}
          renderEmptyState={() => (
            <div className="px-3 py-2 text-sm text-neutral-500">No products found.</div>
          )}
        >
          {(item) => (
            <ListBox.Item id={item.id} textValue={item.label}>
              {item.label}
            </ListBox.Item>
          )}
        </ListBox>
      </ComboBox.Popover>
      <FieldError>{error?.message}</FieldError>
    </ComboBox>
  );
}
