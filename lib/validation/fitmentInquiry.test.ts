import { describe, expect, it } from "vitest";
import {
  fitmentInquiryCreateSchema,
  fitmentInquiryUpdateSchema,
} from "./fitmentInquiry";

const validInquiry = {
  customerName: "Ali Rezaei",
  phone: "09121234567",
  status: "NEW",
};

describe("fitmentInquiryCreateSchema", () => {
  it("accepts a valid fitment inquiry", () => {
    expect(fitmentInquiryCreateSchema.safeParse(validInquiry).success).toBe(
      true,
    );
  });

  it("rejects an invalid email", () => {
    const result = fitmentInquiryCreateSchema.safeParse({
      ...validInquiry,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });
});

describe("fitmentInquiryUpdateSchema", () => {
  it("accepts a partial update", () => {
    expect(
      fitmentInquiryUpdateSchema.safeParse({ status: "RESOLVED" }).success,
    ).toBe(true);
  });
});
