"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Chip, ListBox, Pagination, SearchField, Select, Table } from "@heroui/react";

type ChipColor = "default" | "accent" | "danger" | "success" | "warning";

export interface DataTableColumn<T> {
  key: keyof T & string;
  label: string;
  render?: (row: T) => ReactNode;
}

export interface DataTableFilter {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
}

export interface DataTableProps<T extends { id: string }> {
  columns: DataTableColumn<T>[];
  rows: T[];
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
  searchDebounceMs?: number;
  filters?: DataTableFilter[];
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  emptyMessage?: string;
  "aria-label": string;
}

const STATUS_PILL_COLOR: Record<string, ChipColor> = {
  active: "success",
  "in stock": "success",
  delivered: "success",
  paid: "success",
  resolved: "success",
  inactive: "danger",
  "out of stock": "danger",
  cancelled: "danger",
  pending: "warning",
  "low stock": "warning",
  new: "warning",
  sending: "accent",
  sent: "accent",
  contacted: "accent",
};

export function StatusPill({ value }: { value: string }) {
  const color = STATUS_PILL_COLOR[value.trim().toLowerCase()] ?? "default";
  return (
    <Chip color={color} size="sm" variant="soft">
      <Chip.Label>{value}</Chip.Label>
    </Chip>
  );
}

function getPageNumbers(page: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | "ellipsis")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);

  if (start > 2) pages.push("ellipsis");
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < totalPages - 1) pages.push("ellipsis");

  pages.push(totalPages);
  return pages;
}

function DataTableFilterSelect({ filter }: { filter: DataTableFilter }) {
  const items = [{ label: filter.label, value: "" }, ...filter.options];

  return (
    <Select
      aria-label={filter.label}
      placeholder={filter.label}
      selectedKey={filter.value}
      onSelectionChange={(key) => filter.onChange(String(key ?? ""))}
    >
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox items={items}>
          {(item) => (
            <ListBox.Item id={item.value} textValue={item.label}>
              {item.label}
            </ListBox.Item>
          )}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  searchPlaceholder = "Search...",
  onSearch,
  searchDebounceMs = 300,
  filters,
  page,
  pageSize,
  total,
  onPageChange,
  emptyMessage = "No results found.",
  "aria-label": ariaLabel,
}: DataTableProps<T>) {
  const [searchValue, setSearchValue] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    if (!onSearch) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSearch(value), searchDebounceMs);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-4">
      {(onSearch || filters?.length) && (
        <div className="flex flex-wrap items-center gap-3">
          {onSearch && (
            <SearchField
              value={searchValue}
              onChange={handleSearchChange}
              className="w-full max-w-xs"
            >
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder={searchPlaceholder} />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
          )}
          {filters?.map((filter) => (
            <DataTableFilterSelect key={filter.label} filter={filter} />
          ))}
        </div>
      )}

      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label={ariaLabel}>
            <Table.Header columns={columns}>
              {(column) => (
                <Table.Column id={column.key} isRowHeader={column.key === columns[0]?.key}>
                  {column.label}
                </Table.Column>
              )}
            </Table.Header>
            <Table.Body
              items={rows}
              renderEmptyState={() => (
                <div className="py-10 text-center text-sm text-neutral-500">{emptyMessage}</div>
              )}
            >
              {(row) => (
                <Table.Row id={row.id} columns={columns}>
                  {(column) => (
                    <Table.Cell>
                      {column.render ? column.render(row) : String(row[column.key] ?? "")}
                    </Table.Cell>
                  )}
                </Table.Row>
              )}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>

      {total > 0 && (
        <Pagination aria-label="Pagination">
          <Pagination.Summary>
            {rangeStart}–{rangeEnd} of {total}
          </Pagination.Summary>
          <Pagination.Content>
            <Pagination.Item>
              <Pagination.Previous isDisabled={page <= 1} onPress={() => onPageChange(page - 1)}>
                <Pagination.PreviousIcon />
                Previous
              </Pagination.Previous>
            </Pagination.Item>
            {getPageNumbers(page, totalPages).map((p, i) =>
              p === "ellipsis" ? (
                <Pagination.Item key={`ellipsis-${i}`}>
                  <Pagination.Ellipsis />
                </Pagination.Item>
              ) : (
                <Pagination.Item key={p}>
                  <Pagination.Link isActive={p === page} onPress={() => onPageChange(p)}>
                    {p}
                  </Pagination.Link>
                </Pagination.Item>
              ),
            )}
            <Pagination.Item>
              <Pagination.Next
                isDisabled={page >= totalPages}
                onPress={() => onPageChange(page + 1)}
              >
                Next
                <Pagination.NextIcon />
              </Pagination.Next>
            </Pagination.Item>
          </Pagination.Content>
        </Pagination>
      )}
    </div>
  );
}
