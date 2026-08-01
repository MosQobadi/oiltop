"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/react";
import { DataTable, StatusPill, type DataTableColumn } from "@/components/admin/DataTable";

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  status: "ACTIVE" | "INACTIVE";
  orderCount: number;
  createdAt: string;
}

const STATUS_OPTIONS = [
  { label: "Active", value: "ACTIVE" },
  { label: "Inactive", value: "INACTIVE" },
];

const STATUS_LABELS: Record<Customer["status"], string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

const PAGE_SIZE = 20;

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadCustomers() {
      setIsLoading(true);
      setLoadError(null);

      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (search) params.set("search", search);
      if (status) params.set("status", status);

      const response = await fetch(`/api/admin/customers?${params.toString()}`);
      const result = await response.json();
      if (ignore) return;

      if (!result.success) {
        setLoadError(result.error ?? "Failed to load customers");
        setIsLoading(false);
        return;
      }

      setCustomers(result.data.items);
      setTotal(result.data.total);
      setIsLoading(false);
    }

    void loadCustomers();
    return () => {
      ignore = true;
    };
  }, [page, search, status]);

  const columns: DataTableColumn<Customer>[] = [
    {
      key: "firstName",
      label: "Name",
      render: (row) => `${row.firstName} ${row.lastName}`,
    },
    { key: "email", label: "Email" },
    {
      key: "phone",
      label: "Phone",
      render: (row) => row.phone ?? "—",
    },
    { key: "orderCount", label: "Orders" },
    {
      key: "status",
      label: "Status",
      render: (row) => <StatusPill value={STATUS_LABELS[row.status]} />,
    },
    {
      key: "id",
      label: "Actions",
      render: (row) => (
        <Button
          variant="ghost"
          size="sm"
          onPress={() => router.push(`/admin/customers/${row.id}`)}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-8">
      <h1 className="text-lg font-semibold text-neutral-900">Customers</h1>

      {loadError && (
        <p role="alert" className="text-sm text-danger">
          {loadError}
        </p>
      )}

      <DataTable
        columns={columns}
        rows={customers}
        searchPlaceholder="Search by name, email, or phone..."
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
        ]}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        emptyMessage={isLoading ? "Loading..." : "No customers found."}
        aria-label="Customers"
      />
    </div>
  );
}
