"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CarBrandOption, CarEngineOption, CarModelOption } from "@/lib/services/fitment";

// The Brand → Model → Year → Engine cascade behind FitmentWizard, kept apart
// from it so the component is a rendering of four steps rather than four steps
// plus four fetches. Design Decision 3: each step calls its own public endpoint
// once the previous one resolves — there is no single car-tree payload.
//
// The option types are the service's, imported type-only (nothing here pulls
// Prisma into the client bundle). They're reused rather than redeclared because
// the routes return these exact selects, and every field in them is JSON-safe.

export type FitmentStepKey = "brand" | "model" | "year" | "engine";

export interface FitmentStepFlags {
  loading: boolean;
  failed: boolean;
}

type StepFlags = Record<FitmentStepKey, FitmentStepFlags>;

const IDLE_FLAGS: StepFlags = {
  brand: { loading: false, failed: false },
  model: { loading: false, failed: false },
  year: { loading: false, failed: false },
  engine: { loading: false, failed: false },
};

// A loaded step remembers which input produced it, and anything loaded for a
// different input reads as empty. Deriving staleness this way is what keeps the
// cascade out of effect bodies: changing the brand doesn't have to *clear* the
// model list, it just stops matching it.
interface StepOptions<T> {
  key: string;
  items: T[];
}

const NO_OPTIONS = { key: "", items: [] };

function optionsFor<T>(loaded: StepOptions<T>, key: string, empty: T[]): T[] {
  return key !== "" && loaded.key === key ? loaded.items : empty;
}

const NO_MODELS: CarModelOption[] = [];
const NO_YEARS: number[] = [];
const NO_ENGINES: CarEngineOption[] = [];

export interface FitmentWizardSelection {
  /** Brands are addressed by slug — that's what the models route takes. */
  brandSlug: string;
  modelId: string;
  /** Kept as the string a `<select>` reports; the API coerces it. */
  year: string;
  carEngineId: string;
}

export interface FitmentWizardState {
  brands: CarBrandOption[];
  models: CarModelOption[];
  years: number[];
  engines: CarEngineOption[];
  selection: FitmentWizardSelection;
  flags: StepFlags;
  /**
   * Exactly one engine matched the chosen year, so the Engine step is never
   * shown and the wizard resolved on the year instead.
   */
  engineStepSkipped: boolean;
  selectBrand: (brandSlug: string) => void;
  selectModel: (modelId: string) => void;
  selectYear: (year: string) => void;
  selectEngine: (carEngineId: string) => void;
  retry: () => void;
}

// Every step loads the same way — flag it, store its options under the input
// they belong to, flag a failure — so the shape lives here once and each effect
// below only says which URL it calls and what to read off the answer. `isStale`
// is the effect's cleanup flag: a superseded response must not land.
async function loadStep<T>(options: {
  step: FitmentStepKey;
  url: string;
  apply: (data: T) => void;
  setFlags: (step: FitmentStepKey, flags: FitmentStepFlags) => void;
  isStale: () => boolean;
}) {
  const { step, url, apply, setFlags, isStale } = options;
  setFlags(step, { loading: true, failed: false });

  try {
    const response = await fetch(url);
    const result = await response.json();
    if (isStale()) return;

    if (!result?.success) {
      setFlags(step, { loading: false, failed: true });
      return;
    }

    apply(result.data as T);
    setFlags(step, { loading: false, failed: false });
  } catch {
    if (isStale()) return;
    setFlags(step, { loading: false, failed: true });
  }
}

