"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@heroui/react";
import { DataTable, StatusPill, type DataTableColumn } from "@/components/admin/DataTable";

type CustomerStatus = "ACTIVE" | "INACTIVE";
type OrderStatus = "PENDING" | "SENDING" | "SENT" | "DELIVERED" | "CANCELLED";
type PaymentStatus = "UNPAID" | "PAID" | "REFUNDED";

interface OrderSummary {
  id: string;
  orderNumber: string;
  itemCount: number;
  total: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  date: string;
}

interface CustomerDetail {
  id: string;
  firstName: string;
  lastName: string;
  // Null for a storefront customer who registered with a phone number only
  // (Design Decision 7).
  email: string | null;
  phone: string | null;
  status: CustomerStatus;
  createdAt: string;
  orders: Omit<OrderSummary, "orderNumber">[];
}

const STATUS_LABELS: Record<CustomerStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Pending",
  SENDING: "Sending",
  SENT: "Sent",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  UNPAID: "Unpaid",
  PAID: "Paid",
  REFUNDED: "Refunded",
};

const ORDERS_PAGE_SIZE = 10;

export default function CustomerDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const customerId = params.id;

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ordersPage, setOrdersPage] = useState(1);

  useEffect(() => {
    let ignore = false;

    async function loadCustomer() {
      setIsLoading(true);
      setLoadError(null);

      const response = await fetch(`/api/admin/customers/${customerId}`);
      const result = await response.json();
      if (ignore) return;

      if (!result.success) {
        setLoadError(result.error ?? "Failed to load customer");
        setIsLoading(false);
        return;
      }

      setCustomer(result.data.customer);
      setIsLoading(false);
    }

    void loadCustomer();
    return () => {
      ignore = true;
    };
  }, [customerId]);

  if (isLoading) {
    return (
      <div className="p-8">
        <p className="text-sm text-neutral-500">Loading...</p>
      </div>
    );
  }

  if (loadError || !customer) {
    return (
      <div className="p-8">
        <p role="alert" className="text-danger text-sm">
          {loadError ?? "Customer not found"}
        </p>
      </div>
    );
  }

  const orders: OrderSummary[] = customer.orders.map((order) => ({
    ...order,
    orderNumber: `#${order.id.slice(-8).toUpperCase()}`,
  }));
  const ordersPageRows = orders.slice(
    (ordersPage - 1) * ORDERS_PAGE_SIZE,
    ordersPage * ORDERS_PAGE_SIZE,
  );

  const orderColumns: DataTableColumn<OrderSummary>[] = [
    {
      key: "orderNumber",
      label: "Order ID",
      render: (row) => <span title={row.id}>{row.orderNumber}</span>,
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
      render: (row) => <StatusPill value={ORDER_STATUS_LABELS[row.status]} />,
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
    <div className="flex flex-col gap-8 p-8">
      <nav className="flex items-center gap-2 text-sm text-neutral-500">
        <Link href="/admin/customers" className="hover:text-neutral-700">
          Customers
        </Link>
        <span>/</span>
        <span className="text-neutral-700">
          {customer.firstName} {customer.lastName}
        </span>
      </nav>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex items-center gap-3">
            <span className="text-base font-medium text-neutral-900">
              {customer.firstName} {customer.lastName}
            </span>
            <StatusPill value={STATUS_LABELS[customer.status]} />
          </div>
          {customer.email && <span className="text-neutral-500">{customer.email}</span>}
          {customer.phone && <span className="text-neutral-500">{customer.phone}</span>}
          <span className="text-neutral-500">
            Customer since {new Date(customer.createdAt).toLocaleDateString()}
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Order History</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={orderColumns}
            rows={ordersPageRows}
            page={ordersPage}
            pageSize={ORDERS_PAGE_SIZE}
            total={orders.length}
            onPageChange={setOrdersPage}
            emptyMessage="No orders yet."
            aria-label="Order history"
          />
        </CardContent>
      </Card>
    </div>
  );
}
