"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Checkbox, Chip, ListBox, Pagination, SearchField, Select, Table } from "@heroui/react";

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
  // Selection is opt-in: passing `onSelectionChange` is what adds the checkbox
  // column, so every list that doesn't have a bulk action is unchanged. The
  // selected ids are owned by the caller, because it is the caller that has to
  // clear them after acting on the rows.
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  // What a row's checkbox is called. Without it the label falls back to the id,
  // which is a cuid and tells a screen reader nothing about what it is selecting.
  getRowLabel?: (row: T) => string;
  // Rendered above the table while anything is selected — the bulk action
  // itself. The table owns which rows are selected; the caller owns what
  // "activate" means.
  bulkActions?: ReactNode;
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

// The selection column isn't a `DataTableColumn` — its key isn't a field of T
// and its header is a checkbox rather than a label — so the two are widened to
// this shape once, at the point they're concatenated.
type RenderedColumn<T> = {
  key: string;
  label: ReactNode;
  render: (row: T) => ReactNode;
};

// Prefixed so it can't collide with a field name — `key` on a real column is
// `keyof T`, and this one isn't a field of anything.
const SELECT_COLUMN_KEY = "__select";

function SelectCheckbox({
  isSelected,
  isIndeterminate,
  onChange,
  label,
}: {
  isSelected: boolean;
  isIndeterminate?: boolean;
  onChange: (isSelected: boolean) => void;
  label: string;
}) {
  return (
    // `slot={null}` is not decoration: react-aria's Table puts a "selection"
    // slot context around every cell, and a Checkbox rendered inside one
    // without a slot throws "A slot prop is required". Selection here is the
    // caller's `selectedIds`, not the Table's own selection state, so the
    // checkbox opts out of the context rather than joining it.
    <Checkbox
      slot={null}
      aria-label={label}
      isSelected={isSelected}
      isIndeterminate={isIndeterminate}
      onChange={onChange}
    >
      <Checkbox.Content>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
      </Checkbox.Content>
    </Checkbox>
  );
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
  selectedIds,
  onSelectionChange,
  getRowLabel,
  bulkActions,
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

  const selection = new Set(selectedIds ?? []);
  // What the table's collection caches are keyed on. A string rather than the
  // array itself: react-aria folds `dependencies` into a `useMemo` dep list, so
  // an array whose length tracks the selection changes the list's *size* between
  // renders, which React warns about. One value that changes when the selection
  // does is all the cache needs.
  const selectionKey = (selectedIds ?? []).join(",");
  // Select-all is scoped to the rows on screen, because those are the only ones
  // the table has: "all 812 imported products" would be a promise the client
  // can't keep from one page of results.
  const selectedOnPage = rows.filter((row) => selection.has(row.id)).length;
  const allOnPageSelected = rows.length > 0 && selectedOnPage === rows.length;

  const toggleRow = (id: string, isSelected: boolean) => {
    if (!onSelectionChange) return;
    const next = new Set(selection);
    if (isSelected) next.add(id);
    else next.delete(id);
    onSelectionChange([...next]);
  };

  const toggleAllOnPage = (isSelected: boolean) => {
    if (!onSelectionChange) return;
    const next = new Set(selection);
    for (const row of rows) {
      if (isSelected) next.add(row.id);
      else next.delete(row.id);
    }
    onSelectionChange([...next]);
  };

  const renderedColumns: RenderedColumn<T>[] = [
    ...(onSelectionChange
      ? [
          {
            key: SELECT_COLUMN_KEY,
            label: (
              <SelectCheckbox
                label={`Select all ${ariaLabel.toLowerCase()} on this page`}
                isSelected={allOnPageSelected}
                isIndeterminate={selectedOnPage > 0 && !allOnPageSelected}
                onChange={toggleAllOnPage}
              />
            ),
            render: (row: T) => (
              <SelectCheckbox
                label={`Select ${getRowLabel?.(row) ?? row.id}`}
                isSelected={selection.has(row.id)}
                onChange={(isSelected) => toggleRow(row.id, isSelected)}
              />
            ),
          },
        ]
      : []),
    ...columns.map((column) => ({
      key: column.key,
      label: column.label as ReactNode,
      render: column.render ?? ((row: T) => String(row[column.key] ?? "")),
    })),
  ];

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

      {bulkActions && selection.size > 0 && (
        <div className="rounded-field bg-field flex flex-wrap items-center gap-3 px-4 py-3">
          <p className="text-sm text-neutral-700">{selection.size} selected</p>
          {bulkActions}
        </div>
      )}

      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label={ariaLabel}>
            <Table.Header columns={renderedColumns} dependencies={[selectionKey]}>
              {(column) => (
                // Still the first *data* column, not the checkbox: the row
                // header is what a screen reader announces to identify the row,
                // and "select row" identifies nothing.
                <Table.Column id={column.key} isRowHeader={column.key === columns[0]?.key}>
                  {column.label}
                </Table.Column>
              )}
            </Table.Header>
            <Table.Body
              items={rows}
              dependencies={[selectionKey]}
              renderEmptyState={() => (
                <div className="py-10 text-center text-sm text-neutral-500">{emptyMessage}</div>
              )}
            >
              {(row) => (
                // `dependencies` is load-bearing, not a hint: react-aria caches
                // a row's rendered cells against `items`, and `rows` doesn't
                // change when a checkbox is ticked — so without it the cells
                // render once and never again, leaving every box visually
                // unchecked while the count above the table climbs. The body's
                // own cache needs the same key, or the row never re-renders to
                // read this one.
                <Table.Row id={row.id} columns={renderedColumns} dependencies={[selectionKey]}>
                  {(column) => <Table.Cell>{column.render(row)}</Table.Cell>}
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
