"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AlertDialog, Button } from "@heroui/react";
import { DataTable, type DataTableColumn } from "@/components/admin/DataTable";

interface FitmentRecommendation {
  id: string;
  climate: "STANDARD" | "HOT" | "COLD";
  specNote: string | null;
  priority: number;
  category: { id: string; nameEn: string };
  product: { id: string; nameEn: string } | null;
}

interface CarBrand {
  id: string;
  nameEn: string;
}

interface CarModel {
  id: string;
  nameEn: string;
}

interface CarEngine {
  id: string;
  labelEn: string;
}

interface CategoryOption {
  id: string;
  nameEn: string;
}

const CLIMATE_LABELS: Record<FitmentRecommendation["climate"], string> = {
  STANDARD: "Standard",
  HOT: "Hot",
  COLD: "Cold",
};

const PAGE_SIZE = 20;

export default function FitmentRecommendationsPage() {
  const router = useRouter();
  const params = useParams<{
    carBrandId: string;
    carModelId: string;
    carEngineId: string;
  }>();
  const { carBrandId, carModelId, carEngineId } = params;

  const [carBrand, setCarBrand] = useState<CarBrand | null>(null);
  const [carModel, setCarModel] = useState<CarModel | null>(null);
  const [carEngine, setCarEngine] = useState<CarEngine | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [fitmentRecommendations, setFitmentRecommendations] = useState<
    FitmentRecommendation[]
  >([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [categoryId, setCategoryId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FitmentRecommendation | null>(
    null,
  );
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

    async function loadCarModel() {
      const response = await fetch(`/api/admin/car-models/${carModelId}`);
      const result = await response.json();
      if (ignore) return;
      if (result.success) setCarModel(result.data.carModel);
    }

    void loadCarModel();
    return () => {
      ignore = true;
    };
  }, [carModelId]);

  useEffect(() => {
    let ignore = false;

    async function loadCarEngine() {
      const response = await fetch(`/api/admin/car-engines/${carEngineId}`);
      const result = await response.json();
      if (ignore) return;
      if (result.success) setCarEngine(result.data.carEngine);
    }

    void loadCarEngine();
    return () => {
      ignore = true;
    };
  }, [carEngineId]);

  useEffect(() => {
    let ignore = false;

    async function loadCategoryOptions() {
      const response = await fetch("/api/admin/categories/options");
      const result = await response.json();
      if (ignore) return;
      if (result.success) setCategoryOptions(result.data.categories);
    }

    void loadCategoryOptions();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadFitmentRecommendations() {
      setIsLoading(true);
      setLoadError(null);

      const queryParams = new URLSearchParams({
        carEngineId,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (categoryId) queryParams.set("categoryId", categoryId);

      const response = await fetch(`/api/admin/fitment?${queryParams.toString()}`);
      const result = await response.json();
      if (ignore) return;

      if (!result.success) {
        setLoadError(result.error ?? "Failed to load fitment recommendations");
        setIsLoading(false);
        return;
      }

      setFitmentRecommendations(result.data.fitmentRecommendations);
      setTotal(result.data.total);
      setIsLoading(false);
    }

    void loadFitmentRecommendations();
    return () => {
      ignore = true;
    };
  }, [carEngineId, page, categoryId, reloadKey]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);

    const response = await fetch(`/api/admin/fitment/${deleteTarget.id}`, {
      method: "DELETE",
    });
    const result = await response.json();
    setIsDeleting(false);

    if (!result.success) {
      setDeleteError(result.error ?? "Failed to delete fitment recommendation");
      return;
    }

    setDeleteTarget(null);
    setReloadKey((key) => key + 1);
  };

  const basePath = `/admin/cars/brands/${carBrandId}/models/${carModelId}/engines/${carEngineId}/fitment`;

  const columns: DataTableColumn<FitmentRecommendation>[] = [
    {
      key: "category",
      label: "Category",
      render: (row) => row.category.nameEn,
    },
    {
      key: "climate",
      label: "Climate",
      render: (row) => CLIMATE_LABELS[row.climate],
    },
    {
      key: "product",
      label: "Product",
      render: (row) => row.product?.nameEn ?? "Spec only",
    },
    { key: "priority", label: "Priority" },
    {
      key: "id",
      label: "Actions",
      render: (row) => (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onPress={() => router.push(`${basePath}/${row.id}`)}
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
        <Link
          href={`/admin/cars/brands/${carBrandId}/models`}
          className="hover:text-neutral-700"
        >
          Models
        </Link>
        <span>/</span>
        <Link
          href={`/admin/cars/brands/${carBrandId}/models/${carModelId}/engines`}
          className="hover:text-neutral-700"
        >
          {carModel?.nameEn ?? "…"}
        </Link>
        <span>/</span>
        <span className="text-neutral-700">{carEngine?.labelEn ?? "…"}</span>
      </nav>

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">
          {carEngine ? `${carEngine.labelEn} — Fitment Recommendations` : "Fitment Recommendations"}
        </h1>
        <Button onPress={() => router.push(`${basePath}/add`)}>
          + Add Recommendation
        </Button>
      </div>

      {loadError && (
        <p role="alert" className="text-sm text-danger">
          {loadError}
        </p>
      )}

      <DataTable
        columns={columns}
        rows={fitmentRecommendations}
        filters={[
          {
            label: "Category",
            value: categoryId,
            options: categoryOptions.map((c) => ({ label: c.nameEn, value: c.id })),
            onChange: (value) => {
              setPage(1);
              setCategoryId(value);
            },
          },
        ]}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        emptyMessage={isLoading ? "Loading..." : "No fitment recommendations found."}
        aria-label="Fitment Recommendations"
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
                <AlertDialog.Heading>Delete fitment recommendation</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>
                  Are you sure you want to delete this recommendation for &ldquo;
                  {deleteTarget?.category.nameEn}&rdquo;? This action cannot be
                  undone.
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
