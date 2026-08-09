import { describe, expect, it } from "vitest";
import { customerListQuerySchema, customerStatusSchema } from "./customer";

describe("customerListQuerySchema", () => {
  it("defaults page and pageSize", () => {
    const parsed = customerListQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(20);
  });

  it("accepts search and status", () => {
    const parsed = customerListQuerySchema.safeParse({
      search: "alpha",
      status: "ACTIVE",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an invalid status", () => {
    expect(customerListQuerySchema.safeParse({ status: "BANNED" }).success).toBe(false);
  });
});

describe("customerStatusSchema", () => {
  it("accepts a valid status", () => {
    expect(customerStatusSchema.safeParse({ status: "ACTIVE" }).success).toBe(true);
  });

  it("rejects an invalid status", () => {
    expect(customerStatusSchema.safeParse({ status: "BANNED" }).success).toBe(false);
  });
});
