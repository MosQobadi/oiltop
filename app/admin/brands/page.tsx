"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog, Button } from "@heroui/react";
import { DataTable, StatusPill, type DataTableColumn } from "@/components/admin/DataTable";

interface Brand {
  id: string;
  nameEn: string;
  slug: string;
  logo: string | null;
  status: "ACTIVE" | "INACTIVE";
  productCount: number;
}

const STATUS_OPTIONS = [
  { label: "Active", value: "ACTIVE" },
  { label: "Inactive", value: "INACTIVE" },
];

const PAGE_SIZE = 20;

export default function BrandsPage() {
  const router = useRouter();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Brand | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let ignore = false;

    async function loadBrands() {
      setIsLoading(true);
      setLoadError(null);

      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (search) params.set("search", search);
      if (status) params.set("status", status);

      const response = await fetch(`/api/admin/brands?${params.toString()}`);
      const result = await response.json();
      if (ignore) return;

      if (!result.success) {
        setLoadError(result.error ?? "Failed to load brands");
        setIsLoading(false);
        return;
      }

      setBrands(result.data.brands);
      setTotal(result.data.total);
      setIsLoading(false);
    }

    void loadBrands();
    return () => {
      ignore = true;
    };
  }, [page, search, status, reloadKey]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);

    const response = await fetch(`/api/admin/brands/${deleteTarget.id}`, {
      method: "DELETE",
    });
    const result = await response.json();
    setIsDeleting(false);

    if (!result.success) {
      setDeleteError(result.error ?? "Failed to delete brand");
      return;
    }

    setDeleteTarget(null);
    setReloadKey((key) => key + 1);
  };

  const columns: DataTableColumn<Brand>[] = [
    {
      key: "logo",
      label: "Logo",
      render: (row) => (
        <div className="flex size-10 items-center justify-center overflow-hidden rounded-field bg-field">
          {row.logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- brand logo URL isn't a known static/remote-configured asset
            <img src={row.logo} alt="" className="size-full object-cover" />
          ) : (
            <span className="text-xs text-neutral-400">—</span>
          )}
        </div>
      ),
    },
    { key: "nameEn", label: "Brand" },
    { key: "slug", label: "Slug" },
    { key: "productCount", label: "Products" },
    {
      key: "status",
      label: "Status",
      render: (row) => <StatusPill value={row.status} />,
    },
    {
      key: "id",
      label: "Actions",
      render: (row) => (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onPress={() => router.push(`/admin/brands/${row.id}`)}
          >
            Edit
          </Button>
          <Button
            variant="danger"
            size="sm"
            onPress={() => {
              setDeleteError(null);
              setDeleteTarget(row);
            }}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">Brands</h1>
        <Button onPress={() => router.push("/admin/brands/add")}>
          + Add Brand
        </Button>
      </div>

      {loadError && (
        <p role="alert" className="text-sm text-danger">
          {loadError}
        </p>
      )}

      <DataTable
        columns={columns}
        rows={brands}
        searchPlaceholder="Search brands..."
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
        emptyMessage={isLoading ? "Loading..." : "No brands found."}
        aria-label="Brands"
      />

      <AlertDialog
        isOpen={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog>
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger" />
                <AlertDialog.Heading>Delete brand</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>
                  Are you sure you want to delete &ldquo;{deleteTarget?.nameEn}
                  &rdquo;? This action cannot be undone.
                </p>
                {deleteError && (
                  <p role="alert" className="mt-2 text-sm text-danger">
                    {deleteError}
                  </p>
                )}
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button
                  variant="outline"
                  onPress={() => setDeleteTarget(null)}
                  isDisabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onPress={() => void handleDelete()}
                  isDisabled={isDeleting}
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  );
}
