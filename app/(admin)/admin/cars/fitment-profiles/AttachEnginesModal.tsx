"use client";

import { useEffect, useState } from "react";
import { Button, Checkbox, CheckboxGroup, Label, Modal, SearchField } from "@heroui/react";
import { SelectField } from "@/components/admin/form";
import { useForm } from "react-hook-form";

interface CarBrand {
  id: string;
  nameEn: string;
}

interface CarModel {
  id: string;
  nameEn: string;
}

interface SearchableEngine {
  id: string;
  label: string;
}

interface FilterValues {
  carBrandId: string;
  carModelId: string;
}

const emptyFilters: FilterValues = { carBrandId: "", carModelId: "" };

export interface AttachEnginesModalProps {
  isOpen: boolean;
  onClose: () => void;
  profileId: string;
  onAttached: () => void;
}

export function AttachEnginesModal({
  isOpen,
  onClose,
  profileId,
  onAttached,
}: AttachEnginesModalProps) {
  const { control, watch, setValue, reset } = useForm<FilterValues>({
    defaultValues: emptyFilters,
  });
  const carBrandId = watch("carBrandId");
  const carModelId = watch("carModelId");

  const [carBrands, setCarBrands] = useState<CarBrand[]>([]);
  const [carModels, setCarModels] = useState<CarModel[]>([]);
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [search, setSearch] = useState("");
  const [engines, setEngines] = useState<SearchableEngine[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [isAttaching, setIsAttaching] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    reset(emptyFilters);
    setYearFrom("");
    setYearTo("");
    setSearch("");
    setSelected([]);
    setAttachError(null);
  }, [isOpen, reset]);

  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen]);

  useEffect(() => {
    setValue("carModelId", "");
    if (!carBrandId) {
      setCarModels([]);
      return;
    }

    let ignore = false;

    async function loadCarModels() {
      const params = new URLSearchParams({ carBrandId, status: "ACTIVE", pageSize: "100" });
      const response = await fetch(`/api/admin/car-models?${params.toString()}`);
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
    if (!isOpen) return;
    let ignore = false;

    async function loadEngines() {
      setIsLoading(true);
      setLoadError(null);

      const params = new URLSearchParams({ pageSize: "100" });
      if (carBrandId) params.set("carBrandId", carBrandId);
      if (carModelId) params.set("carModelId", carModelId);
      if (yearFrom) params.set("yearFrom", yearFrom);
      if (yearTo) params.set("yearTo", yearTo);
      if (search) params.set("search", search);

      const response = await fetch(`/api/admin/car-engines/searchable?${params.toString()}`);
      const result = await response.json();
      if (ignore) return;

      if (!result.success) {
        setLoadError(result.error ?? "Failed to load car engines");
        setIsLoading(false);
        return;
      }

      setEngines(result.data.carEngines);
      setIsLoading(false);
    }

    const debounce = setTimeout(() => void loadEngines(), 300);
    return () => {
      ignore = true;
      clearTimeout(debounce);
    };
  }, [isOpen, carBrandId, carModelId, yearFrom, yearTo, search]);

  const handleAttach = async () => {
    if (selected.length === 0) return;
    setIsAttaching(true);
    setAttachError(null);

    const response = await fetch(`/api/admin/fitment-profiles/${profileId}/attach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ carEngineIds: selected }),
    });
    const result = await response.json();
    setIsAttaching(false);

    if (!result.success) {
      setAttachError(result.error ?? "Failed to attach engines");
      return;
    }

    onAttached();
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
              <Modal.Heading>Attach Engines</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <SelectField
                    control={control}
                    name="carBrandId"
                    label="Car Brand"
                    options={carBrands.map((b) => ({ label: b.nameEn, value: b.id }))}
                    placeholder="Any brand..."
                  />
                  <SelectField
                    control={control}
                    name="carModelId"
                    label="Car Model"
                    options={carModels.map((m) => ({ label: m.nameEn, value: m.id }))}
                    placeholder="Any model..."
                    isDisabled={!carBrandId}
                  />
                  <div className="flex flex-col gap-2">
                    <Label>Year From</Label>
                    <input
                      type="number"
                      value={yearFrom}
                      onChange={(e) => setYearFrom(e.target.value)}
                      className="h-10 rounded-field border border-neutral-300 px-3 text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Year To</Label>
                    <input
                      type="number"
                      value={yearTo}
                      onChange={(e) => setYearTo(e.target.value)}
                      className="h-10 rounded-field border border-neutral-300 px-3 text-sm"
                    />
                  </div>
                </div>

                <SearchField value={search} onChange={setSearch}>
                  <SearchField.Group>
                    <SearchField.SearchIcon />
                    <SearchField.Input placeholder="Search engines..." />
                    <SearchField.ClearButton />
                  </SearchField.Group>
                </SearchField>

                {loadError && (
                  <p role="alert" className="text-sm text-danger">
                    {loadError}
                  </p>
                )}

                <div className="max-h-72 overflow-y-auto rounded-field bg-field p-3">
                  {isLoading ? (
                    <p className="text-sm text-neutral-500">Loading...</p>
                  ) : engines.length === 0 ? (
                    <p className="text-sm text-neutral-500">
                      No matching engines found.
                    </p>
                  ) : (
                    <CheckboxGroup value={selected} onChange={setSelected}>
                      <div className="flex flex-col gap-2">
                        {engines.map((engine) => (
                          <Checkbox key={engine.id} value={engine.id}>
                            <Checkbox.Content>
                              <Checkbox.Control>
                                <Checkbox.Indicator />
                              </Checkbox.Control>
                              {engine.label}
                            </Checkbox.Content>
                          </Checkbox>
                        ))}
                      </div>
                    </CheckboxGroup>
                  )}
                </div>

                {attachError && (
                  <p role="alert" className="text-sm text-danger">
                    {attachError}
                  </p>
                )}
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button type="button" variant="outline" onPress={onClose} isDisabled={isAttaching}>
                Cancel
              </Button>
              <Button
                type="button"
                onPress={() => void handleAttach()}
                isDisabled={selected.length === 0 || isAttaching}
              >
                {isAttaching
                  ? "Attaching..."
                  : `Attach ${selected.length || ""} Engine${selected.length === 1 ? "" : "s"}`}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
