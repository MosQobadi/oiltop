"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  BilingualTextField,
  FormActions,
  SelectField,
  TextField,
  ToggleField,
} from "@/components/admin/form";

const FUEL_TYPE_OPTIONS = [
  { label: "Petrol", value: "PETROL" },
  { label: "Diesel", value: "DIESEL" },
  { label: "Hybrid", value: "HYBRID" },
  { label: "Electric", value: "ELECTRIC" },
  { label: "LPG/CNG", value: "LPG_CNG" },
];

const YEAR_MIN = 1900;
const YEAR_MAX = 2100;

function isValidYear(value: string) {
  const year = Number(value);
  return Number.isInteger(year) && year >= YEAR_MIN && year <= YEAR_MAX;
}

const carEngineFormSchema = z
  .object({
    labelEn: z.string().min(1, "English label is required").max(100),
    labelFa: z.string().min(1, "Persian label is required").max(100),
    yearStart: z
      .string()
      .min(1, "Year start is required")
      .refine(isValidYear, `Enter a valid year between ${YEAR_MIN} and ${YEAR_MAX}`),
    stillInProduction: z.boolean(),
    yearEnd: z.string(),
    fuelType: z.string().min(1, "Fuel type is required"),
    displacementCc: z.string(),
    engineCode: z.string().max(50),
    isActive: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (!data.stillInProduction && data.yearEnd) {
      if (!isValidYear(data.yearEnd)) {
        ctx.addIssue({
          code: "custom",
          path: ["yearEnd"],
          message: `Enter a valid year between ${YEAR_MIN} and ${YEAR_MAX}`,
        });
      } else if (Number(data.yearEnd) < Number(data.yearStart)) {
        ctx.addIssue({
          code: "custom",
          path: ["yearEnd"],
          message: "Year end must be greater than or equal to year start",
        });
      }
    }

    if (data.displacementCc) {
      const cc = Number(data.displacementCc);
      if (!Number.isInteger(cc) || cc <= 0) {
        ctx.addIssue({
          code: "custom",
          path: ["displacementCc"],
          message: "Displacement must be a positive whole number",
        });
      }
    }
  });

type CarEngineFormValues = z.infer<typeof carEngineFormSchema>;

const emptyDefaults: CarEngineFormValues = {
  labelEn: "",
  labelFa: "",
  yearStart: "",
  stillInProduction: false,
  yearEnd: "",
  fuelType: "",
  displacementCc: "",
  engineCode: "",
  isActive: true,
};

export default function CarEngineFormPage() {
  const router = useRouter();
  const params = useParams<{
    carBrandId: string;
    carModelId: string;
    carEngineId: string;
  }>();
  const { carBrandId, carModelId } = params;
  const segment = params.carEngineId;
  const isEdit = segment !== "add";
  const carEngineId = isEdit ? segment : null;

  const [isLoading, setIsLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { isSubmitting },
  } = useForm<CarEngineFormValues>({
    resolver: zodResolver(carEngineFormSchema),
    defaultValues: emptyDefaults,
  });

  const stillInProduction = watch("stillInProduction");

  useEffect(() => {
    if (stillInProduction) setValue("yearEnd", "");
  }, [stillInProduction, setValue]);

  useEffect(() => {
    if (!isEdit || !carEngineId) return;
    let ignore = false;

    async function loadCarEngine() {
      setIsLoading(true);
      setLoadError(null);

      const response = await fetch(`/api/admin/car-engines/${carEngineId}`);
      const result = await response.json();
      if (ignore) return;

      if (!result.success) {
        setLoadError(result.error ?? "Failed to load car engine");
        setIsLoading(false);
        return;
      }

      const carEngine = result.data.carEngine;
      reset({
        labelEn: carEngine.labelEn,
        labelFa: carEngine.labelFa,
        yearStart: String(carEngine.yearStart),
        stillInProduction: carEngine.yearEnd == null,
        yearEnd: carEngine.yearEnd == null ? "" : String(carEngine.yearEnd),
        fuelType: carEngine.fuelType,
        displacementCc:
          carEngine.displacementCc == null ? "" : String(carEngine.displacementCc),
        engineCode: carEngine.engineCode ?? "",
        isActive: carEngine.status === "ACTIVE",
      });
      setIsLoading(false);
    }

    void loadCarEngine();
    return () => {
      ignore = true;
    };
  }, [isEdit, carEngineId, reset]);

  const onSubmit = async (values: CarEngineFormValues) => {
    setSubmitError(null);

    const payload = {
      ...(isEdit ? {} : { carModelId }),
      labelEn: values.labelEn,
      labelFa: values.labelFa,
      yearStart: Number(values.yearStart),
      yearEnd: values.stillInProduction
        ? null
        : values.yearEnd
          ? Number(values.yearEnd)
          : undefined,
      fuelType: values.fuelType,
      displacementCc: values.displacementCc ? Number(values.displacementCc) : undefined,
      engineCode: values.engineCode || undefined,
      status: values.isActive ? "ACTIVE" : "INACTIVE",
    };

    const response = await fetch(
      isEdit ? `/api/admin/car-engines/${carEngineId}` : "/api/admin/car-engines",
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const result = await response.json();

    if (!result.success) {
      setSubmitError(result.error ?? "Failed to save car engine");
      return;
    }

    router.push(`/admin/cars/brands/${carBrandId}/models/${carModelId}/engines`);
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
      </nav>

      <h1 className="text-lg font-semibold text-neutral-900">
        {isEdit ? "Edit Car Engine" : "Add Car Engine"}
      </h1>

      <form
        className="flex max-w-2xl flex-col gap-6"
        noValidate
        onSubmit={handleSubmit(onSubmit)}
      >
        <BilingualTextField
          control={control}
          nameEn="labelEn"
          nameFa="labelFa"
          label="Label"
          placeholderEn="2.5L I4 Petrol"
          isRequired
        />

        <div className="flex flex-col gap-6 sm:flex-row">
          <TextField
            control={control}
            name="yearStart"
            label="Year Start"
            type="number"
            isRequired
            className="flex-1"
          />
          {!stillInProduction && (
            <TextField
              control={control}
              name="yearEnd"
              label="Year End"
              type="number"
              className="flex-1"
            />
          )}
        </div>

        <ToggleField
          control={control}
          name="stillInProduction"
          label="Still in production (no end year)"
        />

        <SelectField
          control={control}
          name="fuelType"
          label="Fuel Type"
          options={FUEL_TYPE_OPTIONS}
          isRequired
        />

        <TextField
          control={control}
          name="displacementCc"
          label="Displacement (cc)"
          type="number"
        />

        <TextField control={control} name="engineCode" label="Engine Code" />

        <ToggleField control={control} name="isActive" label="Active" />

        {submitError && (
          <p role="alert" className="text-sm text-danger">
            {submitError}
          </p>
        )}

        <FormActions
          onCancel={() =>
            router.push(`/admin/cars/brands/${carBrandId}/models/${carModelId}/engines`)
          }
          isSubmitting={isSubmitting}
        />
      </form>
    </div>
  );
}
