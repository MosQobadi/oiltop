import { describe, expect, it } from "vitest";
import { loginIdentifierKind, normalizePhone } from "./identifier";

describe("loginIdentifierKind", () => {
  it("reads an email address as an email", () => {
    expect(loginIdentifierKind("admin@topoil.com")).toBe("email");
  });

  it("reads a phone number as a phone", () => {
    expect(loginIdentifierKind("09124458890")).toBe("phone");
    expect(loginIdentifierKind("+98 912 445 8890")).toBe("phone");
  });
});

describe("normalizePhone", () => {
  it("collapses every separator a customer might type", () => {
    expect(normalizePhone("0912 445 8890")).toBe("09124458890");
    expect(normalizePhone("0912-445-8890")).toBe("09124458890");
    expect(normalizePhone(" (0912) 445.8890 ")).toBe("09124458890");
  });

  it("keeps a leading plus so a country code survives", () => {
    expect(normalizePhone("+98 912 445 8890")).toBe("+989124458890");
  });

  it("leaves an already-normalized number alone", () => {
    expect(normalizePhone("+989351112233")).toBe("+989351112233");
  });

  // The documented limit of the regex approach — asserted so a future change
  // to country-code folding is a deliberate one, not an accident.
  it("does not fold a country code into a local number", () => {
    expect(normalizePhone("+989124458890")).not.toBe(normalizePhone("09124458890"));
  });
});
