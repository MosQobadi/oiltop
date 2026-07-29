import { describe, expect, it } from "vitest";
import { settingsSchema } from "./settings";

describe("settingsSchema", () => {
  it("accepts a valid key/value pair", () => {
    expect(
      settingsSchema.safeParse({ key: "site_name", value: "Top Oil" }).success,
    ).toBe(true);
  });

  it("rejects an empty key", () => {
    expect(
      settingsSchema.safeParse({ key: "", value: "Top Oil" }).success,
    ).toBe(false);
  });
});
