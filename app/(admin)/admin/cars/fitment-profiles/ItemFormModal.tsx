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
import { VISCOSITY_ERROR, VISCOSITY_PATTERN } from "@/lib/validation";

const CLIMATE_OPTIONS = [
  { label: "Standard", value: "STANDARD" },
  { label: "Hot", value: "HOT" },
  { label: "Cold", value: "COLD" },
];

const SPEC_PREVIEW_DEBOUNCE_MS = 300;

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
  matchSpec: Record<string, unknown> | null;
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
    // Held as three flat strings rather than a nested object: they're three text
    // boxes, and an empty box is the only way to say "don't constrain on this".
    // Assembled into the `matchSpec` payload by `toMatchSpec` on submit.
    matchViscosity: z
      .string()
      .max(20)
      .refine(
        (value) => value.trim() === "" || VISCOSITY_PATTERN.test(value.trim().toUpperCase()),
        { message: VISCOSITY_ERROR },
      ),
    matchApiGrade: z.string().max(20),
    matchVolumeMl: z.string().refine((value) => {
      if (value.trim() === "") return true;
      const number = Number(value);
      return Number.isInteger(number) && number > 0;
    }, "Volume must be a positive whole number of millilitres"),
    priority: z
      .string()
      .min(1, "Priority is required")
      .refine((v) => Number.isInteger(Number(v)), "Priority must be a whole number"),
    adminNote: z.string().max(2000),
  })
  .superRefine((data, ctx) => {
    if (!data.productId && !data.specNote.trim() && !toMatchSpec(data)) {
      ctx.addIssue({
        code: "custom",
        path: ["specNote"],
        message: "Select a product, match by spec, or enter a spec note",
      });
    }
  });

type ItemFormValues = z.infer<typeof itemFormSchema>;

interface MatchSpec {
  viscosity?: string;
  apiGrade?: string;
  volumeMl?: number;
}

type MatchSpecFields = Pick<ItemFormValues, "matchViscosity" | "matchApiGrade" | "matchVolumeMl">;

// The three boxes as a spec, or null when none of them says anything. One
// definition, used for the live count and for the saved payload, so the count
// an admin is shown is a count of exactly what they are about to save.
function toMatchSpec(values: MatchSpecFields): MatchSpec | null {
  const viscosity = values.matchViscosity.trim();
  const apiGrade = values.matchApiGrade.trim();
  const volumeMl = values.matchVolumeMl.trim();

  const spec: MatchSpec = {
    ...(viscosity && { viscosity }),
    ...(apiGrade && { apiGrade }),
    ...(volumeMl && { volumeMl: Number(volumeMl) }),
  };

  return Object.keys(spec).length > 0 ? spec : null;
}

// The stored column is free-form Json, so read it defensively rather than
// trusting its shape — same reasoning as parseMatchSpec in lib/services/fitment.ts.
function fromMatchSpec(matchSpec: Record<string, unknown> | null): MatchSpecFields {
  const spec = matchSpec ?? {};

  return {
    matchViscosity: typeof spec.viscosity === "string" ? spec.viscosity : "",
    matchApiGrade: typeof spec.apiGrade === "string" ? spec.apiGrade : "",
    matchVolumeMl: typeof spec.volumeMl === "number" ? String(spec.volumeMl) : "",
  };
}

interface SpecPreview {
  total: number;
  products: { id: string; nameEn: string }[];
}

