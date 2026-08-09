import { describe, expect, it } from "vitest";
import { orderNoteSchema, orderStatusUpdateSchema } from "./order";

describe("orderStatusUpdateSchema", () => {
  it("accepts a valid status", () => {
    expect(orderStatusUpdateSchema.safeParse({ status: "SENT" }).success).toBe(true);
  });

  it("rejects an invalid status", () => {
    expect(orderStatusUpdateSchema.safeParse({ status: "SHIPPED" }).success).toBe(false);
  });
});

describe("orderNoteSchema", () => {
  it("accepts a valid note", () => {
    expect(orderNoteSchema.safeParse({ adminNote: "Called customer" }).success).toBe(true);
  });

  it("rejects an empty note", () => {
    expect(orderNoteSchema.safeParse({ adminNote: "" }).success).toBe(false);
  });
});
