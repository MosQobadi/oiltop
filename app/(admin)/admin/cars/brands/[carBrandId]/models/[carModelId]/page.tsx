"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
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
  TextField,
  ToggleField,
} from "@/components/admin/form";
import { slugify } from "@/lib/slug";

// Which calendar this model's type year spans are written in. Iranian-built
// cars are sold by Jalali model year and imported ones by Gregorian, and one
// brand carries both — so it is asked per model, and the example years are in
// the label because that is what makes the choice obvious at a glance.
const YEAR_CALENDAR_OPTIONS = [
  { label: "Jalali — e.g. 1390", value: "JALALI" },
  { label: "Gregorian — e.g. 2011", value: "GREGORIAN" },
];

const carModelFormSchema = z.object({
  slug: z.string().min(1, "Slug is required"),
  nameEn: z.string().min(1, "English name is required").max(200),
  nameFa: z.string().min(1, "Persian name is required").max(200),
  // A plain required string, matching how the engine form treats fuelType: the
  // empty default is what forces the admin to choose rather than inherit a
  // guess, and the API's Zod schema is what proves the value is a real one.
  yearCalendar: z.string().min(1, "Year calendar is required"),
  metaTitleEn: z.string().max(70),
  metaTitleFa: z.string().max(70),
  metaDescriptionEn: z.string().max(160),
  metaDescriptionFa: z.string().max(160),
  isActive: z.boolean(),
  image: z.custom<File | string | null>(),
});

type CarModelFormValues = z.infer<typeof carModelFormSchema>;

const emptyDefaults: CarModelFormValues = {
  slug: "",
  nameEn: "",
  nameFa: "",
  yearCalendar: "",
  metaTitleEn: "",
  metaTitleFa: "",
  metaDescriptionEn: "",
  metaDescriptionFa: "",
  isActive: true,
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

export default function CarModelFormPage() {
  const router = useRouter();
  const params = useParams<{ carBrandId: string; carModelId: string }>();
  const carBrandId = params.carBrandId;
  const segment = params.carModelId;
  const isEdit = segment !== "add";
  const carModelId = isEdit ? segment : null;

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
  } = useForm<CarModelFormValues>({
    resolver: zodResolver(carModelFormSchema),
    defaultValues: emptyDefaults,
  });

  const nameEn = watch("nameEn");

  useEffect(() => {
    if (!isEdit || !carModelId) return;
    let ignore = false;

    async function loadCarModel() {
      setIsLoading(true);
      setLoadError(null);

      const response = await fetch(`/api/admin/car-models/${carModelId}`);
      const result = await response.json();
      if (ignore) return;

      if (!result.success) {
        setLoadError(result.error ?? "Failed to load car model");
        setIsLoading(false);
        return;
      }

      const carModel = result.data.carModel;
      reset({
        slug: carModel.slug,
        nameEn: carModel.nameEn,
        nameFa: carModel.nameFa,
        yearCalendar: carModel.yearCalendar,
        metaTitleEn: carModel.metaTitleEn ?? "",
        metaTitleFa: carModel.metaTitleFa ?? "",
        metaDescriptionEn: carModel.metaDescriptionEn ?? "",
        metaDescriptionFa: carModel.metaDescriptionFa ?? "",
        isActive: carModel.status === "ACTIVE",
        image: carModel.image,
      });
      setIsLoading(false);
    }

    void loadCarModel();
    return () => {
      ignore = true;
    };
  }, [isEdit, carModelId, reset]);

  // Slug auto-fills from the English name only while creating and only
  // until the user edits it directly — never on edit, so an existing
  // car model's slug isn't silently regenerated when its name changes.
  useEffect(() => {
    if (isEdit || dirtyFields.slug) return;
    setValue("slug", slugify(nameEn));
  }, [nameEn, isEdit, dirtyFields.slug, setValue]);

  const onSubmit = async (values: CarModelFormValues) => {
    setSubmitError(null);

    // null, not undefined, when the admin removed the photo: undefined is
    // dropped from the JSON body, so a PATCH would leave the old image in place
    // and "Remove" would clear the preview but not the record.
    let imageUrl: string | null;
    if (values.image instanceof File) {
      try {
        imageUrl = await uploadImage(values.image);
      } catch (error) {
        setSubmitError(error instanceof Error ? error.message : "Failed to upload image");
        return;
      }
    } else {
      imageUrl = values.image ?? null;
    }

    const payload = {
      ...(isEdit ? {} : { carBrandId }),
      slug: values.slug,
      nameEn: values.nameEn,
      nameFa: values.nameFa,
      yearCalendar: values.yearCalendar,
      status: values.isActive ? "ACTIVE" : "INACTIVE",
      metaTitleEn: values.metaTitleEn || undefined,
      metaTitleFa: values.metaTitleFa || undefined,
      metaDescriptionEn: values.metaDescriptionEn || undefined,
      metaDescriptionFa: values.metaDescriptionFa || undefined,
      image: imageUrl,
    };

    const response = await fetch(
      isEdit ? `/api/admin/car-models/${carModelId}` : "/api/admin/car-models",
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const result = await response.json();

    if (!result.success) {
      setSubmitError(result.error ?? "Failed to save car model");
      return;
    }

    router.push(`/admin/cars/brands/${carBrandId}/models`);
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
      <nav className="flex items-center gap-2 text-sm text-neutral-500">
        <Link href="/admin/cars/brands" className="hover:text-neutral-700">
          Car Brands
        </Link>
        <span>/</span>
        <Link href={`/admin/cars/brands/${carBrandId}/models`} className="hover:text-neutral-700">
          Models
        </Link>
      </nav>

      <h1 className="text-lg font-semibold text-neutral-900">
        {isEdit ? "Edit Car Model" : "Add Car Model"}
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
          name="yearCalendar"
          label="Year calendar"
          options={YEAR_CALENDAR_OPTIONS}
          isRequired
        />

        <ImageUploadField control={control} name="image" label="Image" />

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

        <ToggleField control={control} name="isActive" label="Active" />

        {submitError && (
          <p role="alert" className="text-danger text-sm">
            {submitError}
          </p>
        )}

        <FormActions
          onCancel={() => router.push(`/admin/cars/brands/${carBrandId}/models`)}
          isSubmitting={isSubmitting}
        />
      </form>
    </div>
  );
}
