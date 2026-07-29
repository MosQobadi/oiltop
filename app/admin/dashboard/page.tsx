import { Card, CardContent } from "@heroui/react";
import { RecentOrdersTable } from "./RecentOrdersTable";

// Placeholder values — wired to real aggregation data in Task 14.1 once
// Orders, Products, and Fitment Inquiries exist.
const STAT_CARDS = [
  { label: "Total Orders", value: "0" },
  { label: "Revenue", value: "$0.00" },
  { label: "Products", value: "0" },
  { label: "Low Stock", value: "0" },
  { label: "Open Inquiries", value: "0" },
];

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8 p-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {STAT_CARDS.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex flex-col gap-1 p-5">
              <span className="text-sm font-medium text-neutral-500">
                {stat.label}
              </span>
              <span className="text-2xl font-semibold text-neutral-900">
                {stat.value}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-semibold text-neutral-900">
          Recent Orders
        </h2>
        <RecentOrdersTable />
      </section>
    </div>
  );
}