const emptyDefaults: ItemFormValues = {
  categoryId: "",
  climate: "STANDARD",
  productId: "",
  specNote: "",
  specAttributes: null,
  matchViscosity: "",
  matchApiGrade: "",
  matchVolumeMl: "",
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
  const [specPreview, setSpecPreview] = useState<SpecPreview | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

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
  const matchViscosity = watch("matchViscosity");
  const matchApiGrade = watch("matchApiGrade");
  const matchVolumeMl = watch("matchVolumeMl");
  const selectedPartType = categoryOptions.find((c) => c.id === categoryId)?.partType;
  const isOilCategory = selectedPartType === "ENGINE_OIL";
  const isClimateLocked = !!categoryId && !isOilCategory;
  const hasMatchSpec = toMatchSpec({ matchViscosity, matchApiGrade, matchVolumeMl }) !== null;

  // A non-oil category can carry neither a non-standard climate nor a spec —
  // both are rules the API enforces, mirrored here so the form can't submit
  // something it already knows will be rejected.
  useEffect(() => {
    if (!isClimateLocked) return;
    setValue("climate", "STANDARD");
    setValue("matchViscosity", "");
    setValue("matchApiGrade", "");
    setValue("matchVolumeMl", "");
  }, [isClimateLocked, setValue]);

  useEffect(() => {
    if (!isOpen) return;
    setSubmitError(null);
    setSpecPreview(null);

    if (item) {
      reset({
        categoryId: item.category.id,
        climate: item.climate,
        productId: item.product?.id ?? "",
        specNote: item.specNote ?? "",
        specAttributes: (item.specAttributes as Record<string, string> | null) ?? null,
        ...fromMatchSpec(item.matchSpec),
        priority: String(item.priority),
        adminNote: item.adminNote ?? "",
      });
      setProductOption(item.product ? { id: item.product.id, label: item.product.nameEn } : null);
    } else {
      reset(emptyDefaults);
      setProductOption(null);
    }
  }, [isOpen, item, reset]);

  // The point of the readout: an admin has to be able to see that "5W-30 / SN"
  // means something in this catalog before saving it as a recommendation.
  useEffect(() => {
    const spec = toMatchSpec({ matchViscosity, matchApiGrade, matchVolumeMl });
    if (!categoryId || !isOilCategory || !spec) {
      setSpecPreview(null);
      setIsPreviewLoading(false);
      return;
    }

    const params = new URLSearchParams({ categoryId });
    if (spec.viscosity) params.set("viscosity", spec.viscosity);
    if (spec.apiGrade) params.set("apiGrade", spec.apiGrade);
    if (spec.volumeMl !== undefined) params.set("volumeMl", String(spec.volumeMl));

    let ignore = false;
    setIsPreviewLoading(true);

    async function loadPreview() {
      const response = await fetch(`/api/admin/fitment-profiles/spec-matches?${params.toString()}`);
      const result = await response.json();
      if (ignore) return;

      // A half-typed viscosity comes back 400. That isn't worth surfacing here —
      // the field's own validation already says what's wrong — so the readout
      // just stays quiet until the spec parses.
      setSpecPreview(result.success ? result.data : null);
      setIsPreviewLoading(false);
    }

    // Debounced for the same reason ProductSelectField debounces its search:
    // this fires on every keystroke across three boxes.
    const timer = setTimeout(() => void loadPreview(), SPEC_PREVIEW_DEBOUNCE_MS);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [categoryId, isOilCategory, matchViscosity, matchApiGrade, matchVolumeMl]);

  const onSubmit = async (values: ItemFormValues) => {
    setSubmitError(null);

    const payload = {
      categoryId: values.categoryId,
      climate: values.climate,
      productId: values.productId || null,
      specNote: values.specNote.trim() ? values.specNote.trim() : null,
      specAttributes: values.specAttributes,
      matchSpec: toMatchSpec(values),
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

                  {/* The third way an item can answer, beside a linked product
                      and a spec-only note: a query against the catalog's spec
                      columns, so the recommendation outlives the one product it
                      was first written against. */}
                  <section className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-sm font-medium text-neutral-700">Match by Spec</h3>
                      <p className="text-xs text-neutral-500">
                        Recommends whichever active products currently match. A linked product above
                        still wins; this answers when there isn&rsquo;t one.
                      </p>
                    </div>

                    {isOilCategory ? (
                      <>
                        <div className="flex flex-col gap-6 sm:flex-row">
                          <TextField
                            control={control}
                            name="matchViscosity"
                            label="Viscosity"
                            placeholder="5W-30"
                            dir="ltr"
                            className="flex-1"
                          />
                          <TextField
                            control={control}
                            name="matchApiGrade"
                            label="API Grade"
                            placeholder="SN"
                            dir="ltr"
                            className="flex-1"
                          />
                          <TextField
                            control={control}
                            name="matchVolumeMl"
                            label="Volume (ml)"
                            type="number"
                            placeholder="4000"
                            className="flex-1"
                          />
                        </div>

                        <p aria-live="polite" className="text-xs text-neutral-500">
                          {isPreviewLoading
                            ? "Checking the catalog…"
                            : specPreview === null
                              ? ""
                              : specPreview.total === 0
                                ? "Nothing in the catalog matches this spec yet — customers see the spec note below until something does."
                                : `Matches ${specPreview.total} active ${
                                    specPreview.total === 1 ? "product" : "products"
                                  }: ${specPreview.products
                                    .map((product) => product.nameEn)
                                    .join(", ")}${
                                    specPreview.total > specPreview.products.length
                                      ? `, +${specPreview.total - specPreview.products.length} more`
                                      : ""
                                  }`}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-neutral-500">
                        Available on Engine Oil categories only.
                      </p>
                    )}
                  </section>

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

                  {!productId && !hasMatchSpec && (
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
