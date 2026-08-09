"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Chip } from "@heroui/react";
import { SelectField } from "@/components/admin/form";

interface CarBrand {
  id: string;
  nameEn: string;
}

interface CarModel {
  id: string;
  nameEn: string;
}

interface CarEngine {
  id: string;
  labelEn: string;
  yearStart: number;
  yearEnd: number | null;
}

// Mirrors the payload lib/services/fitment.ts returns (grouping, climate label
// and priority ordering all resolved server-side).
interface FitmentProduct {
  id: string;
  nameEn: string;
  price: number;
  finalPrice: number;
  image: string | null;
}

interface FitmentItem {
  id: string;
  climate: "STANDARD" | "HOT" | "COLD";
  climateLabel: string | null;
  product: FitmentProduct | null;
  specNote: string | null;
}

interface CategoryGroup {
  category: { id: string; nameEn: string };
  items: FitmentItem[];
}

interface PreviewFormValues {
  carBrandId: string;
  carModelId: string;
  year: string;
  carEngineId: string;
}

const emptyDefaults: PreviewFormValues = {
  carBrandId: "",
  carModelId: "",
  year: "",
  carEngineId: "",
};

function expandYearOptions(carEngines: CarEngine[]) {
  const currentYear = new Date().getFullYear();
  const years = new Set<number>();
  for (const engine of carEngines) {
    const end = engine.yearEnd ?? currentYear;
    for (let year = engine.yearStart; year <= end; year++) years.add(year);
  }
  return Array.from(years)
    .sort((a, b) => b - a)
    .map((year) => ({ label: String(year), value: String(year) }));
}

