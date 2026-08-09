"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  BilingualTextareaField,
  BilingualTextField,
  FormActions,
  ImageUploadField,
  SelectField,
  TagsInput,
  TextField,
  ToggleField,
} from "@/components/admin/form";

const demoSchema = z.object({
  slug: z.string().min(1, "Slug is required"),
  nameEn: z.string().min(1, "English name is required"),
  nameFa: z.string().min(1, "Persian name is required"),
  category: z.string().min(1, "Category is required"),
  tags: z.array(z.string()).min(1, "Add at least one tag"),
  shortDescriptionEn: z.string().min(1, "English description is required"),
  shortDescriptionFa: z.string().min(1, "Persian description is required"),
  image: z.custom<File | string | null>((v) => !!v, "Image is required"),
  isActive: z.boolean(),
});

type DemoValues = z.infer<typeof demoSchema>;

const categoryOptions = [
  { label: "Engine Oil", value: "ENGINE_OIL" },
  { label: "Oil Filter", value: "OIL_FILTER" },
  { label: "Air Filter", value: "AIR_FILTER" },
];

export function FormFieldsDemo() {
  const [submitted, setSubmitted] = useState<DemoValues | null>(null);

  const { control, handleSubmit, reset, formState } = useForm<DemoValues>({
    resolver: zodResolver(demoSchema),
    defaultValues: {
      slug: "",
      nameEn: "",
      nameFa: "",
      category: "",
      tags: [],
      shortDescriptionEn: "",
      shortDescriptionFa: "",
      image: null,
      isActive: true,
    },
  });

  const onSubmit = (data: DemoValues) => {
    setSubmitted(data);
  };

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <form className="flex flex-col gap-6" noValidate onSubmit={handleSubmit(onSubmit)}>
        <TextField control={control} name="slug" label="Slug" isRequired />

        <BilingualTextField
          control={control}
          nameEn="nameEn"
          nameFa="nameFa"
          label="Name"
          isRequired
        />

        <SelectField
          control={control}
          name="category"
          label="Category"
          options={categoryOptions}
          placeholder="Select a category"
          isRequired
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

        <ImageUploadField control={control} name="image" label="Image" />

        <ToggleField control={control} name="isActive" label="Active" />

        <FormActions onCancel={() => reset()} isSubmitting={formState.isSubmitting} />
      </form>

      {submitted && (
        <div className="rounded-field bg-field flex flex-col gap-2 border p-4 text-sm">
          <p className="font-medium">Submitted values:</p>
          <pre className="overflow-x-auto text-xs">
            {JSON.stringify(
              submitted,
              (key, val) => (val instanceof File ? `File(${val.name})` : val),
              2,
            )}
          </pre>
        </div>
      )}
    </div>
  );
}
