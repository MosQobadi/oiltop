import { prisma } from "@/lib/db";

export interface DashboardSummary {
  totalOrders: number;
  totalRevenue: number;
  activeProducts: number;
  lowStockCount: number;
  openInquiries: number;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [
    totalOrders,
    revenue,
    activeProducts,
    lowStockCount,
    openInquiries,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.order.aggregate({
      where: { status: "DELIVERED" },
      _sum: { total: true },
    }),
    prisma.product.count({ where: { status: "ACTIVE" } }),
    prisma.product.count({ where: { inventory: { stock: { gt: 0, lt: 10 } } } }),
    prisma.fitmentInquiry.count({ where: { status: { in: ["NEW", "CONTACTED"] } } }),
  ]);

  return {
    totalOrders,
    totalRevenue: Number(revenue._sum.total ?? 0),
    activeProducts,
    lowStockCount,
    openInquiries,
  };
}
