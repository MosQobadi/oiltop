"use client";

import { Button } from "@heroui/react";

export interface FormActionsProps {
  onCancel: () => void;
  isSubmitting?: boolean;
  saveLabel?: string;
  cancelLabel?: string;
}

export function FormActions({
  onCancel,
  isSubmitting,
  saveLabel = "Save",
  cancelLabel = "Cancel",
}: FormActionsProps) {
  return (
    <div className="flex items-center justify-end gap-3">
      <Button type="button" variant="outline" onPress={onCancel} isDisabled={isSubmitting}>
        {cancelLabel}
      </Button>
      <Button type="submit" isDisabled={isSubmitting}>
        {isSubmitting ? "Saving..." : saveLabel}
      </Button>
    </div>
  );
}
