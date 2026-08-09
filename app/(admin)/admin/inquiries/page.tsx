"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/react";
import { DataTable, StatusPill, type DataTableColumn } from "@/components/admin/DataTable";

interface Inquiry {
  id: string;
  customerName: string;
  phone: string;
  email: string | null;
  carEngineLabel: string | null;
  categoryName: string | null;
  status: "NEW" | "CONTACTED" | "RESOLVED";
  createdAt: string;
}

const STATUS_OPTIONS = [
  { label: "New", value: "NEW" },
  { label: "Contacted", value: "CONTACTED" },
  { label: "Resolved", value: "RESOLVED" },
];

const STATUS_LABELS: Record<Inquiry["status"], string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  RESOLVED: "Resolved",
};

const PAGE_SIZE = 20;

export default function InquiriesPage() {
  const router = useRouter();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadInquiries() {
      setIsLoading(true);
      setLoadError(null);

      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (search) params.set("search", search);
      if (status) params.set("status", status);

      const response = await fetch(`/api/admin/fitment-inquiries?${params.toString()}`);
      const result = await response.json();
      if (ignore) return;

      if (!result.success) {
        setLoadError(result.error ?? "Failed to load inquiries");
        setIsLoading(false);
        return;
      }

      setInquiries(result.data.items);
      setTotal(result.data.total);
      setIsLoading(false);
    }

    void loadInquiries();
    return () => {
      ignore = true;
    };
  }, [page, search, status]);

  const columns: DataTableColumn<Inquiry>[] = [
    { key: "customerName", label: "Customer" },
    { key: "phone", label: "Phone" },
    {
      key: "carEngineLabel",
      label: "Car",
      render: (row) => row.carEngineLabel ?? "—",
    },
    {
      key: "categoryName",
      label: "Category",
      render: (row) => row.categoryName ?? "—",
    },
    {
      key: "status",
      label: "Status",
      render: (row) => <StatusPill value={STATUS_LABELS[row.status]} />,
    },
    {
      key: "createdAt",
      label: "Date",
      render: (row) => new Date(row.createdAt).toLocaleDateString(),
    },
    {
      key: "id",
      label: "Actions",
      render: (row) => (
        <Button variant="ghost" size="sm" onPress={() => router.push(`/admin/inquiries/${row.id}`)}>
          View
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-8">
      <h1 className="text-lg font-semibold text-neutral-900">Fitment Inquiries</h1>

      {loadError && (
        <p role="alert" className="text-danger text-sm">
          {loadError}
        </p>
      )}

      <DataTable
        columns={columns}
        rows={inquiries}
        searchPlaceholder="Search by name, phone, or email..."
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
        emptyMessage={isLoading ? "Loading..." : "No inquiries found."}
        aria-label="Fitment Inquiries"
      />
    </div>
  );
}
