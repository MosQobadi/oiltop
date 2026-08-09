"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Disclosure } from "@heroui/react";
import { slugify } from "@/lib/slug";
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

interface Option {
  id: string;
  nameEn: string;
}

const productFormSchema = z.object({
  sku: z.string().min(1, "SKU is required").max(64),
  slug: z.string().min(1, "Slug is required"),
  nameEn: z.string().min(1, "English name is required").max(200),
  nameFa: z.string().min(1, "Persian name is required").max(200),
  categoryId: z.string().min(1, "Category is required"),
  brandId: z.string().min(1, "Brand is required"),
  oemPartNumbers: z.array(z.string()),
  tags: z.array(z.string()),
  shortDescriptionEn: z
    .string()
    .min(1, "English short description is required")
    .max(500),
  shortDescriptionFa: z
    .string()
    .min(1, "Persian short description is required")
    .max(500),
  longDescriptionEn: z
    .string()
    .min(1, "English long description is required")
    .max(5000),
  longDescriptionFa: z
    .string()
    .min(1, "Persian long description is required")
    .max(5000),
  price: z
    .string()
    .min(1, "Price is required")
    .refine(
      (value) => !Number.isNaN(Number(value)) && Number(value) >= 0,
      "Price must be 0 or more",
    ),
  discountPercent: z
    .string()
    .min(1, "Discount is required")
    .refine((value) => {
      const number = Number(value);
      return Number.isInteger(number) && number >= 0 && number <= 100;
    }, "Discount must be a whole number between 0 and 100"),
  metaTitleEn: z.string().max(70),
  metaTitleFa: z.string().max(70),
  metaDescriptionEn: z.string().max(160),
  metaDescriptionFa: z.string().max(160),
  image: z.custom<File | string | null>(),
  isActive: z.boolean(),
});

type ProductFormValues = z.infer<typeof productFormSchema>;

