"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AlertDialog, Button } from "@heroui/react";
import { DataTable, StatusPill, type DataTableColumn } from "@/components/admin/DataTable";

interface CarModel {
  id: string;
  nameEn: string;
  slug: string;
  image: string | null;
  status: "ACTIVE" | "INACTIVE";
  engineCount: number;
}

interface CarBrand {
  id: string;
  nameEn: string;
}

const STATUS_OPTIONS = [
  { label: "Active", value: "ACTIVE" },
  { label: "Inactive", value: "INACTIVE" },
];

const PAGE_SIZE = 20;

export default function CarModelsPage() {
  const router = useRouter();
  const params = useParams<{ carBrandId: string }>();
  const carBrandId = params.carBrandId;

  const [carBrand, setCarBrand] = useState<CarBrand | null>(null);
  const [carModels, setCarModels] = useState<CarModel[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CarModel | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let ignore = false;

    async function loadCarBrand() {
      const response = await fetch(`/api/admin/car-brands/${carBrandId}`);
      const result = await response.json();
      if (ignore) return;
      if (result.success) setCarBrand(result.data.carBrand);
    }

    void loadCarBrand();
    return () => {
      ignore = true;
    };
  }, [carBrandId]);

  useEffect(() => {
    let ignore = false;

    async function loadCarModels() {
      setIsLoading(true);
      setLoadError(null);

      const queryParams = new URLSearchParams({
        carBrandId,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (search) queryParams.set("search", search);
      if (status) queryParams.set("status", status);

      const response = await fetch(`/api/admin/car-models?${queryParams.toString()}`);
      const result = await response.json();
      if (ignore) return;

      if (!result.success) {
        setLoadError(result.error ?? "Failed to load car models");
        setIsLoading(false);
        return;
      }

      setCarModels(result.data.carModels);
      setTotal(result.data.total);
      setIsLoading(false);
    }

    void loadCarModels();
    return () => {
      ignore = true;
    };
  }, [carBrandId, page, search, status, reloadKey]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);

    const response = await fetch(`/api/admin/car-models/${deleteTarget.id}`, {
      method: "DELETE",
    });
    const result = await response.json();
    setIsDeleting(false);

    if (!result.success) {
      setDeleteError(result.error ?? "Failed to delete car model");
      return;
    }

    setDeleteTarget(null);
    setReloadKey((key) => key + 1);
  };

  const columns: DataTableColumn<CarModel>[] = [
    {
      key: "image",
      label: "Image",
      render: (row) => (
        <div className="flex size-10 items-center justify-center overflow-hidden rounded-field bg-field">
          {row.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- car model image URL isn't a known static/remote-configured asset
            <img src={row.image} alt="" className="size-full object-cover" />
          ) : (
            <span className="text-xs text-neutral-400">—</span>
          )}
        </div>
      ),
    },
    { key: "nameEn", label: "Model" },
    { key: "slug", label: "Slug" },
    { key: "engineCount", label: "Engines" },
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
            onPress={() =>
              router.push(`/admin/cars/brands/${carBrandId}/models/${row.id}/engines`)
            }
          >
            Engines
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onPress={() =>
              router.push(`/admin/cars/brands/${carBrandId}/models/${row.id}`)
            }
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
      <nav className="flex items-center gap-2 text-sm text-neutral-500">
        <Link href="/admin/cars/brands" className="hover:text-neutral-700">
          Car Brands
        </Link>
        <span>/</span>
        <Link
          href={`/admin/cars/brands/${carBrandId}`}
          className="hover:text-neutral-700"
        >
          {carBrand?.nameEn ?? "…"}
        </Link>
        <span>/</span>
        <span className="text-neutral-700">Models</span>
      </nav>

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">
          {carBrand ? `${carBrand.nameEn} — Models` : "Models"}
        </h1>
        <Button
          onPress={() => router.push(`/admin/cars/brands/${carBrandId}/models/add`)}
        >
          + Add Model
        </Button>
      </div>

      {loadError && (
        <p role="alert" className="text-sm text-danger">
          {loadError}
        </p>
      )}

      <DataTable
        columns={columns}
        rows={carModels}
        searchPlaceholder="Search car models..."
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
        emptyMessage={isLoading ? "Loading..." : "No car models found."}
        aria-label="Car Models"
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
                <AlertDialog.Heading>Delete car model</AlertDialog.Heading>
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
