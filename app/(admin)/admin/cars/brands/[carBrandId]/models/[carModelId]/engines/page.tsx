"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AlertDialog, Button } from "@heroui/react";
import { DataTable, StatusPill, type DataTableColumn } from "@/components/admin/DataTable";

interface CarEngine {
  id: string;
  labelEn: string;
  yearStart: number;
  yearEnd: number | null;
  fuelType: "PETROL" | "DIESEL" | "HYBRID" | "ELECTRIC" | "LPG_CNG";
  displacementCc: number | null;
  engineCode: string | null;
  status: "ACTIVE" | "INACTIVE";
}

interface CarBrand {
  id: string;
  nameEn: string;
}

interface CarModel {
  id: string;
  nameEn: string;
}

const STATUS_OPTIONS = [
  { label: "Active", value: "ACTIVE" },
  { label: "Inactive", value: "INACTIVE" },
];

const FUEL_TYPE_LABELS: Record<CarEngine["fuelType"], string> = {
  PETROL: "Petrol",
  DIESEL: "Diesel",
  HYBRID: "Hybrid",
  ELECTRIC: "Electric",
  LPG_CNG: "LPG/CNG",
};

const PAGE_SIZE = 20;

export default function CarEnginesPage() {
  const router = useRouter();
  const params = useParams<{ carBrandId: string; carModelId: string }>();
  const { carBrandId, carModelId } = params;

  const [carBrand, setCarBrand] = useState<CarBrand | null>(null);
  const [carModel, setCarModel] = useState<CarModel | null>(null);
  const [carEngines, setCarEngines] = useState<CarEngine[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CarEngine | null>(null);
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

    async function loadCarEngines() {
      setIsLoading(true);
      setLoadError(null);

      const queryParams = new URLSearchParams({
        carModelId,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (search) queryParams.set("search", search);
      if (status) queryParams.set("status", status);

      const response = await fetch(`/api/admin/car-engines?${queryParams.toString()}`);
      const result = await response.json();
      if (ignore) return;

      if (!result.success) {
        setLoadError(result.error ?? "Failed to load car engines");
        setIsLoading(false);
        return;
      }

      setCarEngines(result.data.carEngines);
      setTotal(result.data.total);
      setIsLoading(false);
    }

    void loadCarEngines();
    return () => {
      ignore = true;
    };
  }, [carModelId, page, search, status, reloadKey]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);

    const response = await fetch(`/api/admin/car-engines/${deleteTarget.id}`, {
      method: "DELETE",
    });
    const result = await response.json();
    setIsDeleting(false);

    if (!result.success) {
      setDeleteError(result.error ?? "Failed to delete car engine");
      return;
    }

    setDeleteTarget(null);
    setReloadKey((key) => key + 1);
  };

  const columns: DataTableColumn<CarEngine>[] = [
    { key: "labelEn", label: "Label" },
    {
      key: "yearStart",
      label: "Years",
      render: (row) => `${row.yearStart} – ${row.yearEnd ?? "Present"}`,
    },
    {
      key: "fuelType",
      label: "Fuel Type",
      render: (row) => FUEL_TYPE_LABELS[row.fuelType],
    },
    {
      key: "displacementCc",
      label: "Displacement",
      render: (row) => (row.displacementCc ? `${row.displacementCc} cc` : "—"),
    },
    {
      key: "engineCode",
      label: "Engine Code",
      render: (row) => row.engineCode ?? "—",
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
            onPress={() =>
              router.push(`/admin/cars/brands/${carBrandId}/models/${carModelId}/engines/${row.id}`)
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
        <Link href={`/admin/cars/brands/${carBrandId}`} className="hover:text-neutral-700">
          {carBrand?.nameEn ?? "…"}
        </Link>
        <span>/</span>
        <Link href={`/admin/cars/brands/${carBrandId}/models`} className="hover:text-neutral-700">
          Models
        </Link>
        <span>/</span>
        <span className="text-neutral-700">{carModel?.nameEn ?? "…"}</span>
      </nav>

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">
          {carModel ? `${carModel.nameEn} — Engines` : "Engines"}
        </h1>
        <Button
          onPress={() =>
            router.push(`/admin/cars/brands/${carBrandId}/models/${carModelId}/engines/add`)
          }
        >
          + Add Engine
        </Button>
      </div>

      {loadError && (
        <p role="alert" className="text-danger text-sm">
          {loadError}
        </p>
      )}

      <DataTable
        columns={columns}
        rows={carEngines}
        searchPlaceholder="Search car engines..."
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
        emptyMessage={isLoading ? "Loading..." : "No car engines found."}
        aria-label="Car Engines"
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
                <AlertDialog.Heading>Delete car engine</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>
                  Are you sure you want to delete &ldquo;{deleteTarget?.labelEn}
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
