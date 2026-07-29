import { DataTableDemo } from "./DataTableDemo";

export default function DevPreviewPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 p-8">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Dev Preview</h1>
        <p className="text-sm text-neutral-500">
          Internal component playground — not a real admin screen.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-neutral-700">DataTable</h2>
        <DataTableDemo />
      </section>
    </div>
  );
}
