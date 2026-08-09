"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Modal } from "@heroui/react";
import { TextField } from "@/components/admin/form";

const stockEditSchema = z.object({
  addStock: z
    .string()
    .min(1, "Add Stock is required")
    .refine(
      (v) => Number.isInteger(Number(v)) && Number(v) > 0,
      "Add Stock must be a positive whole number",
    ),
});

type StockEditValues = z.infer<typeof stockEditSchema>;

export interface StockEditProduct {
  id: string;
  nameEn: string;
  stock: number;
}

export interface StockEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: StockEditProduct | null;
  onSaved: () => void;
}

export function StockEditModal({ isOpen, onClose, product, onSaved }: StockEditModalProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { isSubmitting },
  } = useForm<StockEditValues>({
    resolver: zodResolver(stockEditSchema),
    defaultValues: { addStock: "" },
  });

  const addStock = watch("addStock");
  const addStockNumber = Number(addStock);
  const newTotal =
    product && Number.isFinite(addStockNumber) && addStockNumber > 0
      ? product.stock + addStockNumber
      : product?.stock;

  useEffect(() => {
    if (!isOpen) return;
    setSubmitError(null);
    reset({ addStock: "" });
  }, [isOpen, reset]);

  const onSubmit = async (values: StockEditValues) => {
    if (!product) return;
    setSubmitError(null);

    const response = await fetch(`/api/admin/inventory/${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addStock: Number(values.addStock) }),
    });
    const result = await response.json();

    if (!result.success) {
      setSubmitError(result.error ?? "Failed to update stock");
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
        <Modal.Container size="md">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>Edit Stock</Modal.Heading>
            </Modal.Header>
            <form noValidate onSubmit={handleSubmit(onSubmit)}>
              <Modal.Body>
                <div className="flex flex-col gap-6">
                  <div>
                    <p className="text-sm text-neutral-500">Product</p>
                    <p className="text-sm font-medium text-neutral-900">{product?.nameEn}</p>
                  </div>

                  <div>
                    <p className="text-sm text-neutral-500">Current Stock</p>
                    <p className="text-sm font-medium text-neutral-900">{product?.stock}</p>
                  </div>

                  <TextField
                    control={control}
                    name="addStock"
                    label="Add Stock"
                    type="number"
                    isRequired
                  />

                  <div>
                    <p className="text-sm text-neutral-500">New Total</p>
                    <p className="text-sm font-medium text-neutral-900">{newTotal}</p>
                  </div>

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
