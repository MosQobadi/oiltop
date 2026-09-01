import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { NotACatalogImageError, normalizeProductImage } from "./normalize";

/**
 * A synthetic product shot: a `subject`-coloured rectangle centred on a
 * `background`-coloured frame. Enough to exercise every gate in the module,
 * and far more predictable than checking in real photographs.
 */
async function shot(options: {
  size?: number;
  background?: string;
  subject?: string;
  subjectSize?: number;
}): Promise<Buffer> {
  const { size = 800, background = "#ffffff", subject = "#1a3fa0", subjectSize = 400 } = options;
  const block = await sharp({
    create: { width: subjectSize, height: subjectSize, channels: 3, background: subject },
  })
    .png()
    .toBuffer();

  return sharp({ create: { width: size, height: size, channels: 3, background } })
    .composite([{ input: block, gravity: "centre" }])
    .jpeg()
    .toBuffer();
}

describe("normalizeProductImage", () => {
  it("accepts a product on white and returns one square", async () => {
    const { webp } = await normalizeProductImage(await shot({}));
    const meta = await sharp(webp).metadata();

    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(800);
  });

  it("gives a tall subject and a squat one the same footprint", async () => {
    // The point of the shared margin: two products shot at different scales
    // must not arrive on the shelf at different apparent distances.
    const small = await normalizeProductImage(await shot({ subjectSize: 200 }));
    const large = await normalizeProductImage(await shot({ subjectSize: 700 }));

    const bounds = async (webp: Buffer) => {
      const { info } = await sharp(webp)
        .trim({ background: "#ffffff", threshold: 12 })
        .toBuffer({ resolveWithObject: true });
      return info.width;
    };

    // Both are trimmed to the same subject and re-padded identically, so the
    // subject occupies the same width regardless of how big it started.
    expect(Math.abs((await bounds(small.webp)) - (await bounds(large.webp)))).toBeLessThanOrEqual(
      4,
    );
  });

  it("rejects a photo that is not on a white ground", async () => {
    await expect(normalizeProductImage(await shot({ background: "#2b2b2b" }))).rejects.toThrow(
      NotACatalogImageError,
    );
  });

  it("names the measurement when it rejects for the background", async () => {
    // The reason has to be actionable — a run reports these in bulk, and
    // "rejected" without a number is not something a person can tune against.
    await expect(normalizeProductImage(await shot({ background: "#8a8a8a" }))).rejects.toThrow(
      /border luminance \d+ of a required \d+/,
    );
  });

  it("rejects a thumbnail too small to enlarge", async () => {
    await expect(
      normalizeProductImage(await shot({ size: 200, subjectSize: 100 })),
    ).rejects.toThrow(/too small at 200x200/);
  });

  it("rejects a blank frame rather than shipping an empty square", async () => {
    await expect(
      normalizeProductImage(await shot({ subjectSize: 1, subject: "#ffffff" })),
    ).rejects.toThrow(NotACatalogImageError);
  });

  it("rejects bytes that are not an image at all", async () => {
    await expect(normalizeProductImage(Buffer.from("<!DOCTYPE html><html>"))).rejects.toThrow(
      /not a readable image/,
    );
  });

  it("treats a transparent PNG as white rather than failing it on the background", async () => {
    // Flattening has to happen before the luminance test: a transparent border
    // is not a dark border, and rejecting it would be the right answer to the
    // wrong question.
    const block = await sharp({
      create: { width: 300, height: 300, channels: 3, background: "#1a3fa0" },
    })
      .png()
      .toBuffer();
    const transparent = await sharp({
      create: { width: 800, height: 800, channels: 4, background: "#00000000" },
    })
      .composite([{ input: block, gravity: "centre" }])
      .png()
      .toBuffer();

    const { webp } = await normalizeProductImage(transparent);
    expect((await sharp(webp).metadata()).width).toBe(800);
  });
});
