import { describe, expect, it } from "vitest";
import { formatOrderDate, formatPostalCode, orderStatusLabel, paymentStatusLabel } from "./orders";

describe("orderStatusLabel / paymentStatusLabel", () => {
  it("labels every fulfilment status in both trees", () => {
    expect(orderStatusLabel("PENDING", "en")).toBe("Pending");
    expect(orderStatusLabel("SENDING", "en")).toBe("Sending");
    expect(orderStatusLabel("SENT", "en")).toBe("Sent");
    expect(orderStatusLabel("DELIVERED", "en")).toBe("Delivered");
    expect(orderStatusLabel("CANCELLED", "en")).toBe("Cancelled");

    expect(orderStatusLabel("SENDING", "fa")).toBe("در حال ارسال");
    expect(orderStatusLabel("DELIVERED", "fa")).toBe("تحویل شد");
  });

  it("labels payment separately from fulfilment", () => {
    // The pair the design brief calls out: an order can be on its way and
    // already paid, so neither label may be derived from the other.
    expect(orderStatusLabel("SENDING", "en")).toBe("Sending");
    expect(paymentStatusLabel("PAID", "en")).toBe("Paid");

    expect(paymentStatusLabel("UNPAID", "en")).toBe("Unpaid");
    expect(paymentStatusLabel("REFUNDED", "en")).toBe("Refunded");
    expect(paymentStatusLabel("UNPAID", "fa")).toBe("پرداخت‌نشده");
  });
});

describe("formatPostalCode", () => {
  it("keeps a leading zero and doesn't group the digits", () => {
    // `Number("0123456789")` would drop the zero and `formatNumber` would print
    // it as a price — this is ten digits, not a quantity.
    expect(formatPostalCode("0123456789", "en")).toBe("0123456789");
    expect(formatPostalCode("0123456789", "fa")).toBe("۰۱۲۳۴۵۶۷۸۹");
  });
});

describe("formatOrderDate", () => {
  it("takes a Date or the string it becomes after JSON", () => {
    const iso = "2026-08-10T09:30:00.000Z";
    expect(formatOrderDate(iso, "en")).toBe(formatOrderDate(new Date(iso), "en"));
  });

  it("renders the Persian tree in Persian digits", () => {
    expect(formatOrderDate("2026-08-10T09:30:00.000Z", "fa")).toMatch(/[۰-۹]/);
  });
});
