"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertDialog, Button, Checkbox, CheckboxGroup, Chip, Label } from "@heroui/react";
import {
  BilingualTextareaField,
  FormActions,
  TextField,
  TextareaField,
} from "@/components/admin/form";
import { API_SERVICE_CATEGORIES } from "@/lib/validation";
import { VISCOSITY_ERROR, VISCOSITY_PATTERN } from "@/lib/validation/product";
import { CloseIcon } from "@/components/admin/icons";
import { ItemFormModal, type CategoryOption, type FitmentProfileItem } from "../ItemFormModal";
import { AttachEnginesModal } from "../AttachEnginesModal";

const CLIMATE_LABELS: Record<string, string> = {
  STANDARD: "Standard",
  HOT: "Hot",
  COLD: "Cold",
};

// "5W-30 · SN · 4000 ml" — enough to tell two spec-matched items apart in the
// list. Shown alongside the product rather than instead of it: an item may
// carry both, and the spec is what answers once the product is deactivated.
function formatMatchSpec(matchSpec: Record<string, unknown> | null): string | null {
  if (!matchSpec) return null;

  const parts = [
    typeof matchSpec.viscosity === "string" ? matchSpec.viscosity : null,
    typeof matchSpec.apiGrade === "string" ? matchSpec.apiGrade : null,
    typeof matchSpec.volumeMl === "number" ? `${matchSpec.volumeMl} ml` : null,
  ].filter((part): part is string => part !== null);

  return parts.length > 0 ? parts.join(" · ") : null;
}

// Capacity is stored in millilitres (matching Product.volumeMl) and entered in
// litres, which is the unit on the bottle and in the workshop. One decimal is
// all the source ever states — "حدود 3.5 لیتر".
const litresField = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || /^\d{1,2}(\.\d)?$/.test(value),
    'Enter litres, like "4" or "3.5"',
  );

function mlToLitres(ml: number | null): string {
  return ml === null ? "" : String(Number((ml / 1000).toFixed(1)));
}

function litresToMl(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return Math.round(Number(trimmed) * 1000);
}

// The grades are typed, not picked from a list: SAE keeps adding them (0W-8 and
// 0W-16 are both in this catalog already) and a fixed dropdown would be wrong
// within a year. Validated against the same pattern the product form uses.
const viscosityField = z
  .string()
  .trim()
  .refine((value) => value === "" || VISCOSITY_PATTERN.test(value.toUpperCase()), VISCOSITY_ERROR);

const profileFormSchema = z
  .object({
    label: z.string().min(1, "Label is required").max(200),
    internalNote: z.string().max(2000),
    oilViscosityStandard: viscosityField,
    oilViscosityHot: viscosityField,
    oilViscosityCold: viscosityField,
    oilApiGrades: z.array(z.string()),
    // Litres, because that is what the bottle and the workshop say. Converted
    // to the millilitres the column stores on submit.
    oilCapacityNoFilterL: litresField,
    oilCapacityWithFilterL: litresField,
    oilGuideEn: z.string().max(2000),
    oilGuideFa: z.string().max(2000),
  })
  // Mirrors the server rules so the admin is told before the round trip. The
  // source contradicts itself both ways — see the schema comment.
  .superRefine((data, ctx) => {
    for (const key of ["oilViscosityCold", "oilViscosityHot"] as const) {
      const value = data[key].trim().toUpperCase();
      if (value !== "" && value === data.oilViscosityStandard.trim().toUpperCase()) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "Same as the all-season grade — leave it empty unless this car really differs.",
        });
      }
    }

    const without = Number(data.oilCapacityNoFilterL.trim());
    const withFilter = Number(data.oilCapacityWithFilterL.trim());
    if (
      data.oilCapacityNoFilterL.trim() !== "" &&
      data.oilCapacityWithFilterL.trim() !== "" &&
      withFilter <= without
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["oilCapacityWithFilterL"],
        message: "Must be more than the figure without a filter change — the filter holds oil too.",
      });
    }
  });

type ProfileFormValues = z.infer<typeof profileFormSchema>;

const emptyDefaults: ProfileFormValues = {
  label: "",
  internalNote: "",
  oilViscosityStandard: "",
  oilViscosityHot: "",
  oilViscosityCold: "",
  oilApiGrades: [],
  oilCapacityNoFilterL: "",
  oilCapacityWithFilterL: "",
  oilGuideEn: "",
  oilGuideFa: "",
};

