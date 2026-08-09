"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Modal } from "@heroui/react";
import {
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

export interface CategoryOption {
  id: string;
  nameEn: string;
  partType: string;
}

export interface FitmentProfileItem {
  id: string;
  category: { id: string; nameEn: string; partType: string };
  climate: "STANDARD" | "HOT" | "COLD";
  product: { id: string; nameEn: string } | null;
  specNote: string | null;
  specAttributes: Record<string, unknown> | null;
  priority: number;
  adminNote: string | null;
}

const itemFormSchema = z
  .object({
    categoryId: z.string().min(1, "Category is required"),
    climate: z.string().min(1, "Climate is required"),
    productId: z.string(),
    specNote: z.string().max(2000),
    specAttributes: z.record(z.string(), z.string()).nullable(),
    priority: z
      .string()
      .min(1, "Priority is required")
      .refine((v) => Number.isInteger(Number(v)), "Priority must be a whole number"),
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

type ItemFormValues = z.infer<typeof itemFormSchema>;

const emptyDefaults: ItemFormValues = {
  categoryId: "",
  climate: "STANDARD",
  productId: "",
  specNote: "",
  specAttributes: null,
  priority: "0",
  adminNote: "",
};

export interface ItemFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  profileId: string;
  item: FitmentProfileItem | null;
  categoryOptions: CategoryOption[];
  onSaved: () => void;
}

export function ItemFormModal({
  isOpen,
  onClose,
  profileId,
  item,
  categoryOptions,
  onSaved,
}: ItemFormModalProps) {
  const isEdit = item !== null;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [productOption, setProductOption] = useState<ProductOption | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { isSubmitting },
  } = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
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
    if (!isOpen) return;
    setSubmitError(null);

    if (item) {
      reset({
        categoryId: item.category.id,
        climate: item.climate,
        productId: item.product?.id ?? "",
        specNote: item.specNote ?? "",
        specAttributes: (item.specAttributes as Record<string, string> | null) ?? null,
        priority: String(item.priority),
        adminNote: item.adminNote ?? "",
      });
      setProductOption(item.product ? { id: item.product.id, label: item.product.nameEn } : null);
    } else {
      reset(emptyDefaults);
      setProductOption(null);
    }
  }, [isOpen, item, reset]);

  const onSubmit = async (values: ItemFormValues) => {
    setSubmitError(null);

    const payload = {
      categoryId: values.categoryId,
      climate: values.climate,
      productId: values.productId || null,
      specNote: values.specNote.trim() ? values.specNote.trim() : null,
      specAttributes: values.specAttributes,
      priority: Number(values.priority),
      adminNote: values.adminNote.trim() ? values.adminNote.trim() : null,
    };

    const response = await fetch(
      isEdit
        ? `/api/admin/fitment-profiles/${profileId}/items/${item.id}`
        : `/api/admin/fitment-profiles/${profileId}/items`,
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const result = await response.json();

    if (!result.success) {
      setSubmitError(result.error ?? "Failed to save item");
      return;
    }

    onSaved();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Backdrop>
        <Modal.Container size="lg" scroll="inside">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>{isEdit ? "Edit Item" : "Add Item"}</Modal.Heading>
            </Modal.Header>
            <form noValidate onSubmit={handleSubmit(onSubmit)}>
              <Modal.Body>
                <div className="flex flex-col gap-6">
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

                  <TextField
                    control={control}
                    name="priority"
                    label="Priority"
                    type="number"
                    isRequired
                  />

                  <TextareaField
                    control={control}
                    name="adminNote"
                    label="Admin Note"
                    placeholder="Internal note — not shown to customers"
                  />

                  {!productId && (
                    <p className="text-xs text-neutral-500">
                      No product selected — the Spec Note above is shown to customers when no exact
                      product match exists yet.
                    </p>
                  )}

                  {submitError && (
                    <p role="alert" className="text-danger text-sm">
                      {submitError}
                    </p>
                  )}
                </div>
              </Modal.Body>
              <Modal.Footer>
                <Button type="button" variant="outline" onPress={onClose} isDisabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" isDisabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : "Save"}
                </Button>
              </Modal.Footer>
            </form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
