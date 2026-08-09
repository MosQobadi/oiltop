"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog, Button } from "@heroui/react";
import { DataTable, StatusPill, type DataTableColumn } from "@/components/admin/DataTable";

interface Product {
  id: string;
  nameEn: string;
  category: { id: string; nameEn: string };
  brand: { id: string; nameEn: string };
  price: number;
  discountPercent: number;
  stock: number;
  image: string | null;
  status: "ACTIVE" | "INACTIVE";
}

interface Option {
  id: string;
  nameEn: string;
}

const STATUS_OPTIONS = [
  { label: "Active", value: "ACTIVE" },
  { label: "Inactive", value: "INACTIVE" },
];

const PAGE_SIZE = 20;

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<Option[]>([]);
  const [brandOptions, setBrandOptions] = useState<Option[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    async function loadOptions() {
      const [categoriesRes, brandsRes] = await Promise.all([
        fetch("/api/admin/categories/options"),
        fetch("/api/admin/brands/options"),
      ]);
      const categoriesResult = await categoriesRes.json();
      const brandsResult = await brandsRes.json();
      if (categoriesResult.success) setCategoryOptions(categoriesResult.data.categories);
      if (brandsResult.success) setBrandOptions(brandsResult.data.brands);
    }

    void loadOptions();
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadProducts() {
      setIsLoading(true);
      setLoadError(null);

      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      if (category) params.set("category", category);
      if (brand) params.set("brand", brand);

      const response = await fetch(`/api/admin/products?${params.toString()}`);
      const result = await response.json();
      if (ignore) return;

      if (!result.success) {
        setLoadError(result.error ?? "Failed to load products");
        setIsLoading(false);
        return;
      }

      setProducts(result.data.products);
      setTotal(result.data.total);
      setIsLoading(false);
    }

    void loadProducts();
    return () => {
      ignore = true;
    };
  }, [page, search, status, category, brand, reloadKey]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);

    const response = await fetch(`/api/admin/products/${deleteTarget.id}`, {
      method: "DELETE",
    });
    const result = await response.json();
    setIsDeleting(false);

    if (!result.success) {
      setDeleteError(result.error ?? "Failed to delete product");
      return;
    }

    setDeleteTarget(null);
    setReloadKey((key) => key + 1);
  };

  const columns: DataTableColumn<Product>[] = [
    {
      key: "image",
      label: "Image",
      render: (row) => (
        <div className="flex size-10 items-center justify-center overflow-hidden rounded-field bg-field">
          {row.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- product image URL isn't a known static/remote-configured asset
            <img src={row.image} alt="" className="size-full object-cover" />
          ) : (
            <span className="text-xs text-neutral-400">—</span>
          )}
        </div>
      ),
    },
    { key: "nameEn", label: "Name (English)" },
    {
      key: "category",
      label: "Category",
      render: (row) => row.category.nameEn,
    },
    {
      key: "brand",
      label: "Brand",
      render: (row) => row.brand.nameEn,
    },
    {
      key: "price",
      label: "Price",
      render: (row) => row.price.toLocaleString(),
    },
    { key: "stock", label: "Stock" },
    {
      key: "discountPercent",
      label: "Discount",
      render: (row) => `${row.discountPercent}%`,
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
            onPress={() => router.push(`/admin/products/${row.id}`)}
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
        <h1 className="text-lg font-semibold text-neutral-900">Products</h1>
        <Button onPress={() => router.push("/admin/products/add")}>
          + Add Product
        </Button>
      </div>

      {loadError && (
        <p role="alert" className="text-sm text-danger">
          {loadError}
        </p>
      )}

      <DataTable
        columns={columns}
        rows={products}
        searchPlaceholder="Search products..."
        onSearch={(value) => {
          setPage(1);
          setSearch(value);
        }}
        filters={[
          {
            label: "Category",
            value: category,
            options: categoryOptions.map((c) => ({ label: c.nameEn, value: c.id })),
            onChange: (value) => {
              setPage(1);
              setCategory(value);
            },
          },
          {
            label: "Brand",
            value: brand,
            options: brandOptions.map((b) => ({ label: b.nameEn, value: b.id })),
            onChange: (value) => {
              setPage(1);
              setBrand(value);
            },
          },
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
        emptyMessage={isLoading ? "Loading..." : "No products found."}
        aria-label="Products"
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
                <AlertDialog.Heading>Delete product</AlertDialog.Heading>
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
