"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  FormActions,
  KeyValueField,
  ProductSelectField,
  SelectField,
  TextField,
  TextareaField,
  type ProductOption,
} from "@/components/admin/form";

const CLIMATE_OPTIONS = [
  { label: "Standard", value: "STANDARD" },
  { label: "Hot", value: "HOT" },
  { label: "Cold", value: "COLD" },
];

interface CategoryOption {
  id: string;
  nameEn: string;
  partType: string;
}

const fitmentFormSchema = z
  .object({
    categoryId: z.string().min(1, "Category is required"),
    climate: z.string().min(1, "Climate is required"),
    productId: z.string(),
    specNote: z.string().max(2000),
    specAttributes: z.record(z.string(), z.string()).nullable(),
    priority: z
      .string()
      .min(1, "Priority is required")
      .refine(
        (v) => Number.isInteger(Number(v)),
        "Priority must be a whole number",
      ),
    adminNote: z.string().max(2000),
  })
  .superRefine((data, ctx) => {
    if (!data.productId && !data.specNote.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["specNote"],
        message: "Select a product or enter a spec note",
      });
    }
  });

type FitmentFormValues = z.infer<typeof fitmentFormSchema>;

const emptyDefaults: FitmentFormValues = {
  categoryId: "",
  climate: "STANDARD",
  productId: "",
  specNote: "",
  specAttributes: null,
  priority: "0",
  adminNote: "",
};

export default function FitmentRecommendationFormPage() {
  const router = useRouter();
  const params = useParams<{
    carBrandId: string;
    carModelId: string;
    carEngineId: string;
    fitmentId: string;
  }>();
  const { carBrandId, carModelId, carEngineId } = params;
  const segment = params.fitmentId;
  const isEdit = segment !== "add";
  const fitmentId = isEdit ? segment : null;

  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [areCategoriesLoading, setAreCategoriesLoading] = useState(true);
  const [isRecordLoading, setIsRecordLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [productOption, setProductOption] = useState<ProductOption | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { isSubmitting },
  } = useForm<FitmentFormValues>({
    resolver: zodResolver(fitmentFormSchema),
    defaultValues: emptyDefaults,
  });

  const categoryId = watch("categoryId");
  const productId = watch("productId");
  const selectedPartType = categoryOptions.find((c) => c.id === categoryId)?.partType;
  const isClimateLocked = !!categoryId && selectedPartType !== "ENGINE_OIL";

  useEffect(() => {
    if (isClimateLocked) setValue("climate", "STANDARD");
  }, [isClimateLocked, setValue]);

  useEffect(() => {
    let ignore = false;

    async function loadCategoryOptions() {
      setAreCategoriesLoading(true);
      const response = await fetch("/api/admin/categories?status=ACTIVE&pageSize=100");
      const result = await response.json();
      if (ignore) return;
      if (result.success) setCategoryOptions(result.data.categories);
      setAreCategoriesLoading(false);
    }

    void loadCategoryOptions();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!isEdit || !fitmentId) return;
    let ignore = false;

    async function loadFitmentRecommendation() {
      setIsRecordLoading(true);
      setLoadError(null);

      const response = await fetch(`/api/admin/fitment/${fitmentId}`);
      const result = await response.json();
      if (ignore) return;

      if (!result.success) {
        setLoadError(result.error ?? "Failed to load fitment recommendation");
        setIsRecordLoading(false);
        return;
      }

      const fitmentRecommendation = result.data.fitmentRecommendation;
      reset({
        categoryId: fitmentRecommendation.category.id,
        climate: fitmentRecommendation.climate,
        productId: fitmentRecommendation.product?.id ?? "",
        specNote: fitmentRecommendation.specNote ?? "",
        specAttributes: fitmentRecommendation.specAttributes ?? null,
        priority: String(fitmentRecommendation.priority),
        adminNote: fitmentRecommendation.adminNote ?? "",
      });
      setProductOption(
        fitmentRecommendation.product
          ? { id: fitmentRecommendation.product.id, label: fitmentRecommendation.product.nameEn }
          : null,
      );
      setIsRecordLoading(false);
    }

    void loadFitmentRecommendation();
    return () => {
      ignore = true;
    };
  }, [isEdit, fitmentId, reset]);

  const onSubmit = async (values: FitmentFormValues) => {
    setSubmitError(null);

    const payload = {
      ...(isEdit ? {} : { carEngineId }),
      categoryId: values.categoryId,
      climate: values.climate,
      productId: values.productId || null,
      specNote: values.specNote.trim() ? values.specNote.trim() : null,
      specAttributes: values.specAttributes,
      priority: Number(values.priority),
      adminNote: values.adminNote.trim() ? values.adminNote.trim() : null,
    };

    const response = await fetch(
      isEdit ? `/api/admin/fitment/${fitmentId}` : "/api/admin/fitment",
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const result = await response.json();

    if (!result.success) {
      setSubmitError(result.error ?? "Failed to save fitment recommendation");
      return;
    }

    router.push(
      `/admin/cars/brands/${carBrandId}/models/${carModelId}/engines/${carEngineId}/fitment`,
    );
  };

  const isLoading = areCategoriesLoading || isRecordLoading;

  if (isLoading) {
    return (
      <div className="p-8">
        <p className="text-sm text-neutral-500">Loading...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-8">
        <p role="alert" className="text-sm text-danger">
          {loadError}
        </p>
      </div>
    );
  }

  const fitmentListPath = `/admin/cars/brands/${carBrandId}/models/${carModelId}/engines/${carEngineId}/fitment`;

  return (
    <div className="flex flex-col gap-6 p-8">
      <nav className="flex items-center gap-2 text-sm text-neutral-500">
        <Link href="/admin/cars/brands" className="hover:text-neutral-700">
          Car Brands
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
          Engines
        </Link>
        <span>/</span>
        <Link href={fitmentListPath} className="hover:text-neutral-700">
          Fitment
        </Link>
      </nav>

      <h1 className="text-lg font-semibold text-neutral-900">
        {isEdit ? "Edit Fitment Recommendation" : "Add Fitment Recommendation"}
      </h1>

      <form
        className="flex max-w-2xl flex-col gap-6"
        noValidate
        onSubmit={handleSubmit(onSubmit)}
      >
        <SelectField
          control={control}
          name="categoryId"
          label="Category"
          options={categoryOptions.map((c) => ({ label: c.nameEn, value: c.id }))}
          isRequired
        />

        <SelectField
          control={control}
          name="climate"
          label="Climate"
          options={CLIMATE_OPTIONS}
          isRequired
          isDisabled={isClimateLocked}
        />

        <ProductSelectField
          control={control}
          name="productId"
          label="Product"
          initialOption={productOption}
        />

        <TextareaField
          control={control}
          name="specNote"
          label="Spec Note"
          placeholder="Shown to customers when no exact product match exists yet"
        />

        <KeyValueField control={control} name="specAttributes" label="Spec Attributes" />

        <TextField control={control} name="priority" label="Priority" type="number" isRequired />

        <TextareaField
          control={control}
          name="adminNote"
          label="Admin Note"
          placeholder="Internal note — not shown to customers"
        />

        {!productId && (
          <p className="text-xs text-neutral-500">
            No product selected — the Spec Note above is shown to customers when
            no exact product match exists yet.
          </p>
        )}

        {submitError && (
          <p role="alert" className="text-sm text-danger">
            {submitError}
          </p>
        )}

        <FormActions
          onCancel={() => router.push(fitmentListPath)}
          isSubmitting={isSubmitting}
        />
      </form>
    </div>
  );
}
