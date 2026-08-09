"use client";

import { useMemo, useState } from "react";
import { DataTable, StatusPill, type DataTableColumn } from "@/components/admin/DataTable";

interface DemoProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: "In Stock" | "Low Stock" | "Out of Stock";
  status: "Active" | "Inactive";
}

const CATEGORIES = ["Engine Oil", "Oil Filter", "Air Filter", "Cabin Filter"] as const;
const STOCKS = ["In Stock", "Low Stock", "Out of Stock"] as const;
const PAGE_SIZE = 10;

const MOCK_PRODUCTS: DemoProduct[] = Array.from({ length: 23 }, (_, i) => ({
  id: `prod-${i + 1}`,
  name: `${CATEGORIES[i % CATEGORIES.length]} ${String.fromCharCode(65 + (i % 5))}`,
  category: CATEGORIES[i % CATEGORIES.length],
  price: 12 + i * 3.5,
  stock: STOCKS[i % STOCKS.length],
  status: i % 5 === 0 ? "Inactive" : "Active",
}));

const columns: DataTableColumn<DemoProduct>[] = [
  { key: "name", label: "Name" },
  { key: "category", label: "Category" },
  {
    key: "price",
    label: "Price",
    render: (row) => `$${row.price.toFixed(2)}`,
  },
  {
    key: "stock",
    label: "Stock",
    render: (row) => <StatusPill value={row.stock} />,
  },
  {
    key: "status",
    label: "Status",
    render: (row) => <StatusPill value={row.status} />,
  },
];

export function DataTableDemo() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () =>
      MOCK_PRODUCTS.filter((product) => {
        const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase());
        const matchesCategory = category === "" || product.category === category;
        return matchesSearch && matchesCategory;
      }),
    [search, category],
  );

  const total = filtered.length;
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <DataTable
      columns={columns}
      rows={rows}
      searchPlaceholder="Search products..."
      onSearch={(query) => {
        setSearch(query);
        setPage(1);
      }}
      filters={[
        {
          label: "Category",
          value: category,
          options: CATEGORIES.map((c) => ({ label: c, value: c })),
          onChange: (value) => {
            setCategory(value);
            setPage(1);
          },
        },
      ]}
      page={page}
      pageSize={PAGE_SIZE}
      total={total}
      onPageChange={setPage}
      aria-label="Demo products"
    />
  );
}
