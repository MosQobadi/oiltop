"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Card, CardContent, CardHeader, CardTitle, Table } from "@heroui/react";
import { StatusPill } from "@/components/admin/DataTable";
import { TextareaField } from "@/components/admin/form";

type OrderStatus = "PENDING" | "SENDING" | "SENT" | "DELIVERED" | "CANCELLED";
type PaymentStatus = "UNPAID" | "PAID" | "REFUNDED";

interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  lineTotal: number;
}

interface OrderDetail {
  id: string;
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  };
  shippingAddress: string;
  postalCode: string;
  subtotal: number;
  discount: number;
  shippingCost: number;
  tax: number;
  total: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  adminNote: string | null;
  createdAt: string;
  items: OrderItem[];
}

const STATUS_LABELS: Record<OrderStatus, string> = {
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

const STEPS: { value: OrderStatus; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "SENDING", label: "Sending" },
  { value: "SENT", label: "Sent" },
  { value: "DELIVERED", label: "Delivered" },
];

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  PENDING: "SENDING",
  SENDING: "SENT",
  SENT: "DELIVERED",
};

interface ItemColumn {
  key: string;
  label: string;
  render: (item: OrderItem) => ReactNode;
}

const ITEM_COLUMNS: ItemColumn[] = [
  { key: "productName", label: "Product", render: (item) => item.productName },
  { key: "quantity", label: "Qty", render: (item) => item.quantity },
  { key: "price", label: "Price", render: (item) => item.price.toLocaleString() },
  { key: "lineTotal", label: "Total", render: (item) => item.lineTotal.toLocaleString() },
];

const noteFormSchema = z.object({
  adminNote: z.string().min(1, "Note is required").max(2000),
});

type NoteFormValues = z.infer<typeof noteFormSchema>;

function OrderStepper({ status }: { status: OrderStatus }) {
  const currentIndex = STEPS.findIndex((step) => step.value === status);

  return (
    <div className="flex items-center">
      {STEPS.map((step, index) => {
        const isReached = index <= currentIndex;
        return (
          <div key={step.value} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-2">
              <div
                className={`flex size-8 items-center justify-center rounded-full border text-sm font-medium ${
                  isReached
                    ? "border-accent bg-accent text-white"
                    : "border-neutral-300 text-neutral-400"
                }`}
              >
                {index + 1}
              </div>
              <span
                className={`text-xs font-medium ${
                  isReached ? "text-neutral-900" : "text-neutral-400"
                }`}
              >
                {step.label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={`mx-2 h-0.5 flex-1 ${
                  index < currentIndex ? "bg-accent" : "bg-neutral-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting: isSavingNote },
  } = useForm<NoteFormValues>({
    resolver: zodResolver(noteFormSchema),
    defaultValues: { adminNote: "" },
  });

  useEffect(() => {
    let ignore = false;

    async function loadOrder() {
      setIsLoading(true);
      setLoadError(null);

      const response = await fetch(`/api/admin/orders/${orderId}`);
      const result = await response.json();
      if (ignore) return;

      if (!result.success) {
        setLoadError(result.error ?? "Failed to load order");
        setIsLoading(false);
        return;
      }

      setOrder(result.data.order);
      reset({ adminNote: result.data.order.adminNote ?? "" });
      setIsLoading(false);
    }

    void loadOrder();
    return () => {
      ignore = true;
    };
  }, [orderId, reset]);

  const handleNextStep = async () => {
    if (!order) return;
    const next = NEXT_STATUS[order.status];
    if (!next) return;

    setIsUpdatingStatus(true);
    setStatusError(null);

    const response = await fetch(`/api/admin/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    const result = await response.json();
    setIsUpdatingStatus(false);

    if (!result.success) {
      setStatusError(result.error ?? "Failed to update status");
      return;
    }

    setOrder((prev) => (prev ? { ...prev, status: next } : prev));
  };

  const onSaveNote = async (values: NoteFormValues) => {
    setNoteError(null);

    const response = await fetch(`/api/admin/orders/${orderId}/note`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const result = await response.json();

    if (!result.success) {
      setNoteError(result.error ?? "Failed to save note");
      return;
    }

    setOrder((prev) => (prev ? { ...prev, adminNote: values.adminNote } : prev));
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <p className="text-sm text-neutral-500">Loading...</p>
      </div>
    );
  }

  if (loadError || !order) {
    return (
      <div className="p-8">
        <p role="alert" className="text-sm text-danger">
          {loadError ?? "Order not found"}
        </p>
      </div>
    );
  }

  const orderNumber = `#${order.id.slice(-8).toUpperCase()}`;
  const nextStatus = NEXT_STATUS[order.status];

  return (
    <div className="flex flex-col gap-8 p-8">
      <nav className="flex items-center gap-2 text-sm text-neutral-500">
        <Link href="/admin/orders" className="hover:text-neutral-700">
          Orders
        </Link>
        <span>/</span>
        <span className="text-neutral-700">{orderNumber}</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">
            Order {orderNumber}
          </h1>
          <p className="text-sm text-neutral-500">
            Placed on {new Date(order.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          Payment
          <StatusPill value={PAYMENT_LABELS[order.paymentStatus]} />
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-6 p-6">
          {order.status === "CANCELLED" ? (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-neutral-500">Status</span>
              <StatusPill value={STATUS_LABELS.CANCELLED} />
            </div>
          ) : (
            <OrderStepper status={order.status} />
          )}

          {nextStatus && (
            <div className="flex flex-wrap items-center justify-end gap-3">
              {statusError && (
                <p role="alert" className="text-sm text-danger">
                  {statusError}
                </p>
              )}
              <Button onPress={() => void handleNextStep()} isDisabled={isUpdatingStatus}>
                {isUpdatingStatus ? "Updating..." : "Next Step"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="Order items">
                <Table.Header columns={ITEM_COLUMNS}>
                  {(column) => (
                    <Table.Column id={column.key} isRowHeader={column.key === "productName"}>
                      {column.label}
                    </Table.Column>
                  )}
                </Table.Header>
                <Table.Body items={order.items}>
                  {(item) => (
                    <Table.Row id={item.id} columns={ITEM_COLUMNS}>
                      {(column) => <Table.Cell>{column.render(item)}</Table.Cell>}
                    </Table.Row>
                  )}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Totals</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-500">Subtotal</span>
              <span className="text-neutral-900">{order.subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Discount</span>
              <span className="text-neutral-900">
                {order.discount > 0 ? "-" : ""}
                {order.discount.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Shipping</span>
              <span className="text-neutral-900">{order.shippingCost.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Tax</span>
              <span className="text-neutral-900">{order.tax.toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-t border-neutral-200 pt-2 font-semibold">
              <span className="text-neutral-900">Total</span>
              <span className="text-neutral-900">{order.total.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-neutral-900">
              {order.customer.firstName} {order.customer.lastName}
            </span>
            <span className="text-neutral-500">{order.customer.email}</span>
            {order.customer.phone && (
              <span className="text-neutral-500">{order.customer.phone}</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shipping Address</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm text-neutral-700">
            <span>{order.shippingAddress}</span>
            <span>{order.postalCode}</span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Admin Note</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={handleSubmit(onSaveNote)}
          >
            <TextareaField control={control} name="adminNote" label="Note" rows={4} />

            {noteError && (
              <p role="alert" className="text-sm text-danger">
                {noteError}
              </p>
            )}

            <div className="flex justify-end">
              <Button type="submit" isDisabled={isSavingNote}>
                {isSavingNote ? "Saving..." : "Save Note"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
