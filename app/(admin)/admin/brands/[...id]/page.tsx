"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  BilingualTextField,
  FormActions,
  ImageUploadField,
  TextField,
  ToggleField,
} from "@/components/admin/form";
import { slugify } from "@/lib/slug";

const brandFormSchema = z.object({
  slug: z.string().min(1, "Slug is required"),
  nameEn: z.string().min(1, "English name is required").max(200),
  nameFa: z.string().min(1, "Persian name is required").max(200),
  // Blank is a real answer here — "not pinned anywhere" — so the box validates
  // empty, the same way the category form's display order does.
  sortOrder: z.string().refine((value) => {
    if (value.trim() === "") return true;
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 && number <= 9999;
  }, "Display order must be a whole number between 0 and 9999"),
  isActive: z.boolean(),
  logo: z.custom<File | string | null>(),
});

type BrandFormValues = z.infer<typeof brandFormSchema>;

const emptyDefaults: BrandFormValues = {
  slug: "",
  nameEn: "",
  nameFa: "",
  sortOrder: "",
  isActive: true,
  logo: null,
};

async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/admin/upload", {
    method: "POST",
    body: formData,
  });
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error ?? "Failed to upload image");
  }
  return result.data.url as string;
}

export default function BrandFormPage() {
  const router = useRouter();
  const params = useParams<{ id?: string[] }>();
  const segment = params.id?.[0];
  const isEdit = !!segment && segment !== "add";
  const brandId = isEdit ? segment : null;

  const [isLoading, setIsLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { isSubmitting, dirtyFields },
  } = useForm<BrandFormValues>({
    resolver: zodResolver(brandFormSchema),
    defaultValues: emptyDefaults,
  });

  const nameEn = watch("nameEn");

  useEffect(() => {
    if (!isEdit || !brandId) return;
    let ignore = false;

    async function loadBrand() {
      setIsLoading(true);
      setLoadError(null);

      const response = await fetch(`/api/admin/brands/${brandId}`);
      const result = await response.json();
      if (ignore) return;

      if (!result.success) {
        setLoadError(result.error ?? "Failed to load brand");
        setIsLoading(false);
        return;
      }

      const brand = result.data.brand;
      reset({
        slug: brand.slug,
        nameEn: brand.nameEn,
        nameFa: brand.nameFa,
        sortOrder: String(brand.sortOrder ?? ""),
        isActive: brand.status === "ACTIVE",
        logo: brand.logo,
      });
      setIsLoading(false);
    }

    void loadBrand();
    return () => {
      ignore = true;
    };
  }, [isEdit, brandId, reset]);

  // Slug auto-fills from the English name only while creating and only
  // until the user edits it directly — never on edit, so an existing
  // brand's slug isn't silently regenerated when its name changes.
  useEffect(() => {
    if (isEdit || dirtyFields.slug) return;
    setValue("slug", slugify(nameEn));
  }, [nameEn, isEdit, dirtyFields.slug, setValue]);

  const onSubmit = async (values: BrandFormValues) => {
    setSubmitError(null);

    // null, not undefined, when the admin removed the logo: undefined is
    // dropped from the JSON body, so a PATCH would leave the old logo in place
    // and "Remove" would clear the preview but not the record.
    let logoUrl: string | null;
    if (values.logo instanceof File) {
      try {
        logoUrl = await uploadImage(values.logo);
      } catch (error) {
        setSubmitError(error instanceof Error ? error.message : "Failed to upload image");
        return;
      }
    } else {
      logoUrl = values.logo ?? null;
    }

    const payload = {
      slug: values.slug,
      nameEn: values.nameEn,
      nameFa: values.nameFa,
      sortOrder: values.sortOrder.trim() ? Number(values.sortOrder) : null,
      status: values.isActive ? "ACTIVE" : "INACTIVE",
      logo: logoUrl,
    };

    const response = await fetch(isEdit ? `/api/admin/brands/${brandId}` : "/api/admin/brands", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (!result.success) {
      setSubmitError(result.error ?? "Failed to save brand");
      return;
    }

    router.push("/admin/brands");
  };

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
        <p role="alert" className="text-danger text-sm">
          {loadError}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-8">
      <h1 className="text-lg font-semibold text-neutral-900">
        {isEdit ? "Edit Brand" : "Add Brand"}
      </h1>

      <form className="flex max-w-2xl flex-col gap-6" noValidate onSubmit={handleSubmit(onSubmit)}>
        <BilingualTextField
          control={control}
          nameEn="nameEn"
          nameFa="nameFa"
          label="Name"
          isRequired
        />

        <TextField control={control} name="slug" label="Slug" isRequired />

        <ImageUploadField control={control} name="logo" label="Logo" />

        {/* Storefront only. Lowest number shows first; leaving it blank puts the
            brand after the numbered ones, in alphabetical order. */}
        <TextField
          control={control}
          name="sortOrder"
          label="Display Order"
          type="number"
          placeholder="Unordered"
        />

        <ToggleField control={control} name="isActive" label="Active" />

        {submitError && (
          <p role="alert" className="text-danger text-sm">
            {submitError}
          </p>
        )}

        <FormActions onCancel={() => router.push("/admin/brands")} isSubmitting={isSubmitting} />
      </form>
    </div>
  );
}