interface CarEngineLink {
  id: string;
  carEngine: {
    id: string;
    labelEn: string;
    yearStart: number;
    yearEnd: number | null;
    carModel: { id: string; nameEn: string; carBrand: { id: string; nameEn: string } };
  };
}

interface FitmentProfileDetail {
  id: string;
  label: string;
  internalNote: string | null;
  oilViscosityStandard: string | null;
  oilViscosityHot: string | null;
  oilViscosityCold: string | null;
  oilApiGrades: string[];
  oilCapacityNoFilterMl: number | null;
  oilCapacityWithFilterMl: number | null;
  oilGuideEn: string | null;
  oilGuideFa: string | null;
  items: FitmentProfileItem[];
  carEngineLinks: CarEngineLink[];
}

export default function FitmentProfileFormPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const segment = params.id;
  const isEdit = segment !== "add";
  const profileId = isEdit ? segment : null;

  const [profile, setProfile] = useState<FitmentProfileDetail | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [isLoading, setIsLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FitmentProfileItem | null>(null);
  const [deleteItemTarget, setDeleteItemTarget] = useState<FitmentProfileItem | null>(null);
  const [isDeletingItem, setIsDeletingItem] = useState(false);
  const [deleteItemError, setDeleteItemError] = useState<string | null>(null);

  const [attachModalOpen, setAttachModalOpen] = useState(false);
  const [detachTarget, setDetachTarget] = useState<CarEngineLink | null>(null);
  const [isDetaching, setIsDetaching] = useState(false);
  const [detachError, setDetachError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: emptyDefaults,
  });

  useEffect(() => {
    let ignore = false;

    async function loadCategoryOptions() {
      const response = await fetch("/api/admin/categories?status=ACTIVE&pageSize=100");
      const result = await response.json();
      if (ignore) return;
      if (result.success) setCategoryOptions(result.data.categories);
    }

    void loadCategoryOptions();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!isEdit || !profileId) return;
    let ignore = false;

    async function loadProfile() {
      setIsLoading(true);
      setLoadError(null);

      const response = await fetch(`/api/admin/fitment-profiles/${profileId}`);
      const result = await response.json();
      if (ignore) return;

      if (!result.success) {
        setLoadError(result.error ?? "Failed to load fitment profile");
        setIsLoading(false);
        return;
      }

      const fitmentProfile = result.data.fitmentProfile;
      setProfile(fitmentProfile);
      reset({
        label: fitmentProfile.label,
        internalNote: fitmentProfile.internalNote ?? "",
        oilViscosityStandard: fitmentProfile.oilViscosityStandard ?? "",
        oilViscosityHot: fitmentProfile.oilViscosityHot ?? "",
        oilViscosityCold: fitmentProfile.oilViscosityCold ?? "",
        oilApiGrades: fitmentProfile.oilApiGrades ?? [],
        oilCapacityNoFilterL: mlToLitres(fitmentProfile.oilCapacityNoFilterMl),
        oilCapacityWithFilterL: mlToLitres(fitmentProfile.oilCapacityWithFilterMl),
        oilGuideEn: fitmentProfile.oilGuideEn ?? "",
        oilGuideFa: fitmentProfile.oilGuideFa ?? "",
      });
      setIsLoading(false);
    }

    void loadProfile();
    return () => {
      ignore = true;
    };
  }, [isEdit, profileId, reset, reloadKey]);

  const onSubmit = async (values: ProfileFormValues) => {
    setSubmitError(null);

    // An empty box means "not stated for this car", which is a fact worth
    // storing — so it is sent as null rather than dropped from the payload.
    const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

    const payload = {
      label: values.label,
      internalNote: orNull(values.internalNote),
      oilViscosityStandard: orNull(values.oilViscosityStandard),
      oilViscosityHot: orNull(values.oilViscosityHot),
      oilViscosityCold: orNull(values.oilViscosityCold),
      oilApiGrades: values.oilApiGrades,
      oilCapacityNoFilterMl: litresToMl(values.oilCapacityNoFilterL),
      oilCapacityWithFilterMl: litresToMl(values.oilCapacityWithFilterL),
      oilGuideEn: orNull(values.oilGuideEn),
      oilGuideFa: orNull(values.oilGuideFa),
    };

    const response = await fetch(
      isEdit ? `/api/admin/fitment-profiles/${profileId}` : "/api/admin/fitment-profiles",
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const result = await response.json();

    if (!result.success) {
      setSubmitError(result.error ?? "Failed to save fitment profile");
      return;
    }

    if (isEdit) {
      setReloadKey((key) => key + 1);
    } else {
      router.push(`/admin/cars/fitment-profiles/${result.data.fitmentProfile.id}`);
    }
  };

  const handleDeleteItem = async () => {
    if (!deleteItemTarget || !profileId) return;
    setIsDeletingItem(true);
    setDeleteItemError(null);

    const response = await fetch(
      `/api/admin/fitment-profiles/${profileId}/items/${deleteItemTarget.id}`,
      { method: "DELETE" },
    );
    const result = await response.json();
    setIsDeletingItem(false);

    if (!result.success) {
      setDeleteItemError(result.error ?? "Failed to delete item");
      return;
    }

    setDeleteItemTarget(null);
    setReloadKey((key) => key + 1);
  };

  const handleDetach = async () => {
    if (!detachTarget || !profileId) return;
    setIsDetaching(true);
    setDetachError(null);

    const response = await fetch(
      `/api/admin/fitment-profiles/${profileId}/attach/${detachTarget.carEngine.id}`,
      { method: "DELETE" },
    );
    const result = await response.json();
    setIsDetaching(false);

    if (!result.success) {
      setDetachError(result.error ?? "Failed to detach engine");
      return;
    }

    setDetachTarget(null);
    setReloadKey((key) => key + 1);
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
    <div className="flex flex-col gap-8 p-8">
      <nav className="flex items-center gap-2 text-sm text-neutral-500">
        <Link href="/admin/cars/fitment-profiles" className="hover:text-neutral-700">
          Fitment Profiles
        </Link>
        {isEdit && (
          <>
            <span>/</span>
            <span className="text-neutral-700">{profile?.label ?? "…"}</span>
          </>
        )}
      </nav>

      <h1 className="text-lg font-semibold text-neutral-900">
        {isEdit ? "Edit Fitment Profile" : "Add Fitment Profile"}
      </h1>

      <form className="flex max-w-2xl flex-col gap-6" noValidate onSubmit={handleSubmit(onSubmit)}>
        <TextField control={control} name="label" label="Label" isRequired />

        <TextareaField
          control={control}
          name="internalNote"
          label="Internal Note"
          placeholder="Internal note — not shown to customers"
        />

        {/* The block a customer reads above the products on the found-car card.
            Separated by a rule because everything above it is admin-only and
            everything in it is published. */}
        <section className="flex flex-col gap-5 border-t border-neutral-200 pt-6">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">Engine Oil Guidance</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Shown to customers on the car card. Leave a field empty when this car&rsquo;s figure
              isn&rsquo;t known — empty is honest, a guess is not.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              control={control}
              name="oilViscosityStandard"
              label="Viscosity — all seasons"
              placeholder="5W-30"
            />
            <TextField
              control={control}
              name="oilViscosityCold"
              label="Viscosity — very cold"
              placeholder="0W-30"
            />
            <TextField
              control={control}
              name="oilViscosityHot"
              label="Viscosity — very hot"
              placeholder="5W-40"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              control={control}
              name="oilCapacityWithFilterL"
              label="Oil capacity with a new filter (litres)"
              placeholder="3.5"
            />
            <TextField
              control={control}
              name="oilCapacityNoFilterL"
              label="Oil capacity without changing the filter (litres)"
              placeholder="3.2"
            />
          </div>

          <Controller
            control={control}
            name="oilApiGrades"
            render={({ field }) => (
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium text-neutral-700">
                  API standards accepted
                </Label>
                <CheckboxGroup
                  className="flex flex-row flex-wrap gap-4"
                  value={field.value}
                  onChange={field.onChange}
                >
                  {API_SERVICE_CATEGORIES.map((grade) => (
                    <Checkbox key={grade} value={grade}>
                      {grade}
                    </Checkbox>
                  ))}
                </CheckboxGroup>
                <p className="text-xs text-neutral-500">
                  Stops at SP: that is the newest published API category. The imported notes list
                  SQ, which does not exist, alongside SJ/SL/SM, which are decades out of date.
                </p>
              </div>
            )}
          />

          <BilingualTextareaField
            control={control}
            nameEn="oilGuideEn"
            nameFa="oilGuideFa"
            label="Guidance note"
            rows={4}
            placeholderEn="For a healthy, low-mileage engine a full-synthetic 5W-30 is the best choice…"
            placeholderFa="برای خودروهای سالم و کم‌کارکرد، روغن فول‌سنتتیک بهترین انتخاب است…"
          />
        </section>

        {submitError && (
          <p role="alert" className="text-danger text-sm">
            {submitError}
          </p>
        )}

        <FormActions
          onCancel={() => router.push("/admin/cars/fitment-profiles")}
          isSubmitting={isSubmitting}
        />
      </form>

      {isEdit && profile && profileId && (
        <>
          <section className="flex max-w-3xl flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-neutral-900">Items</h2>
              <Button
                size="sm"
                onPress={() => {
                  setEditingItem(null);
                  setItemModalOpen(true);
                }}
              >
                + Add Item
              </Button>
            </div>

            {profile.items.length === 0 ? (
              <p className="text-sm text-neutral-500">No items yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {profile.items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-field bg-field flex flex-wrap items-center justify-between gap-3 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm font-medium text-neutral-900">
                        {item.category.nameEn}
                      </span>
                      <Chip size="sm" variant="soft">
                        <Chip.Label>{CLIMATE_LABELS[item.climate]}</Chip.Label>
                      </Chip>
                      <span className="text-sm text-neutral-700">
                        {item.product
                          ? item.product.nameEn
                          : (formatMatchSpec(item.matchSpec) ?? item.specNote ?? "Spec only")}
                      </span>
                      {item.product && formatMatchSpec(item.matchSpec) && (
                        <span className="text-xs text-neutral-500">
                          Spec {formatMatchSpec(item.matchSpec)}
                        </span>
                      )}
                      <span className="text-xs text-neutral-500">Priority {item.priority}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onPress={() => {
                          setEditingItem(item);
                          setItemModalOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onPress={() => {
                          setDeleteItemError(null);
                          setDeleteItemTarget(item);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="flex max-w-3xl flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-neutral-900">Linked Car Engines</h2>
              <Button size="sm" onPress={() => setAttachModalOpen(true)}>
                Attach Engines
              </Button>
            </div>

            {profile.carEngineLinks.length === 0 ? (
              <p className="text-sm text-neutral-500">Not attached to any car engines yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {profile.carEngineLinks.map((link) => (
                  <Chip key={link.id} size="sm" variant="soft">
                    <Chip.Label>
                      {link.carEngine.carModel.carBrand.nameEn} {link.carEngine.carModel.nameEn}{" "}
                      {link.carEngine.labelEn} ({link.carEngine.yearStart}–
                      {link.carEngine.yearEnd ?? "Present"})
                    </Chip.Label>
                    <button
                      type="button"
                      aria-label={`Detach ${link.carEngine.labelEn}`}
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
          </section>

          <ItemFormModal
            isOpen={itemModalOpen}
            onClose={() => setItemModalOpen(false)}
            profileId={profileId}
            item={editingItem}
            categoryOptions={categoryOptions}
            onSaved={() => setReloadKey((key) => key + 1)}
          />

          <AttachEnginesModal
            isOpen={attachModalOpen}
            onClose={() => setAttachModalOpen(false)}
            profileId={profileId}
            onAttached={() => setReloadKey((key) => key + 1)}
          />
        </>
      )}

      <AlertDialog
        isOpen={deleteItemTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteItemTarget(null);
        }}
      >
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog>
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger" />
                <AlertDialog.Heading>Delete item</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>
                  Are you sure you want to delete this item for &ldquo;
                  {deleteItemTarget?.category.nameEn}&rdquo;? This action cannot be undone.
                </p>
                {deleteItemError && (
                  <p role="alert" className="text-danger mt-2 text-sm">
                    {deleteItemError}
                  </p>
                )}
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button
                  variant="outline"
                  onPress={() => setDeleteItemTarget(null)}
                  isDisabled={isDeletingItem}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onPress={() => void handleDeleteItem()}
                  isDisabled={isDeletingItem}
                >
                  {isDeletingItem ? "Deleting..." : "Delete"}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>

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
                <AlertDialog.Heading>Detach car engine</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>
                  Detach &ldquo;{detachTarget?.carEngine.labelEn}&rdquo; from this fitment profile?
                </p>
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
                  onPress={() => void handleDetach()}
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
