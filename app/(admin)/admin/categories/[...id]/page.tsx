"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Disclosure } from "@heroui/react";
import {
  BilingualTextField,
  BilingualTextareaField,
  FormActions,
  ImageUploadField,
  SelectField,
  TagsInput,
  TextField,
  ToggleField,
} from "@/components/admin/form";
import { slugify } from "@/lib/slug";

const PART_TYPE_OPTIONS = [
  { label: "Engine Oil", value: "ENGINE_OIL" },
  { label: "Filter", value: "FILTER" },
  { label: "Accessory", value: "ACCESSORY" },
  { label: "Other", value: "OTHER" },
];

const FILTER_KIND_OPTIONS = [
  { label: "Oil Filter", value: "OIL_FILTER" },
  { label: "Air Filter", value: "AIR_FILTER" },
  { label: "Cabin Filter", value: "CABIN_FILTER" },
  { label: "Fuel Filter", value: "FUEL_FILTER" },
];

const categoryFormSchema = z
  .object({
    slug: z.string().min(1, "Slug is required"),
    nameEn: z.string().min(1, "English name is required").max(200),
    nameFa: z.string().min(1, "Persian name is required").max(200),
    partType: z.string().min(1, "Part type is required"),
    filterKind: z.string(),
    tags: z.array(z.string()),
    isActive: z.boolean(),
    shortDescriptionEn: z.string().min(1, "English short description is required").max(500),
    shortDescriptionFa: z.string().min(1, "Persian short description is required").max(500),
    longDescriptionEn: z.string().min(1, "English long description is required").max(5000),
    longDescriptionFa: z.string().min(1, "Persian long description is required").max(5000),
    metaTitleEn: z.string().max(70),
    metaTitleFa: z.string().max(70),
    metaDescriptionEn: z.string().max(160),
    metaDescriptionFa: z.string().max(160),
    image: z.custom<File | string | null>(),
  })
  .superRefine((data, ctx) => {
    if (data.partType === "FILTER" && !data.filterKind) {
      ctx.addIssue({
        code: "custom",
        path: ["filterKind"],
        message: "Filter kind is required when part type is Filter",
      });
    }
  });

type CategoryFormValues = z.infer<typeof categoryFormSchema>;

