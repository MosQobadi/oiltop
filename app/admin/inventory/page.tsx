"use client";

import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { DataTable, StatusPill, type DataTableColumn } from "@/components/admin/DataTable";
import type { InventoryStatus } from "@/lib/validation";

interface InventoryItem {
  id: string;
  nameEn: string;
  category: { id: string; nameEn: string };
  brand: { id: string; nameEn: string };
  stock: number;
  status: InventoryStatus;
  lastUpdatedAt: string | null;
}

interface Option {
  id: string;
  nameEn: string;
}

const STATUS_OPTIONS = [
  { label: "In Stock", value: "IN_STOCK" },
  { label: "Low Stock", value: "LOW_STOCK" },
  { label: "Out of Stock", value: "OUT_OF_STOCK" },
];

const STATUS_LABELS: Record<InventoryStatus, string> = {
  IN_STOCK: "In Stock",
  LOW_STOCK: "Low Stock",
  OUT_OF_STOCK: "Out of Stock",
};

const PAGE_SIZE = 20;

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<Option[]>([]);
  const [brandOptions, setBrandOptions] = useState<Option[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function loadOptions() {
      const [categoriesRes, brandsRes] = await Promise.all([
        fetch("/api/admin/categories/options"),
        fetch("/api/admin/brands/options"),
      ]);
      const categoriesResult = await categoriesRes.json();
      const brandsResult = await brandsRes.json();
      if (categoriesResult.success) setCategoryOptions(categoriesResult.data.categories);
      if (brandsResult.success) setBrandOptions(brandsResult.data.brands);
    }

    void loadOptions();
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadInventory() {
      setIsLoading(true);
      setLoadError(null);

      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      if (category) params.set("category", category);
      if (brand) params.set("brand", brand);

      const response = await fetch(`/api/admin/inventory?${params.toString()}`);
      const result = await response.json();
      if (ignore) return;

      if (!result.success) {
        setLoadError(result.error ?? "Failed to load inventory");
        setIsLoading(false);
        return;
      }

      setItems(result.data.items);
      setTotal(result.data.total);
      setIsLoading(false);
    }

    void loadInventory();
    return () => {
      ignore = true;
    };
  }, [page, search, status, category, brand]);

  const columns: DataTableColumn<InventoryItem>[] = [
    { key: "nameEn", label: "Product" },
    {
      key: "category",
      label: "Category",
      render: (row) => row.category.nameEn,
    },
    {
      key: "brand",
      label: "Brand",
      render: (row) => row.brand.nameEn,
    },
    { key: "stock", label: "Stock" },
    {
      key: "status",
      label: "Status",
      render: (row) => <StatusPill value={STATUS_LABELS[row.status]} />,
    },
    {
      key: "lastUpdatedAt",
      label: "Last Update",
      render: (row) =>
        row.lastUpdatedAt ? new Date(row.lastUpdatedAt).toLocaleDateString() : "—",
    },
    {
      key: "id",
      label: "Actions",
      render: () => (
        // TODO(Task 9.3): open StockEditModal for this row
        <Button variant="ghost" size="sm" isDisabled>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-8">
      <h1 className="text-lg font-semibold text-neutral-900">Inventory</h1>

      {loadError && (
        <p role="alert" className="text-sm text-danger">
          {loadError}
        </p>
      )}

      <DataTable
        columns={columns}
        rows={items}
        searchPlaceholder="Search inventory..."
        onSearch={(value) => {
          setPage(1);
          setSearch(value);
        }}
        filters={[
          {
            label: "Category",
            value: category,
            options: categoryOptions.map((c) => ({ label: c.nameEn, value: c.id })),
            onChange: (value) => {
              setPage(1);
              setCategory(value);
            },
          },
          {
            label: "Brand",
            value: brand,
            options: brandOptions.map((b) => ({ label: b.nameEn, value: b.id })),
            onChange: (value) => {
              setPage(1);
              setBrand(value);
            },
          },
          {
            label: "Status",
            value: status,
            options: STATUS_OPTIONS,
            onChange: (value) => {
              setPage(1);
              setStatus(value);
            },
          },
        ]}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        emptyMessage={isLoading ? "Loading..." : "No inventory items found."}
        aria-label="Inventory"
      />
    </div>
  );
}
