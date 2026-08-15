"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertDialog, Button, Chip, ComboBox, Input, Label, ListBox } from "@heroui/react";
import {
  BilingualTextField,
  FormActions,
  ImageUploadField,
  SelectField,
  TextField,
  ToggleField,
} from "@/components/admin/form";
import { CloseIcon } from "@/components/admin/icons";

interface ProfileOption {
  id: string;
  label: string;
}

interface FitmentProfileLink {
  id: string;
  profile: { id: string; label: string; itemCount: number };
}

const PROFILE_SEARCH_DEBOUNCE_MS = 300;

function AttachExistingProfileControl({
  carEngineId,
  onAttached,
}: {
  carEngineId: string;
  onAttached: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileOption[]>([]);
  const [selected, setSelected] = useState<ProfileOption | null>(null);
  const [isAttaching, setIsAttaching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let ignore = false;

    async function search() {
      const searchParams = new URLSearchParams({ pageSize: "20" });
      if (query) searchParams.set("search", query);

      const response = await fetch(`/api/admin/fitment-profiles?${searchParams.toString()}`);
      const result = await response.json();
      if (ignore || !result.success) return;

      setResults(
        result.data.fitmentProfiles.map((profile: { id: string; label: string }) => ({
          id: profile.id,
          label: profile.label,
        })),
      );
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void search(), PROFILE_SEARCH_DEBOUNCE_MS);

    return () => {
      ignore = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handleAttach = async () => {
    if (!selected) return;
    setIsAttaching(true);
    setError(null);

    const response = await fetch(`/api/admin/fitment-profiles/${selected.id}/attach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ carEngineIds: [carEngineId] }),
    });
    const result = await response.json();
    setIsAttaching(false);

    if (!result.success) {
      setError(result.error ?? "Failed to attach profile");
      return;
    }

    setSelected(null);
    setQuery("");
    onAttached();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <ComboBox
          items={results}
          selectedKey={selected?.id ?? null}
          onSelectionChange={(key) => {
            if (key == null) {
              setSelected(null);
              return;
            }
            setSelected(results.find((r) => r.id === String(key)) ?? null);
          }}
          onInputChange={setQuery}
          allowsEmptyCollection
          fullWidth
          className="flex-1"
        >
          <Label>Attach Existing Profile</Label>
          <ComboBox.InputGroup>
            <Input placeholder="Search fitment profiles..." fullWidth />
            <ComboBox.Trigger />
          </ComboBox.InputGroup>
          <ComboBox.Popover>
            <ListBox
              items={results}
              renderEmptyState={() => (
                <div className="px-3 py-2 text-sm text-neutral-500">No fitment profiles found.</div>
              )}
            >
              {(item) => (
                <ListBox.Item id={item.id} textValue={item.label}>
                  {item.label}
                </ListBox.Item>
              )}
            </ListBox>
          </ComboBox.Popover>
        </ComboBox>
        <Button
          type="button"
          onPress={() => void handleAttach()}
          isDisabled={!selected || isAttaching}
        >
          {isAttaching ? "Attaching..." : "Attach"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

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
    image: z.custom<File | string | null>(),
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
  const [engineLabelEn, setEngineLabelEn] = useState("");
  const [fitmentProfileLinks, setFitmentProfileLinks] = useState<FitmentProfileLink[]>([]);
  const [fitmentReloadKey, setFitmentReloadKey] = useState(0);
  const [detachTarget, setDetachTarget] = useState<FitmentProfileLink | null>(null);
  const [isDetaching, setIsDetaching] = useState(false);
  const [detachError, setDetachError] = useState<string | null>(null);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [createProfileError, setCreateProfileError] = useState<string | null>(null);

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
        setLoadError(result.error ?? "Failed to load car type");
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
        displacementCc: carEngine.displacementCc == null ? "" : String(carEngine.displacementCc),
        engineCode: carEngine.engineCode ?? "",
        isActive: carEngine.status === "ACTIVE",
        image: carEngine.image ?? null,
      });
      setEngineLabelEn(carEngine.labelEn);
      setFitmentProfileLinks(carEngine.fitmentProfileLinks ?? []);
      setIsLoading(false);
    }

    void loadCarEngine();
    return () => {
      ignore = true;
    };
  }, [isEdit, carEngineId, reset, fitmentReloadKey]);

  const handleDetachProfile = async () => {
    if (!detachTarget || !carEngineId) return;
    setIsDetaching(true);
    setDetachError(null);

    const response = await fetch(
      `/api/admin/fitment-profiles/${detachTarget.profile.id}/attach/${carEngineId}`,
      { method: "DELETE" },
    );
    const result = await response.json();
    setIsDetaching(false);

    if (!result.success) {
      setDetachError(result.error ?? "Failed to detach fitment profile");
      return;
    }

    setDetachTarget(null);
    setFitmentReloadKey((key) => key + 1);
  };

  const handleCreateProfileForEngine = async () => {
    if (!carEngineId) return;
    setIsCreatingProfile(true);
    setCreateProfileError(null);

    const createResponse = await fetch("/api/admin/fitment-profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: `${engineLabelEn} Fitment` }),
    });
    const createResult = await createResponse.json();

    if (!createResult.success) {
      setIsCreatingProfile(false);
      setCreateProfileError(createResult.error ?? "Failed to create fitment profile");
      return;
    }

    const newProfileId = createResult.data.fitmentProfile.id;
    const attachResponse = await fetch(`/api/admin/fitment-profiles/${newProfileId}/attach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ carEngineIds: [carEngineId] }),
    });
    const attachResult = await attachResponse.json();
    setIsCreatingProfile(false);

    if (!attachResult.success) {
      setCreateProfileError(attachResult.error ?? "Failed to attach new fitment profile");
      return;
    }

    router.push(`/admin/cars/fitment-profiles/${newProfileId}`);
  };

  const onSubmit = async (values: CarEngineFormValues) => {
    setSubmitError(null);

    // null rather than undefined when the admin removed the photo: undefined
    // would leave the old one in place on a PATCH, so "Remove" would silently
    // do nothing. The Zod schema accepts null for exactly this.
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
      image: imageUrl,
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
      setSubmitError(result.error ?? "Failed to save car type");
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
        <span>/</span>
        <Link
          href={`/admin/cars/brands/${carBrandId}/models/${carModelId}/engines`}
          className="hover:text-neutral-700"
        >
          Types
        </Link>
      </nav>

      <h1 className="text-lg font-semibold text-neutral-900">
        {isEdit ? "Edit Car Type" : "Add Car Type"}
      </h1>

      <form className="flex max-w-2xl flex-col gap-6" noValidate onSubmit={handleSubmit(onSubmit)}>
        {/* This is what a customer picks at the last step of the car finder, so
            write it the way they name their own car — "Type 2 (TU3 1.4L)", not
            a bare engine code. Add a separate row whenever the recommended
            products differ: different trim, different engine, or different year
            period. */}
        <BilingualTextField
          control={control}
          nameEn="labelEn"
          nameFa="labelFa"
          label="Label"
          placeholderEn="Type 2 (TU3 1.4L)"
          isRequired
        />

        <div className="flex flex-col gap-1">
          <ImageUploadField control={control} name="image" label="Photo" />
          <p className="text-sm text-neutral-500">
            Optional — falls back to the model&rsquo;s photo when empty. Add one only where types
            actually look different (206 Type 2 vs Type 5, a 2015 facelift vs a 2025).
          </p>
        </div>

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
          <p role="alert" className="text-danger text-sm">
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

      {isEdit && carEngineId && (
        <section className="flex max-w-2xl flex-col gap-4 border-t border-neutral-200 pt-6">
          <h2 className="text-base font-semibold text-neutral-900">Fitment</h2>

          {fitmentProfileLinks.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No fitment profile attached to this type yet.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {fitmentProfileLinks.map((link) => (
                <Chip key={link.id} size="sm" variant="soft">
                  <Chip.Label>
                    <Link
                      href={`/admin/cars/fitment-profiles/${link.profile.id}`}
                      className="hover:underline"
                    >
                      {link.profile.label} ({link.profile.itemCount} item
                      {link.profile.itemCount === 1 ? "" : "s"})
                    </Link>
                  </Chip.Label>
                  <button
                    type="button"
                    aria-label={`Detach ${link.profile.label}`}
                    className="ml-1 inline-flex items-center hover:opacity-70"
                    onClick={() => {
                      setDetachError(null);
                      setDetachTarget(link);
                    }}
                  >
                    <CloseIcon className="size-3" />
                  </button>
                </Chip>
              ))}
            </div>
          )}

          <AttachExistingProfileControl
            carEngineId={carEngineId}
            onAttached={() => setFitmentReloadKey((key) => key + 1)}
          />

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              onPress={() => void handleCreateProfileForEngine()}
              isDisabled={isCreatingProfile}
              className="self-start"
            >
              {isCreatingProfile ? "Creating..." : "Create New Profile for This Type"}
            </Button>
            {createProfileError && (
              <p role="alert" className="text-danger text-sm">
                {createProfileError}
              </p>
            )}
          </div>
        </section>
      )}

      <AlertDialog
        isOpen={detachTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDetachTarget(null);
        }}
      >
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog>
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger" />
                <AlertDialog.Heading>Detach fitment profile</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>Detach &ldquo;{detachTarget?.profile.label}&rdquo; from this car type?</p>
                {detachError && (
                  <p role="alert" className="text-danger mt-2 text-sm">
                    {detachError}
                  </p>
                )}
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button
                  variant="outline"
                  onPress={() => setDetachTarget(null)}
                  isDisabled={isDetaching}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onPress={() => void handleDetachProfile()}
                  isDisabled={isDetaching}
                >
                  {isDetaching ? "Detaching..." : "Detach"}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  );
}
