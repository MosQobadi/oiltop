"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog, Button } from "@heroui/react";
import { DataTable, StatusPill, type DataTableColumn } from "@/components/admin/DataTable";
import { useBulkActivate } from "@/components/admin/useBulkActivate";
import { SOURCE_OPTIONS } from "@/components/admin/sourceFilter";

interface Category {
  id: string;
  nameEn: string;
  slug: string;
  image: string | null;
  status: "ACTIVE" | "INACTIVE";
  partType: "ENGINE_OIL" | "FILTER" | "ACCESSORY" | "OTHER";
  sortOrder: number | null;
  productCount: number;
}

const PART_TYPE_LABELS: Record<Category["partType"], string> = {
  ENGINE_OIL: "Engine Oil",
  FILTER: "Filter",
  ACCESSORY: "Accessory",
  OTHER: "Other",
};

const STATUS_OPTIONS = [
  { label: "Active", value: "ACTIVE" },
  { label: "Inactive", value: "INACTIVE" },
];

const PART_TYPE_OPTIONS = Object.entries(PART_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const PAGE_SIZE = 20;

export default function CategoriesPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [partType, setPartType] = useState("");
  const [source, setSource] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const {
    activate,
    isActivating,
    error: activateError,
    clearError,
  } = useBulkActivate("categories");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let ignore = false;

    async function loadCategories() {
      setIsLoading(true);
      setLoadError(null);

      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      if (partType) params.set("partType", partType);
      if (source) params.set("source", source);

      const response = await fetch(`/api/admin/categories?${params.toString()}`);
      const result = await response.json();
      if (ignore) return;

      if (!result.success) {
        setLoadError(result.error ?? "Failed to load categories");
        setIsLoading(false);
        return;
      }

      setCategories(result.data.categories);
      setTotal(result.data.total);
      setIsLoading(false);
    }

    void loadCategories();
    return () => {
      ignore = true;
    };
  }, [page, search, status, partType, source, reloadKey]);

  // Every query change goes through here so the selection made against the old
  // rows goes with them — see the same helper on the Products list.
  const changeQuery = (apply: () => void) => {
    apply();
    setSelectedIds([]);
    clearError();
  };

  const handleActivateSelected = async () => {
    const { activated } = await activate(selectedIds);
    setSelectedIds([]);
    if (activated > 0) setReloadKey((key) => key + 1);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);

    const response = await fetch(`/api/admin/categories/${deleteTarget.id}`, {
      method: "DELETE",
    });
    const result = await response.json();
    setIsDeleting(false);

    if (!result.success) {
      setDeleteError(result.error ?? "Failed to delete category");
      return;
    }

    setDeleteTarget(null);
    setReloadKey((key) => key + 1);
  };

  const columns: DataTableColumn<Category>[] = [
    {
      key: "image",
      label: "Image",
      render: (row) => (
        <div className="rounded-field bg-field flex size-10 items-center justify-center overflow-hidden">
          {row.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- category image URL isn't a known static/remote-configured asset
            <img src={row.image} alt="" className="size-full object-cover" />
          ) : (
            <span className="text-xs text-neutral-400">—</span>
          )}
        </div>
      ),
    },
    { key: "nameEn", label: "Category" },
    { key: "slug", label: "Slug" },
    {
      key: "partType",
      label: "Part Type",
      render: (row) => PART_TYPE_LABELS[row.partType],
    },
    { key: "productCount", label: "Products" },
    // Where the storefront puts it, not where this list does — this table stays
    // newest-first so the review queue keeps working.
    {
      key: "sortOrder",
      label: "Order",
      render: (row) => row.sortOrder ?? <span className="text-neutral-400">—</span>,
    },
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
            onPress={() => router.push(`/admin/categories/${row.id}`)}
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
        <h1 className="text-lg font-semibold text-neutral-900">Categories</h1>
        <Button onPress={() => router.push("/admin/categories/add")}>+ Add Category</Button>
      </div>

      {loadError && (
        <p role="alert" className="text-danger text-sm">
          {loadError}
        </p>
      )}

      {activateError && (
        <p role="alert" className="text-danger text-sm">
          {activateError}
        </p>
      )}

      <DataTable
        columns={columns}
        rows={categories}
        searchPlaceholder="Search categories..."
        onSearch={(value) =>
          changeQuery(() => {
            setPage(1);
            setSearch(value);
          })
        }
        filters={[
          {
            label: "Status",
            value: status,
            options: STATUS_OPTIONS,
            onChange: (value) =>
              changeQuery(() => {
                setPage(1);
                setStatus(value);
              }),
          },
          {
            label: "Part Type",
            value: partType,
            options: PART_TYPE_OPTIONS,
            onChange: (value) =>
              changeQuery(() => {
                setPage(1);
                setPartType(value);
              }),
          },
          {
            label: "Source",
            value: source,
            options: SOURCE_OPTIONS,
            onChange: (value) =>
              changeQuery(() => {
                setPage(1);
                setSource(value);
              }),
          },
        ]}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        getRowLabel={(row) => row.nameEn}
        bulkActions={
          <Button size="sm" onPress={() => void handleActivateSelected()} isDisabled={isActivating}>
            {isActivating ? "Activating..." : "Activate selected"}
          </Button>
        }
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={(next) => changeQuery(() => setPage(next))}
        emptyMessage={isLoading ? "Loading..." : "No categories found."}
        aria-label="Categories"
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
                <AlertDialog.Heading>Delete category</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>
                  Are you sure you want to delete &ldquo;{deleteTarget?.nameEn}
                  &rdquo;? This action cannot be undone.
                </p>
                {deleteError && (
                  <p role="alert" className="text-danger mt-2 text-sm">
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
