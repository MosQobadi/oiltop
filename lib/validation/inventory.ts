import { z } from "zod";

export const inventoryUpdateSchema = z.object({
  stock: z.number().int().min(0, "stock must be >= 0"),
});

export type InventoryUpdateInput = z.infer<typeof inventoryUpdateSchema>;