const emptyDefaults: CategoryFormValues = {
  slug: "",
  nameEn: "",
  nameFa: "",
  partType: "",
  filterKind: "",
  tags: [],
  isActive: true,
  shortDescriptionEn: "",
  shortDescriptionFa: "",
  longDescriptionEn: "",
  longDescriptionFa: "",
  metaTitleEn: "",
  metaTitleFa: "",
  metaDescriptionEn: "",
  metaDescriptionFa: "",
  image: null,
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

export default function CategoryFormPage() {
  const router = useRouter();
  const params = useParams<{ id?: string[] }>();
  const segment = params.id?.[0];
  const isEdit = !!segment && segment !== "add";
  const categoryId = isEdit ? segment : null;

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
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: emptyDefaults,
  });

  const nameEn = watch("nameEn");
  const partType = watch("partType");

  useEffect(() => {
    if (!isEdit || !categoryId) return;
    let ignore = false;

    async function loadCategory() {
      setIsLoading(true);
      setLoadError(null);

      const response = await fetch(`/api/admin/categories/${categoryId}`);
      const result = await response.json();
      if (ignore) return;

      if (!result.success) {
        setLoadError(result.error ?? "Failed to load category");
        setIsLoading(false);
        return;
      }

      const category = result.data.category;
      reset({
        slug: category.slug,
        nameEn: category.nameEn,
        nameFa: category.nameFa,
        partType: category.partType,
        filterKind: category.filterKind ?? "",
        tags: category.tags,
        isActive: category.status === "ACTIVE",
        shortDescriptionEn: category.shortDescriptionEn,
        shortDescriptionFa: category.shortDescriptionFa,
        longDescriptionEn: category.longDescriptionEn,
        longDescriptionFa: category.longDescriptionFa,
        metaTitleEn: category.metaTitleEn ?? "",
        metaTitleFa: category.metaTitleFa ?? "",
        metaDescriptionEn: category.metaDescriptionEn ?? "",
        metaDescriptionFa: category.metaDescriptionFa ?? "",
        image: category.image,
      });
      setIsLoading(false);
    }

    void loadCategory();
    return () => {
      ignore = true;
    };
  }, [isEdit, categoryId, reset]);

  // Slug auto-fills from the English name only while creating and only
  // until the user edits it directly — never on edit, so an existing
  // category's slug isn't silently regenerated when its name changes.
  useEffect(() => {
    if (isEdit || dirtyFields.slug) return;
    setValue("slug", slugify(nameEn));
  }, [nameEn, isEdit, dirtyFields.slug, setValue]);

  useEffect(() => {
    if (partType !== "FILTER") {
      setValue("filterKind", "");
    }
  }, [partType, setValue]);

  const onSubmit = async (values: CategoryFormValues) => {
    setSubmitError(null);

    let imageUrl: string | undefined;
    if (values.image instanceof File) {
      try {
        imageUrl = await uploadImage(values.image);
      } catch (error) {
        setSubmitError(error instanceof Error ? error.message : "Failed to upload image");
        return;
      }
    } else {
      imageUrl = values.image ?? undefined;
    }

    const payload = {
      slug: values.slug,
      nameEn: values.nameEn,
      nameFa: values.nameFa,
      partType: values.partType,
      filterKind: values.partType === "FILTER" ? values.filterKind : undefined,
      tags: values.tags,
      status: values.isActive ? "ACTIVE" : "INACTIVE",
      shortDescriptionEn: values.shortDescriptionEn,
      shortDescriptionFa: values.shortDescriptionFa,
      longDescriptionEn: values.longDescriptionEn,
      longDescriptionFa: values.longDescriptionFa,
      metaTitleEn: values.metaTitleEn || undefined,
      metaTitleFa: values.metaTitleFa || undefined,
      metaDescriptionEn: values.metaDescriptionEn || undefined,
      metaDescriptionFa: values.metaDescriptionFa || undefined,
      image: imageUrl,
    };

    const response = await fetch(
      isEdit ? `/api/admin/categories/${categoryId}` : "/api/admin/categories",
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const result = await response.json();

    if (!result.success) {
      setSubmitError(result.error ?? "Failed to save category");
      return;
    }

    router.push("/admin/categories");
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
        {isEdit ? "Edit Category" : "Add Category"}
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

        <SelectField
          control={control}
          name="partType"
          label="Part Type"
          options={PART_TYPE_OPTIONS}
          isRequired
        />

        {partType === "FILTER" && (
          <SelectField
            control={control}
            name="filterKind"
            label="Filter Kind"
            options={FILTER_KIND_OPTIONS}
            isRequired
          />
        )}

        <TagsInput control={control} name="tags" label="Tags" />

        <ToggleField control={control} name="isActive" label="Active" />

        <BilingualTextareaField
          control={control}
          nameEn="shortDescriptionEn"
          nameFa="shortDescriptionFa"
          label="Short Description"
          rows={3}
          isRequired
        />

        <BilingualTextareaField
          control={control}
          nameEn="longDescriptionEn"
          nameFa="longDescriptionFa"
          label="Long Description"
          rows={6}
          isRequired
        />

        <Disclosure>
          <Disclosure.Heading>
            <Disclosure.Trigger className="text-sm font-medium text-neutral-700">
              SEO
              <Disclosure.Indicator />
            </Disclosure.Trigger>
          </Disclosure.Heading>
          <Disclosure.Content>
            <Disclosure.Body className="flex flex-col gap-6 pt-4">
              <BilingualTextField
                control={control}
                nameEn="metaTitleEn"
                nameFa="metaTitleFa"
                label="Meta Title"
              />
              <BilingualTextareaField
                control={control}
                nameEn="metaDescriptionEn"
                nameFa="metaDescriptionFa"
                label="Meta Description"
                rows={2}
              />
            </Disclosure.Body>
          </Disclosure.Content>
        </Disclosure>

        <ImageUploadField control={control} name="image" label="Image" />

        {submitError && (
          <p role="alert" className="text-danger text-sm">
            {submitError}
          </p>
        )}

        <FormActions
          onCancel={() => router.push("/admin/categories")}
          isSubmitting={isSubmitting}
        />
      </form>
    </div>
  );
}
