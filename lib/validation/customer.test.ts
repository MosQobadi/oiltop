import { describe, expect, it } from "vitest";
import { customerStatusSchema } from "./customer";

describe("customerStatusSchema", () => {
  it("accepts a valid status", () => {
    expect(customerStatusSchema.safeParse({ status: "ACTIVE" }).success).toBe(
      true,
    );
  });

  it("rejects an invalid status", () => {
    expect(customerStatusSchema.safeParse({ status: "BANNED" }).success).toBe(
      false,
    );
  });
});
