"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertDialog, Button, Chip } from "@heroui/react";
import { FormActions, TextField, TextareaField } from "@/components/admin/form";
import { CloseIcon } from "@/components/admin/icons";
import {
  ItemFormModal,
  type CategoryOption,
  type FitmentProfileItem,
} from "../ItemFormModal";
import { AttachEnginesModal } from "../AttachEnginesModal";

const CLIMATE_LABELS: Record<string, string> = {
  STANDARD: "Standard",
  HOT: "Hot",
  COLD: "Cold",
};

const profileFormSchema = z.object({
  label: z.string().min(1, "Label is required").max(200),
  internalNote: z.string().max(2000),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

const emptyDefaults: ProfileFormValues = { label: "", internalNote: "" };

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
  const [deleteItemTarget, setDeleteItemTarget] = useState<FitmentProfileItem | null>(
    null,
  );
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

    const payload = {
      label: values.label,
      internalNote: values.internalNote.trim() ? values.internalNote.trim() : null,
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
        <p role="alert" className="text-sm text-danger">
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

      <form
        className="flex max-w-2xl flex-col gap-6"
        noValidate
        onSubmit={handleSubmit(onSubmit)}
      >
        <TextField control={control} name="label" label="Label" isRequired />

        <TextareaField
          control={control}
          name="internalNote"
          label="Internal Note"
          placeholder="Internal note — not shown to customers"
        />

        {submitError && (
          <p role="alert" className="text-sm text-danger">
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
                    className="flex flex-wrap items-center justify-between gap-3 rounded-field bg-field p-3"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm font-medium text-neutral-900">
                        {item.category.nameEn}
                      </span>
                      <Chip size="sm" variant="soft">
                        <Chip.Label>{CLIMATE_LABELS[item.climate]}</Chip.Label>
                      </Chip>
                      <span className="text-sm text-neutral-700">
                        {item.product ? item.product.nameEn : (item.specNote ?? "Spec only")}
                      </span>
                      <span className="text-xs text-neutral-500">
                        Priority {item.priority}
                      </span>
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
              <h2 className="text-base font-semibold text-neutral-900">
                Linked Car Engines
              </h2>
              <Button size="sm" onPress={() => setAttachModalOpen(true)}>
                Attach Engines
              </Button>
            </div>

            {profile.carEngineLinks.length === 0 ? (
              <p className="text-sm text-neutral-500">
                Not attached to any car engines yet.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {profile.carEngineLinks.map((link) => (
                  <Chip key={link.id} size="sm" variant="soft">
                    <Chip.Label>
                      {link.carEngine.carModel.carBrand.nameEn}{" "}
                      {link.carEngine.carModel.nameEn} {link.carEngine.labelEn} (
                      {link.carEngine.yearStart}–{link.carEngine.yearEnd ?? "Present"})
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
                  {deleteItemTarget?.category.nameEn}&rdquo;? This action cannot be
                  undone.
                </p>
                {deleteItemError && (
                  <p role="alert" className="mt-2 text-sm text-danger">
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
                  Detach &ldquo;{detachTarget?.carEngine.labelEn}&rdquo; from this
                  fitment profile?
                </p>
                {detachError && (
                  <p role="alert" className="mt-2 text-sm text-danger">
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
