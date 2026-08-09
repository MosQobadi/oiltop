"use client";

import { useEffect, useState } from "react";
import { DataTable, StatusPill, type DataTableColumn } from "@/components/admin/DataTable";

interface RecentOrderRow {
  id: string;
  orderNumber: string;
  customer: string;
  total: string;
  status: string;
  date: string;
}

interface OrderListItem {
  id: string;
  customerName: string;
  total: number;
  status: "PENDING" | "SENDING" | "SENT" | "DELIVERED" | "CANCELLED";
  date: string;
}

const STATUS_LABELS: Record<OrderListItem["status"], string> = {
  PENDING: "Pending",
  SENDING: "Sending",
  SENT: "Sent",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

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
  const [orders, setOrders] = useState<RecentOrderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function loadRecentOrders() {
      const response = await fetch("/api/admin/orders?page=1&pageSize=10");
      const result = await response.json();
      if (ignore) return;

      if (result.success) {
        setOrders(
          (result.data.items as OrderListItem[]).map((order) => ({
            id: order.id,
            orderNumber: `#${order.id.slice(-8).toUpperCase()}`,
            customer: order.customerName,
            total: order.total.toLocaleString(),
            status: STATUS_LABELS[order.status],
            date: new Date(order.date).toLocaleDateString(),
          })),
        );
      }
      setIsLoading(false);
    }

    void loadRecentOrders();
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <DataTable
      columns={columns}
      rows={orders}
      page={1}
      pageSize={10}
      total={orders.length}
      onPageChange={() => {}}
      emptyMessage={isLoading ? "Loading..." : "No orders yet."}
      aria-label="Recent orders"
    />
  );
}