export function useFitmentWizard(onResolve: (carEngineId: string) => void): FitmentWizardState {
  // Resolving navigates, so the callback is read through a ref: a caller that
  // passes an inline arrow must not re-run the engine fetch on every render.
  const onResolveRef = useRef(onResolve);
  useEffect(() => {
    onResolveRef.current = onResolve;
  });

  const [brands, setBrands] = useState<CarBrandOption[]>([]);
  const [loadedModels, setLoadedModels] = useState<StepOptions<CarModelOption>>(NO_OPTIONS);
  const [loadedYears, setLoadedYears] = useState<StepOptions<number>>(NO_OPTIONS);
  const [loadedEngines, setLoadedEngines] = useState<StepOptions<CarEngineOption>>(NO_OPTIONS);

  const [brandSlug, setBrandSlug] = useState("");
  const [modelId, setModelId] = useState("");
  const [year, setYear] = useState("");
  const [carEngineId, setCarEngineId] = useState("");

  const [flags, setAllFlags] = useState<StepFlags>(IDLE_FLAGS);
  // Bumped by `retry`. Every loader depends on it, but the guards below mean
  // only the steps that actually have an input to load from re-run.
  const [reloadToken, setReloadToken] = useState(0);

  const setFlags = useCallback((step: FitmentStepKey, stepFlags: FitmentStepFlags) => {
    setAllFlags((current) => ({ ...current, [step]: stepFlags }));
  }, []);

  // The engine list is the only one keyed on two answers at once.
  const engineKey = modelId && year ? `${modelId}|${year}` : "";

  useEffect(() => {
    let stale = false;
    void loadStep<{ carBrands: CarBrandOption[] }>({
      step: "brand",
      url: "/api/storefront/cars/brands",
      apply: (data) => setBrands(data.carBrands),
      setFlags,
      isStale: () => stale,
    });
    return () => {
      stale = true;
    };
  }, [reloadToken, setFlags]);

  useEffect(() => {
    if (!brandSlug) return;

    let stale = false;
    void loadStep<{ carModels: CarModelOption[] }>({
      step: "model",
      url: `/api/storefront/cars/brands/${encodeURIComponent(brandSlug)}/models`,
      apply: (data) => setLoadedModels({ key: brandSlug, items: data.carModels }),
      setFlags,
      isStale: () => stale,
    });
    return () => {
      stale = true;
    };
  }, [brandSlug, reloadToken, setFlags]);

  useEffect(() => {
    if (!modelId) return;

    let stale = false;
    void loadStep<{ years: number[] }>({
      step: "year",
      url: `/api/storefront/cars/models/${encodeURIComponent(modelId)}/years`,
      apply: (data) => setLoadedYears({ key: modelId, items: data.years }),
      setFlags,
      isStale: () => stale,
    });
    return () => {
      stale = true;
    };
  }, [modelId, reloadToken, setFlags]);

  useEffect(() => {
    if (!engineKey) return;

    let stale = false;
    void loadStep<{ carEngines: CarEngineOption[] }>({
      step: "engine",
      url: `/api/storefront/cars/models/${encodeURIComponent(modelId)}/engines?year=${encodeURIComponent(year)}`,
      apply: (data) => {
        setLoadedEngines({ key: engineKey, items: data.carEngines });
        // The auto-skip: one match isn't a choice, so the wizard resolves on
        // the year pick and the Engine step never renders.
        const onlyEngine = data.carEngines.length === 1 ? data.carEngines[0] : null;
        if (onlyEngine) {
          setCarEngineId(onlyEngine.id);
          onResolveRef.current(onlyEngine.id);
        }
      },
      setFlags,
      isStale: () => stale,
    });
    return () => {
      stale = true;
    };
  }, [engineKey, modelId, year, reloadToken, setFlags]);

  // Changing a step clears every answer downstream of it; the option lists
  // follow on their own, because they no longer match the inputs above them.
  const selectBrand = useCallback((nextBrandSlug: string) => {
    setBrandSlug(nextBrandSlug);
    setModelId("");
    setYear("");
    setCarEngineId("");
  }, []);

  const selectModel = useCallback((nextModelId: string) => {
    setModelId(nextModelId);
    setYear("");
    setCarEngineId("");
  }, []);

  const selectYear = useCallback((nextYear: string) => {
    setYear(nextYear);
    setCarEngineId("");
  }, []);

  const selectEngine = useCallback((nextCarEngineId: string) => {
    setCarEngineId(nextCarEngineId);
    if (nextCarEngineId) onResolveRef.current(nextCarEngineId);
  }, []);

  const retry = useCallback(() => setReloadToken((token) => token + 1), []);

  const engines = optionsFor(loadedEngines, engineKey, NO_ENGINES);

  return {
    brands,
    models: optionsFor(loadedModels, brandSlug, NO_MODELS),
    years: optionsFor(loadedYears, modelId, NO_YEARS),
    engines,
    selection: { brandSlug, modelId, year, carEngineId },
    flags,
    engineStepSkipped: engines.length === 1,
    selectBrand,
    selectModel,
    selectYear,
    selectEngine,
    retry,
  };
}
