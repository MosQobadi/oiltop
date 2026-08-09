import { z } from "zod";
import { pageSchema, pageSizeSchema } from "./common";

// Derived from Inventory.stock at read time (see the threshold comment on
// the Inventory model in schema.prisma) — not a stored DB enum.
export const inventoryStatusSchema = z.enum(["OUT_OF_STOCK", "LOW_STOCK", "IN_STOCK"]);
export type InventoryStatus = z.infer<typeof inventoryStatusSchema>;

export const inventoryListQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  brand: z.string().trim().min(1).optional(),
  status: inventoryStatusSchema.optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
});
export type InventoryListQuery = z.infer<typeof inventoryListQuerySchema>;

export const inventoryAddStockSchema = z.object({
  addStock: z.number().int().positive("addStock must be > 0"),
});
export type InventoryAddStockInput = z.infer<typeof inventoryAddStockSchema>;