const emptyDefaults: ProductFormValues = {
  sku: "",
  slug: "",
  nameEn: "",
  nameFa: "",
  categoryId: "",
  brandId: "",
  oemPartNumbers: [],
  tags: [],
  shortDescriptionEn: "",
  shortDescriptionFa: "",
  longDescriptionEn: "",
  longDescriptionFa: "",
  price: "0",
  discountPercent: "0",
  metaTitleEn: "",
  metaTitleFa: "",
  metaDescriptionEn: "",
  metaDescriptionFa: "",
  image: null,
  isActive: true,
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

export default function ProductFormPage() {
  const router = useRouter();
  const params = useParams<{ id?: string[] }>();
  const segment = params.id?.[0];
  const isEdit = !!segment && segment !== "add";
  const productId = isEdit ? segment : null;

  const [isLoading, setIsLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [stock, setStock] = useState<number | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<Option[]>([]);
  const [brandOptions, setBrandOptions] = useState<Option[]>([]);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { isSubmitting, dirtyFields },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: emptyDefaults,
  });

  const nameEn = watch("nameEn");
  const price = watch("price");
  const discountPercent = watch("discountPercent");

  // Same rule as the Category form: auto-fill from the English name while
  // creating and only until the user edits it directly — never on edit, so a
  // live product URL isn't silently changed by a rename.
  useEffect(() => {
    if (isEdit || dirtyFields.slug) return;
    setValue("slug", slugify(nameEn));
  }, [nameEn, isEdit, dirtyFields.slug, setValue]);
  const finalPrice = useMemo(() => {
    const priceNumber = Number(price) || 0;
    const discountNumber = Number(discountPercent) || 0;
    return priceNumber * (1 - discountNumber / 100);
  }, [price, discountPercent]);

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
    if (!isEdit || !productId) return;
    let ignore = false;

    async function loadProduct() {
      setIsLoading(true);
      setLoadError(null);

      const response = await fetch(`/api/admin/products/${productId}`);
      const result = await response.json();
      if (ignore) return;

      if (!result.success) {
        setLoadError(result.error ?? "Failed to load product");
        setIsLoading(false);
        return;
      }

      const product = result.data.product;
      reset({
        sku: product.sku,
        slug: product.slug,
        nameEn: product.nameEn,
        nameFa: product.nameFa,
        categoryId: product.category.id,
        brandId: product.brand.id,
        oemPartNumbers: product.oemPartNumbers,
        tags: product.tags,
        shortDescriptionEn: product.shortDescriptionEn,
        shortDescriptionFa: product.shortDescriptionFa,
        longDescriptionEn: product.longDescriptionEn,
        longDescriptionFa: product.longDescriptionFa,
        price: String(product.price),
        discountPercent: String(product.discountPercent),
        metaTitleEn: product.metaTitleEn ?? "",
        metaTitleFa: product.metaTitleFa ?? "",
        metaDescriptionEn: product.metaDescriptionEn ?? "",
        metaDescriptionFa: product.metaDescriptionFa ?? "",
        image: product.image,
        isActive: product.status === "ACTIVE",
      });
      setStock(product.stock);
      setIsLoading(false);
    }

    void loadProduct();
    return () => {
      ignore = true;
    };
  }, [isEdit, productId, reset]);

  const onSubmit = async (values: ProductFormValues) => {
    setSubmitError(null);

    let imageUrl: string | undefined;
    if (values.image instanceof File) {
      try {
        imageUrl = await uploadImage(values.image);
      } catch (error) {
        setSubmitError(
          error instanceof Error ? error.message : "Failed to upload image",
        );
        return;
      }
    } else {
      imageUrl = values.image ?? undefined;
    }

    const payload = {
      sku: values.sku,
      slug: values.slug,
      nameEn: values.nameEn,
      nameFa: values.nameFa,
      categoryId: values.categoryId,
      brandId: values.brandId,
      oemPartNumbers: values.oemPartNumbers,
      tags: values.tags,
      shortDescriptionEn: values.shortDescriptionEn,
      shortDescriptionFa: values.shortDescriptionFa,
      longDescriptionEn: values.longDescriptionEn,
      longDescriptionFa: values.longDescriptionFa,
      price: Number(values.price),
      discountPercent: Number(values.discountPercent),
      metaTitleEn: values.metaTitleEn || undefined,
      metaTitleFa: values.metaTitleFa || undefined,
      metaDescriptionEn: values.metaDescriptionEn || undefined,
      metaDescriptionFa: values.metaDescriptionFa || undefined,
      image: imageUrl,
      status: values.isActive ? "ACTIVE" : "INACTIVE",
    };

    const response = await fetch(
      isEdit ? `/api/admin/products/${productId}` : "/api/admin/products",
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const result = await response.json();

    if (!result.success) {
      setSubmitError(result.error ?? "Failed to save product");
      return;
    }

    router.push("/admin/products");
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
        <p role="alert" className="text-sm text-danger">
          {loadError}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-8">
      <h1 className="text-lg font-semibold text-neutral-900">
        {isEdit ? "Edit Product" : "Add Product"}
      </h1>

      <form
        className="flex max-w-2xl flex-col gap-6"
        noValidate
        onSubmit={handleSubmit(onSubmit)}
      >
        <BilingualTextField
          control={control}
          nameEn="nameEn"
          nameFa="nameFa"
          label="Name"
          isRequired
        />

        <TextField control={control} name="sku" label="SKU" isRequired />

        <TextField control={control} name="slug" label="Slug" isRequired />

        <SelectField
          control={control}
          name="categoryId"
          label="Category"
          options={categoryOptions.map((c) => ({ label: c.nameEn, value: c.id }))}
          isRequired
        />

        <SelectField
          control={control}
          name="brandId"
          label="Brand"
          options={brandOptions.map((b) => ({ label: b.nameEn, value: b.id }))}
          isRequired
        />

        <TagsInput
          control={control}
          name="oemPartNumbers"
          label="OEM Part Numbers"
        />

        <TagsInput control={control} name="tags" label="Tags" />

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

        <div className="flex flex-col gap-6 sm:flex-row">
          <TextField
            control={control}
            name="price"
            label="Price"
            type="number"
            isRequired
            className="flex-1"
          />
          <TextField
            control={control}
            name="discountPercent"
            label="Discount %"
            type="number"
            isRequired
            className="flex-1"
          />
        </div>

        <div className="flex flex-col gap-1 rounded-field bg-field p-4">
          <span className="text-sm font-medium text-neutral-700">
            Final Price
          </span>
          <span className="text-lg font-semibold text-neutral-900">
            {finalPrice.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}
          </span>
        </div>

        <p className="text-sm text-neutral-500">
          Stock{isEdit && stock !== null ? `: ${stock}` : ""} is managed from
          the Inventory screen, not here.
        </p>

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

        <ImageUploadField control={control} name="image" label="Product Image" />

        <ToggleField control={control} name="isActive" label="Active" />

        {submitError && (
          <p role="alert" className="text-sm text-danger">
            {submitError}
          </p>
        )}

        <FormActions
          onCancel={() => router.push("/admin/products")}
          isSubmitting={isSubmitting}
        />
      </form>
    </div>
  );
}
