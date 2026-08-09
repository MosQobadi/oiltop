"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@heroui/react";
import { StatusPill } from "@/components/admin/DataTable";
import { SelectField, TextareaField } from "@/components/admin/form";

type InquiryStatus = "NEW" | "CONTACTED" | "RESOLVED";

interface InquiryDetail {
  id: string;
  customerName: string;
  phone: string;
  email: string | null;
  message: string | null;
  carEngine: { id: string; label: string | null } | null;
  category: { id: string; nameEn: string } | null;
  status: InquiryStatus;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_LABELS: Record<InquiryStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  RESOLVED: "Resolved",
};

const STATUS_OPTIONS = [
  { label: "New", value: "NEW" },
  { label: "Contacted", value: "CONTACTED" },
  { label: "Resolved", value: "RESOLVED" },
];

const formSchema = z.object({
  status: z.enum(["NEW", "CONTACTED", "RESOLVED"]),
  adminNote: z.string().max(2000),
});

type FormValues = z.infer<typeof formSchema>;

export default function InquiryDetailPage() {
  const params = useParams<{ id: string }>();
  const inquiryId = params.id;

  const [inquiry, setInquiry] = useState<InquiryDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting: isSaving },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { status: "NEW", adminNote: "" },
  });

  useEffect(() => {
    let ignore = false;

    async function loadInquiry() {
      setIsLoading(true);
      setLoadError(null);

      const response = await fetch(`/api/admin/fitment-inquiries/${inquiryId}`);
      const result = await response.json();
      if (ignore) return;

      if (!result.success) {
        setLoadError(result.error ?? "Failed to load inquiry");
        setIsLoading(false);
        return;
      }

      setInquiry(result.data.inquiry);
      reset({
        status: result.data.inquiry.status,
        adminNote: result.data.inquiry.adminNote ?? "",
      });
      setIsLoading(false);
    }

    void loadInquiry();
    return () => {
      ignore = true;
    };
  }, [inquiryId, reset]);

  const onSave = async (values: FormValues) => {
    setSaveError(null);

    const response = await fetch(`/api/admin/fitment-inquiries/${inquiryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const result = await response.json();

    if (!result.success) {
      setSaveError(result.error ?? "Failed to save changes");
      return;
    }

    setInquiry((prev) =>
      prev ? { ...prev, status: values.status, adminNote: values.adminNote } : prev,
    );
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <p className="text-sm text-neutral-500">Loading...</p>
      </div>
    );
  }

  if (loadError || !inquiry) {
    return (
      <div className="p-8">
        <p role="alert" className="text-sm text-danger">
          {loadError ?? "Inquiry not found"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 p-8">
      <nav className="flex items-center gap-2 text-sm text-neutral-500">
        <Link href="/admin/inquiries" className="hover:text-neutral-700">
          Inquiries
        </Link>
        <span>/</span>
        <span className="text-neutral-700">{inquiry.customerName}</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">{inquiry.customerName}</h1>
          <p className="text-sm text-neutral-500">
            Submitted on {new Date(inquiry.createdAt).toLocaleDateString()}
          </p>
        </div>
        <StatusPill value={STATUS_LABELS[inquiry.status]} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-neutral-900">{inquiry.customerName}</span>
            <span className="text-neutral-500">{inquiry.phone}</span>
            {inquiry.email && <span className="text-neutral-500">{inquiry.email}</span>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Car & Category</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-500">Car</span>
              <span className="text-neutral-900">{inquiry.carEngine?.label ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Category</span>
              <span className="text-neutral-900">{inquiry.category?.nameEn ?? "—"}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Message</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm text-neutral-700">
            {inquiry.message ?? "No message provided."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status & Admin Note</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit(onSave)}>
            <SelectField control={control} name="status" label="Status" options={STATUS_OPTIONS} />
            <TextareaField control={control} name="adminNote" label="Admin Note" rows={4} />

            {saveError && (
              <p role="alert" className="text-sm text-danger">
                {saveError}
              </p>
            )}

            <div className="flex justify-end">
              <Button type="submit" isDisabled={isSaving}>
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
