import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LOCALE } from ".";
import { useLocale } from "./useLocale";

// `useLocale` only reads `useParams()` — no React state, no effects — so it can
// be called directly with the router mocked, without a DOM or a renderer.
const { useParams } = vi.hoisted(() => ({ useParams: vi.fn() }));

vi.mock("next/navigation", () => ({ useParams }));

describe("useLocale", () => {
  beforeEach(() => {
    useParams.mockReset();
  });

  it("reads the current [locale] segment", () => {
    useParams.mockReturnValue({ locale: "fa" });
    expect(useLocale()).toBe("fa");

    useParams.mockReturnValue({ locale: "en" });
    expect(useLocale()).toBe("en");
  });

  it("falls back to the default locale outside the storefront tree", () => {
    useParams.mockReturnValue({});
    expect(useLocale()).toBe(DEFAULT_LOCALE);

    useParams.mockReturnValue({ locale: "de" });
    expect(useLocale()).toBe(DEFAULT_LOCALE);
  });
});