export default function FitmentPreviewPage() {
  const { control, watch, setValue } = useForm<PreviewFormValues>({
    defaultValues: emptyDefaults,
  });

  const carBrandId = watch("carBrandId");
  const carModelId = watch("carModelId");
  const year = watch("year");
  const carEngineId = watch("carEngineId");

  const [carBrands, setCarBrands] = useState<CarBrand[]>([]);
  const [carModels, setCarModels] = useState<CarModel[]>([]);
  const [carEngines, setCarEngines] = useState<CarEngine[]>([]);
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadCarBrands() {
      const response = await fetch("/api/admin/car-brands?status=ACTIVE&pageSize=100");
      const result = await response.json();
      if (ignore) return;
      if (result.success) setCarBrands(result.data.carBrands);
    }

    void loadCarBrands();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    setValue("carModelId", "");

    if (!carBrandId) {
      setCarModels([]);
      return;
    }

    let ignore = false;

    async function loadCarModels() {
      const queryParams = new URLSearchParams({
        carBrandId,
        status: "ACTIVE",
        pageSize: "100",
      });
      const response = await fetch(`/api/admin/car-models?${queryParams.toString()}`);
      const result = await response.json();
      if (ignore) return;
      if (result.success) setCarModels(result.data.carModels);
    }

    void loadCarModels();
    return () => {
      ignore = true;
    };
  }, [carBrandId, setValue]);

  useEffect(() => {
    setValue("year", "");

    if (!carModelId) {
      setCarEngines([]);
      return;
    }

    let ignore = false;

    async function loadCarEngines() {
      const queryParams = new URLSearchParams({
        carModelId,
        status: "ACTIVE",
        pageSize: "100",
      });
      const response = await fetch(`/api/admin/car-engines?${queryParams.toString()}`);
      const result = await response.json();
      if (ignore) return;
      if (result.success) setCarEngines(result.data.carEngines);
    }

    void loadCarEngines();
    return () => {
      ignore = true;
    };
  }, [carModelId, setValue]);

  const yearOptions = expandYearOptions(carEngines);
  const matchingCarEngines = year
    ? carEngines.filter(
        (engine) =>
          engine.yearStart <= Number(year) && (engine.yearEnd ?? Infinity) >= Number(year),
      )
    : [];

  useEffect(() => {
    if (matchingCarEngines.length === 1) {
      setValue("carEngineId", matchingCarEngines[0].id);
    } else {
      setValue("carEngineId", "");
    }
    // matchingCarEngines is derived from year + carEngines each render, so depend on those directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, carEngines, setValue]);

  useEffect(() => {
    if (!carEngineId) {
      setCategoryGroups([]);
      return;
    }

    let ignore = false;

    async function loadFitmentItems() {
      setIsLoadingItems(true);
      setLoadError(null);

      // Resolves via CarEngineFitmentProfile → FitmentProfile → FitmentProfileItem —
      // the same read path (lib/services/fitment.ts) the storefront uses.
      const response = await fetch(`/api/admin/car-engines/${carEngineId}/fitment`);
      const result = await response.json();
      if (ignore) return;

      if (!result.success) {
        setLoadError(result.error ?? "Failed to load fitment recommendations");
        setIsLoadingItems(false);
        return;
      }

      setCategoryGroups(result.data.groups);
      setIsLoadingItems(false);
    }

    void loadFitmentItems();
    return () => {
      ignore = true;
    };
  }, [carEngineId]);

  return (
    <div className="flex flex-col gap-6 p-8">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Fitment Preview</h1>
        <p className="text-sm text-neutral-500">
          Walk the Brand → Model → Year → Engine flow a customer will eventually use, and see
          exactly what fitment recommendations would be shown.
        </p>
      </div>

      <div className="rounded-field bg-field grid max-w-3xl grid-cols-1 gap-4 p-4 sm:grid-cols-2">
        <SelectField
          control={control}
          name="carBrandId"
          label="Car Brand"
          options={carBrands.map((brand) => ({ label: brand.nameEn, value: brand.id }))}
          placeholder="Select a brand..."
        />

        <SelectField
          control={control}
          name="carModelId"
          label="Car Model"
          options={carModels.map((model) => ({ label: model.nameEn, value: model.id }))}
          placeholder="Select a model..."
          isDisabled={!carBrandId}
        />

        <SelectField
          control={control}
          name="year"
          label="Year"
          options={yearOptions}
          placeholder="Select a year..."
          isDisabled={!carModelId}
        />

        {matchingCarEngines.length > 1 && (
          <SelectField
            control={control}
            name="carEngineId"
            label="Engine"
            options={matchingCarEngines.map((engine) => ({
              label: `${engine.labelEn} (${engine.yearStart}–${engine.yearEnd ?? "Present"})`,
              value: engine.id,
            }))}
            placeholder="Select an engine..."
          />
        )}
      </div>

      {loadError && (
        <p role="alert" className="text-danger text-sm">
          {loadError}
        </p>
      )}

      {!carEngineId && !loadError && (
        <p className="text-sm text-neutral-500">
          Select a brand, model, year and engine to preview its fitment recommendations.
        </p>
      )}

      {carEngineId && isLoadingItems && <p className="text-sm text-neutral-500">Loading...</p>}

      {carEngineId && !isLoadingItems && categoryGroups.length === 0 && !loadError && (
        <p className="text-sm text-neutral-500">
          No fitment recommendations exist yet for this engine.
        </p>
      )}

      {carEngineId && !isLoadingItems && categoryGroups.length > 0 && (
        <div className="flex max-w-3xl flex-col gap-6">
          {categoryGroups.map((group) => (
            <div key={group.category.id} className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-neutral-900">{group.category.nameEn}</h2>
              <div className="flex flex-col gap-2">
                {group.items.map((item) => (
                  <div key={item.id} className="rounded-field bg-field flex items-center gap-3 p-3">
                    {item.product ? (
                      <>
                        <div className="rounded-field flex size-10 shrink-0 items-center justify-center overflow-hidden bg-white">
                          {item.product.image ? (
                            // eslint-disable-next-line @next/next/no-img-element -- product image URL isn't a known static/remote-configured asset
                            <img
                              src={item.product.image}
                              alt=""
                              className="size-full object-cover"
                            />
                          ) : (
                            <span className="text-xs text-neutral-400">—</span>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col">
                          <span className="text-sm font-medium text-neutral-900">
                            {item.product.nameEn}
                          </span>
                          <span className="text-xs text-neutral-500">
                            {item.product.price.toLocaleString()}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-1 flex-col gap-1">
                        <Chip color="warning" size="sm" variant="soft" className="self-start">
                          <Chip.Label>Spec only — not yet in catalog</Chip.Label>
                        </Chip>
                        {item.specNote && (
                          <span className="text-sm text-neutral-700">{item.specNote}</span>
                        )}
                      </div>
                    )}
                    {item.climateLabel && (
                      <Chip size="sm" variant="soft">
                        <Chip.Label>{item.climateLabel}</Chip.Label>
                      </Chip>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
