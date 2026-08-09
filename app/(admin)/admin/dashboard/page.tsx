"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@heroui/react";
import { RecentOrdersTable } from "./RecentOrdersTable";

interface DashboardSummary {
  totalOrders: number;
  totalRevenue: number;
  activeProducts: number;
  lowStockCount: number;
  openInquiries: number;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadSummary() {
      const response = await fetch("/api/admin/dashboard/summary");
      const result = await response.json();
      if (!ignore && result.success) {
        setSummary(result.data);
      }
    }

    void loadSummary();
    return () => {
      ignore = true;
    };
  }, []);

  const statCards = [
    { label: "Total Orders", value: summary?.totalOrders.toLocaleString() ?? "…" },
    { label: "Revenue", value: summary?.totalRevenue.toLocaleString() ?? "…" },
    { label: "Products", value: summary?.activeProducts.toLocaleString() ?? "…" },
    { label: "Low Stock", value: summary?.lowStockCount.toLocaleString() ?? "…" },
    { label: "Open Inquiries", value: summary?.openInquiries.toLocaleString() ?? "…" },
  ];

  return (
    <div className="flex flex-col gap-8 p-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {statCards.map((stat) => (
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
