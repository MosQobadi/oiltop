"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, TextField } from "@heroui/react";
import { DataTable, StatusPill, type DataTableColumn } from "@/components/admin/DataTable";

interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  // A guest checkout leaves no account behind, so customerName is the name the
  // checkout form collected rather than a Customers-list row.
  isGuest: boolean;
  itemCount: number;
  total: number;
  status: "PENDING" | "SENDING" | "SENT" | "DELIVERED" | "CANCELLED";
  paymentStatus: "UNPAID" | "PAID" | "REFUNDED";
  date: string;
}

const STATUS_OPTIONS = [
  { label: "Pending", value: "PENDING" },
  { label: "Sending", value: "SENDING" },
  { label: "Sent", value: "SENT" },
  { label: "Delivered", value: "DELIVERED" },
  { label: "Cancelled", value: "CANCELLED" },
];

const PAYMENT_OPTIONS = [
  { label: "Unpaid", value: "UNPAID" },
  { label: "Paid", value: "PAID" },
  { label: "Refunded", value: "REFUNDED" },
];

const STATUS_LABELS: Record<Order["status"], string> = {
  PENDING: "Pending",
  SENDING: "Sending",
  SENT: "Sent",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

const PAYMENT_LABELS: Record<Order["paymentStatus"], string> = {
  UNPAID: "Unpaid",
  PAID: "Paid",
  REFUNDED: "Refunded",
};

const PAGE_SIZE = 20;

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [payment, setPayment] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadOrders() {
      setIsLoading(true);
      setLoadError(null);

      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      if (payment) params.set("payment", payment);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const response = await fetch(`/api/admin/orders?${params.toString()}`);
      const result = await response.json();
      if (ignore) return;

      if (!result.success) {
        setLoadError(result.error ?? "Failed to load orders");
        setIsLoading(false);
        return;
      }

      setOrders(
        result.data.items.map((order: Omit<Order, "orderNumber">) => ({
          ...order,
          orderNumber: `#${order.id.slice(-8).toUpperCase()}`,
        })),
      );
      setTotal(result.data.total);
      setIsLoading(false);
    }

    void loadOrders();
    return () => {
      ignore = true;
    };
  }, [page, search, status, payment, dateFrom, dateTo]);

  const columns: DataTableColumn<Order>[] = [
    {
      key: "orderNumber",
      label: "Order ID",
      render: (row) => <span title={row.id}>{row.orderNumber}</span>,
    },
    {
      key: "customerName",
      label: "Customer",
      render: (row) => (
        <span className="flex items-center gap-2">
          {row.customerName}
          {row.isGuest && (
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-500">
              Guest
            </span>
          )}
        </span>
      ),
    },
    { key: "itemCount", label: "Items" },
    {
      key: "total",
      label: "Total",
      render: (row) => row.total.toLocaleString(),
    },
    {
      key: "status",
      label: "Status",
      render: (row) => <StatusPill value={STATUS_LABELS[row.status]} />,
    },
    {
      key: "paymentStatus",
      label: "Payment",
      render: (row) => <StatusPill value={PAYMENT_LABELS[row.paymentStatus]} />,
    },
    {
      key: "date",
      label: "Date",
      render: (row) => new Date(row.date).toLocaleDateString(),
    },
    {
      key: "id",
      label: "Actions",
      render: (row) => (
        <Button variant="ghost" size="sm" onPress={() => router.push(`/admin/orders/${row.id}`)}>
          View
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-8">
      <h1 className="text-lg font-semibold text-neutral-900">Orders</h1>

      {loadError && (
        <p role="alert" className="text-danger text-sm">
          {loadError}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <TextField
          value={dateFrom}
          onChange={(value) => {
            setPage(1);
            setDateFrom(value);
          }}
        >
          <Label>Date from</Label>
          <Input type="date" max={dateTo || undefined} />
        </TextField>
        <TextField
          value={dateTo}
          onChange={(value) => {
            setPage(1);
            setDateTo(value);
          }}
        >
          <Label>Date to</Label>
          <Input type="date" min={dateFrom || undefined} />
        </TextField>
      </div>

      <DataTable
        columns={columns}
        rows={orders}
        searchPlaceholder="Search by customer..."
        onSearch={(value) => {
          setPage(1);
          setSearch(value);
        }}
        filters={[
          {
            label: "Status",
            value: status,
            options: STATUS_OPTIONS,
            onChange: (value) => {
              setPage(1);
              setStatus(value);
            },
          },
          {
            label: "Payment",
            value: payment,
            options: PAYMENT_OPTIONS,
            onChange: (value) => {
              setPage(1);
              setPayment(value);
            },
          },
        ]}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        emptyMessage={isLoading ? "Loading..." : "No orders found."}
        aria-label="Orders"
      />
    </div>
  );
}
