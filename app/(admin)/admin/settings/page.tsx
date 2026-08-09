"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Tabs } from "@heroui/react";
import {
  FormActions,
  KeyValueField,
  SelectField,
  TextField,
  TextareaField,
  ToggleField,
} from "@/components/admin/form";
import {
  LOCALES,
  PAYMENT_METHODS,
  SETTINGS_KEYS,
  generalSettingsSchema,
  seoSettingsSchema,
  type GeneralSettingsInput,
  type SeoSettingsInput,
} from "@/lib/validation";
import type { SettingsData } from "@/server/setting";

type TabKey = "general" | "seo" | "localization" | "shipping" | "payment";

const TABS: { key: TabKey; label: string }[] = [
  { key: "general", label: "General" },
  { key: "seo", label: "SEO" },
  { key: "localization", label: "Localization" },
  { key: "shipping", label: "Shipping" },
  { key: "payment", label: "Payment" },
];

async function patchSettings(body: Record<string, string>): Promise<SettingsData> {
  const response = await fetch("/api/admin/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error ?? "Failed to save settings");
  }
  return result.data as SettingsData;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadSettings() {
      setIsLoading(true);
      setLoadError(null);

      const response = await fetch("/api/admin/settings");
      const result = await response.json();
      if (ignore) return;

      if (!result.success) {
        setLoadError(result.error ?? "Failed to load settings");
        setIsLoading(false);
        return;
      }

      setSettings(result.data);
      setIsLoading(false);
    }

    void loadSettings();
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6 p-8">
      <h1 className="text-lg font-semibold text-neutral-900">Settings</h1>

      {isLoading && <p className="text-sm text-neutral-500">Loading...</p>}
      {loadError && (
        <p role="alert" className="text-danger text-sm">
          {loadError}
        </p>
      )}

      {settings && (
        <Tabs selectedKey={activeTab} onSelectionChange={(key) => setActiveTab(key as TabKey)}>
          <Tabs.ListContainer>
            <Tabs.List aria-label="Settings sections">
              {TABS.map((tab) => (
                <Tabs.Tab key={tab.key} id={tab.key}>
                  {tab.label}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>

          <Tabs.Panel id="general">
            <GeneralTab initial={settings.general} onSaved={(data) => setSettings(data)} />
          </Tabs.Panel>
          <Tabs.Panel id="seo">
            <SeoTab initial={settings.seo} onSaved={(data) => setSettings(data)} />
          </Tabs.Panel>
          <Tabs.Panel id="localization">
            <LocalizationTab
              initial={settings.localization}
              onSaved={(data) => setSettings(data)}
            />
          </Tabs.Panel>
          <Tabs.Panel id="shipping">
            <ShippingTab initial={settings.shipping} onSaved={(data) => setSettings(data)} />
          </Tabs.Panel>
          <Tabs.Panel id="payment">
            <PaymentTab initial={settings.payment} onSaved={(data) => setSettings(data)} />
          </Tabs.Panel>
        </Tabs>
      )}
    </div>
  );
}

function GeneralTab({
  initial,
  onSaved,
}: {
  initial: SettingsData["general"];
  onSaved: (data: SettingsData) => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<GeneralSettingsInput>({
    resolver: zodResolver(generalSettingsSchema),
    values: initial,
  });

  const onSubmit = async (values: GeneralSettingsInput) => {
    setSubmitError(null);
    try {
      const data = await patchSettings({
        [SETTINGS_KEYS.general.storeName]: values.storeName,
        [SETTINGS_KEYS.general.supportEmail]: values.supportEmail,
        [SETTINGS_KEYS.general.supportPhone]: values.supportPhone,
        [SETTINGS_KEYS.general.socialLinks]: JSON.stringify(values.socialLinks ?? {}),
      });
      onSaved(data);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to save settings");
    }
  };

  return (
    <form
      className="flex max-w-2xl flex-col gap-6 pt-6"
      noValidate
      onSubmit={handleSubmit(onSubmit)}
    >
      <TextField control={control} name="storeName" label="Store Name" isRequired />
      <TextField
        control={control}
        name="supportEmail"
        label="Support Email"
        type="email"
        isRequired
      />
      <TextField control={control} name="supportPhone" label="Support Phone" isRequired />
      <KeyValueField control={control} name="socialLinks" label="Social Links" />

      {submitError && (
        <p role="alert" className="text-danger text-sm">
          {submitError}
        </p>
      )}

      <FormActions
        onCancel={() => reset(initial)}
        cancelLabel="Reset"
        isSubmitting={isSubmitting}
        saveLabel="Save Changes"
      />
    </form>
  );
}

function SeoTab({
  initial,
  onSaved,
}: {
  initial: SettingsData["seo"];
  onSaved: (data: SettingsData) => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<SeoSettingsInput>({
    resolver: zodResolver(seoSettingsSchema),
    values: initial,
  });

  const onSubmit = async (values: SeoSettingsInput) => {
    setSubmitError(null);
    try {
      const data = await patchSettings({
        [SETTINGS_KEYS.seo.metaTitleTemplate]: values.metaTitleTemplate,
        [SETTINGS_KEYS.seo.metaDescription]: values.metaDescription,
        [SETTINGS_KEYS.seo.googleSearchConsoleCode]: values.googleSearchConsoleCode,
        [SETTINGS_KEYS.seo.sitemapEnabled]: String(values.sitemapEnabled),
      });
      onSaved(data);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to save settings");
    }
  };

  return (
    <form
      className="flex max-w-2xl flex-col gap-6 pt-6"
      noValidate
      onSubmit={handleSubmit(onSubmit)}
    >
      <TextField
        control={control}
        name="metaTitleTemplate"
        label="Default Meta Title Template"
        placeholder="%s | Top Oil"
      />
      <TextareaField control={control} name="metaDescription" label="Default Meta Description" />
      <TextField
        control={control}
        name="googleSearchConsoleCode"
        label="Google Search Console Verification Code"
      />
      <ToggleField control={control} name="sitemapEnabled" label="Sitemap Enabled" />

      {submitError && (
        <p role="alert" className="text-danger text-sm">
          {submitError}
        </p>
      )}

      <FormActions
        onCancel={() => reset(initial)}
        cancelLabel="Reset"
        isSubmitting={isSubmitting}
        saveLabel="Save Changes"
      />
    </form>
  );
}

const localeOptions = LOCALES.map((locale) => ({ label: locale, value: locale }));

const localizationFormSchema = z
  .object({
    defaultLocale: z.enum(LOCALES),
    supportedLocaleEN: z.boolean(),
    supportedLocaleFA: z.boolean(),
  })
  .refine((v) => v.supportedLocaleEN || v.supportedLocaleFA, {
    message: "At least one locale must be supported",
    path: ["supportedLocaleEN"],
  });
type LocalizationFormValues = z.infer<typeof localizationFormSchema>;

function LocalizationTab({
  initial,
  onSaved,
}: {
  initial: SettingsData["localization"];
  onSaved: (data: SettingsData) => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const formValues: LocalizationFormValues = {
    defaultLocale: initial.defaultLocale,
    supportedLocaleEN: initial.supportedLocales.includes("EN"),
    supportedLocaleFA: initial.supportedLocales.includes("FA"),
  };
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<LocalizationFormValues>({
    resolver: zodResolver(localizationFormSchema),
    values: formValues,
  });

  const onSubmit = async (values: LocalizationFormValues) => {
    setSubmitError(null);
    const supportedLocales = [
      ...(values.supportedLocaleEN ? ["EN"] : []),
      ...(values.supportedLocaleFA ? ["FA"] : []),
    ];
    try {
      const data = await patchSettings({
        [SETTINGS_KEYS.localization.defaultLocale]: values.defaultLocale,
        [SETTINGS_KEYS.localization.supportedLocales]: JSON.stringify(supportedLocales),
      });
      onSaved(data);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to save settings");
    }
  };

  return (
    <form
      className="flex max-w-2xl flex-col gap-6 pt-6"
      noValidate
      onSubmit={handleSubmit(onSubmit)}
    >
      <SelectField
        control={control}
        name="defaultLocale"
        label="Default Locale"
        options={localeOptions}
        isRequired
      />

      <div className="flex flex-col gap-2">
        <ToggleField control={control} name="supportedLocaleEN" label="English (EN)" />
        <ToggleField control={control} name="supportedLocaleFA" label="Persian (FA)" />
      </div>

      <p className="text-sm text-neutral-500">FA renders right-to-left (RTL) in the storefront.</p>

      {submitError && (
        <p role="alert" className="text-danger text-sm">
          {submitError}
        </p>
      )}

      <FormActions
        onCancel={() => reset(formValues)}
        cancelLabel="Reset"
        isSubmitting={isSubmitting}
        saveLabel="Save Changes"
      />
    </form>
  );
}

const shippingFormSchema = z.object({
  flatRateFee: z
    .string()
    .min(1, "Flat rate fee is required")
    .refine((value) => !Number.isNaN(Number(value)) && Number(value) >= 0, "Must be 0 or greater"),
  freeShippingThreshold: z
    .string()
    .min(1, "Free shipping threshold is required")
    .refine((value) => !Number.isNaN(Number(value)) && Number(value) >= 0, "Must be 0 or greater"),
});
type ShippingFormValues = z.infer<typeof shippingFormSchema>;

function ShippingTab({
  initial,
  onSaved,
}: {
  initial: SettingsData["shipping"];
  onSaved: (data: SettingsData) => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const formValues: ShippingFormValues = {
    flatRateFee: String(initial.flatRateFee),
    freeShippingThreshold: String(initial.freeShippingThreshold),
  };
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<ShippingFormValues>({
    resolver: zodResolver(shippingFormSchema),
    values: formValues,
  });

  const onSubmit = async (values: ShippingFormValues) => {
    setSubmitError(null);
    try {
      const data = await patchSettings({
        [SETTINGS_KEYS.shipping.flatRateFee]: values.flatRateFee,
        [SETTINGS_KEYS.shipping.freeShippingThreshold]: values.freeShippingThreshold,
      });
      onSaved(data);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to save settings");
    }
  };

  return (
    <form
      className="flex max-w-2xl flex-col gap-6 pt-6"
      noValidate
      onSubmit={handleSubmit(onSubmit)}
    >
      <TextField
        control={control}
        name="flatRateFee"
        label="Flat Rate Fee"
        type="number"
        isRequired
      />
      <TextField
        control={control}
        name="freeShippingThreshold"
        label="Free Shipping Threshold"
        type="number"
        isRequired
      />

      {submitError && (
        <p role="alert" className="text-danger text-sm">
          {submitError}
        </p>
      )}

      <FormActions
        onCancel={() => reset(formValues)}
        cancelLabel="Reset"
        isSubmitting={isSubmitting}
        saveLabel="Save Changes"
      />
    </form>
  );
}

const paymentFormSchema = z.object({
  COD: z.boolean(),
  CARD: z.boolean(),
  BANK_TRANSFER: z.boolean(),
});
type PaymentFormValues = z.infer<typeof paymentFormSchema>;

function PaymentTab({
  initial,
  onSaved,
}: {
  initial: SettingsData["payment"];
  onSaved: (data: SettingsData) => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const formValues = Object.fromEntries(
    PAYMENT_METHODS.map((method) => [method.value, initial.enabledMethods.includes(method.value)]),
  ) as PaymentFormValues;
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    values: formValues,
  });

  const onSubmit = async (values: PaymentFormValues) => {
    setSubmitError(null);
    const enabledMethods = PAYMENT_METHODS.filter((method) => values[method.value]).map(
      (method) => method.value,
    );
    try {
      const data = await patchSettings({
        [SETTINGS_KEYS.payment.enabledMethods]: JSON.stringify(enabledMethods),
      });
      onSaved(data);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to save settings");
    }
  };

  return (
    <form
      className="flex max-w-2xl flex-col gap-6 pt-6"
      noValidate
      onSubmit={handleSubmit(onSubmit)}
    >
      <div className="flex flex-col gap-2">
        {PAYMENT_METHODS.map((method) => (
          <ToggleField
            key={method.value}
            control={control}
            name={method.value}
            label={method.label}
          />
        ))}
      </div>

      {submitError && (
        <p role="alert" className="text-danger text-sm">
          {submitError}
        </p>
      )}

      <FormActions
        onCancel={() => reset(formValues)}
        cancelLabel="Reset"
        isSubmitting={isSubmitting}
        saveLabel="Save Changes"
      />
    </form>
  );
}
