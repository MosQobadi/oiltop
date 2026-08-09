import { describe, expect, it } from "vitest";
import { inventoryAddStockSchema, inventoryListQuerySchema } from "./inventory";

describe("inventoryAddStockSchema", () => {
  it("accepts a positive addStock value", () => {
    expect(inventoryAddStockSchema.safeParse({ addStock: 42 }).success).toBe(true);
  });

  it("rejects a zero addStock value", () => {
    expect(inventoryAddStockSchema.safeParse({ addStock: 0 }).success).toBe(false);
  });

  it("rejects a negative addStock value", () => {
    expect(inventoryAddStockSchema.safeParse({ addStock: -1 }).success).toBe(false);
  });
});

describe("inventoryListQuerySchema", () => {
  it("applies pagination defaults", () => {
    const parsed = inventoryListQuerySchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.page).toBe(1);
      expect(parsed.data.pageSize).toBe(20);
    }
  });

  it("accepts a valid status filter", () => {
    expect(inventoryListQuerySchema.safeParse({ status: "LOW_STOCK" }).success).toBe(true);
  });

  it("rejects an invalid status filter", () => {
    expect(inventoryListQuerySchema.safeParse({ status: "NOT_A_STATUS" }).success).toBe(false);
  });
});
