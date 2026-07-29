"use client";

import { DataTable, StatusPill, type DataTableColumn } from "@/components/admin/DataTable";

interface RecentOrderRow {
  id: string;
  orderNumber: string;
  customer: string;
  total: string;
  status: string;
  date: string;
}

const columns: DataTableColumn<RecentOrderRow>[] = [
  { key: "orderNumber", label: "Order #" },
  { key: "customer", label: "Customer" },
  { key: "total", label: "Total" },
  {
    key: "status",
    label: "Status",
    render: (row) => <StatusPill value={row.status} />,
  },
  { key: "date", label: "Date" },
];

export function RecentOrdersTable() {
  return (
    <DataTable
      columns={columns}
      rows={[]}
      page={1}
      pageSize={10}
      total={0}
      onPageChange={() => {}}
      emptyMessage="No orders yet."
      aria-label="Recent orders"
    />
  );
}
