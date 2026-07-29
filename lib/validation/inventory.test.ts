import { describe, expect, it } from "vitest";
import { inventoryUpdateSchema } from "./inventory";

describe("inventoryUpdateSchema", () => {
  it("accepts a valid stock value", () => {
    expect(inventoryUpdateSchema.safeParse({ stock: 42 }).success).toBe(true);
  });

  it("rejects a negative stock value", () => {
    expect(inventoryUpdateSchema.safeParse({ stock: -1 }).success).toBe(false);
  });
});
