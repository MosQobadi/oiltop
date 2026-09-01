// Turns a downloaded photograph into a catalog image, or rejects it.
//
// CLAUDE.md commits the storefront to one standard: product photos are shot on
// a white background, and `ProductCard` contains an image on a white panel
// rather than cropping it. That standard is what lets a grid of cards read as
// one shelf, and it only holds if every image in the grid actually meets it.
// So this module does two jobs, and the second matters more than the first:
//
//   1. Normalise — flatten onto white, trim the source's own inconsistent
//      padding, and re-pad to one square with one margin. Two bottles shot at
//      different distances end up the same size on the shelf.
//   2. Reject — a photo on a dark or busy ground, a thumbnail too small to
//      enlarge, or a near-empty frame does not become a catalog image. Letting
//      one through costs more than leaving the product with no photo, because
//      the missing photo degrades gracefully and the wrong one does not.

import sharp, { type Metadata, type OutputInfo, type Sharp } from "sharp";

/** The square every catalog image ends up as. */
const OUTPUT_SIZE = 800;

/**
 * White margin inside that square, as a fraction of the side. Bottles are tall
 * and filters are squat; a shared margin is what stops the tall ones from
 * looking closer to the camera than the squat ones.
 */
const MARGIN = 0.06;

/**
 * Below this, enlarging to 800px would show the enlargement. WooCommerce
 * thumbnails come in around 300px and there are some genuinely tiny ones.
 */
const MIN_SOURCE_SIZE = 400;

/**
 * How light the frame's border has to be, mean 0-255, to count as a
 * white-ground shot. 236 rather than 250 because JPEG ringing and a soft
 * product shadow both pull a genuinely white studio corner down a few points.
 */
const MIN_BORDER_LUMINANCE = 236;

/** Distance from pure white that `trim` treats as background. */
const TRIM_THRESHOLD = 12;

/**
 * Least per-channel standard deviation a frame with a product in it can have.
 * A blank white square scores 0; a pale bottle photographed on white still runs
 * well into double figures, because an outline is contrast even when the fill
 * is not.
 */
const MIN_CONTRAST = 2;

/**
 * How much of the shorter side a trimmed subject must still span.
 *
 * This started out as a minimum *area* and was wrong twice over. `trim` works
 * inward from the edges until it meets a non-background pixel, so it cannot cut
 * into a subject — the failure it actually has to catch is the opposite one, a
 * near-white product on white where the only thing trim finds is a shadow or a
 * label, and the "subject" comes back as a sliver. An area floor high enough to
 * catch that also threw out a small product honestly photographed in a roomy
 * frame, which is a normal WooCommerce shot: a 200px bottle on an 800px canvas
 * is 6% of the area and perfectly usable.
 *
 * A linear floor separates the two. 8% of the shorter side is 64px on an 800px
 * frame — far below any real product, far above any sliver.
 */
const MIN_TRIM_SIDE_FRACTION = 0.08;

export class NotACatalogImageError extends Error {}

/** Mean luminance of a 1-pixel-thick border, which is the cheapest test for "shot on white". */
async function borderLuminance(image: Sharp): Promise<number> {
  const { data, info } = await image
    .clone()
    .removeAlpha()
    .resize(64, 64, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  let total = 0;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        total += data[y * width + x];
        count += 1;
      }
    }
  }
  return total / count;
}

export interface NormalizedImage {
  webp: Buffer;
  /** What the border test measured, so a run can report near-misses rather than just counts. */
  borderLuminance: number;
  sourceWidth: number;
  sourceHeight: number;
}

/**
 * Normalises `input`, or throws `NotACatalogImageError` with a reason a person
 * can act on.
 */
export async function normalizeProductImage(input: Buffer): Promise<NormalizedImage> {
  let image: Sharp;
  let metadata: Metadata;
  try {
    image = sharp(input, { failOn: "error" });
    metadata = await image.metadata();
  } catch (error) {
    throw new NotACatalogImageError(
      `not a readable image (${error instanceof Error ? error.message : String(error)})`,
    );
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width < MIN_SOURCE_SIZE || height < MIN_SOURCE_SIZE) {
    throw new NotACatalogImageError(
      `too small at ${width}x${height} — enlarging to ${OUTPUT_SIZE}px would show`,
    );
  }

  // Flatten first: a transparent PNG's border is transparent, not white, and
  // would fail the luminance test for the wrong reason.
  const flattened = image.clone().flatten({ background: "#ffffff" });

  // Is there anything in the frame at all? Asked directly, because `trim` will
  // not answer it: sharp 0.35 hands an entirely blank image back at its full
  // size rather than throwing, so "trim removed nothing" reads identically to
  // "there was no padding to remove". Standard deviation has no such ambiguity
  // — a frame holding a product has edges, and a white rectangle does not.
  const stats = await flattened.clone().stats();
  const contrast = Math.max(...stats.channels.map((channel) => channel.stdev));
  if (contrast < MIN_CONTRAST) {
    throw new NotACatalogImageError(
      `the frame is blank — contrast ${contrast.toFixed(1)} of a required ${MIN_CONTRAST}`,
    );
  }

  const luminance = await borderLuminance(flattened);
  if (luminance < MIN_BORDER_LUMINANCE) {
    throw new NotACatalogImageError(
      `not shot on white — border luminance ${luminance.toFixed(0)} of a required ` +
        `${MIN_BORDER_LUMINANCE}`,
    );
  }

  // Trim the source's own padding, so the margin added below is the only margin
  // in the final image and every product lands at the same scale.
  let trimmed: { data: Buffer; info: OutputInfo };
  try {
    trimmed = await flattened
      .clone()
      .trim({ background: "#ffffff", threshold: TRIM_THRESHOLD })
      .toBuffer({ resolveWithObject: true });
  } catch {
    // sharp throws when trim would consume the whole image — an all-white frame.
    throw new NotACatalogImageError("trimmed to nothing — the frame is blank");
  }

  const minSide = Math.round(Math.min(width, height) * MIN_TRIM_SIDE_FRACTION);
  if (trimmed.info.width < minSide || trimmed.info.height < minSide) {
    throw new NotACatalogImageError(
      `subject is only ${trimmed.info.width}x${trimmed.info.height} after trimming a ` +
        `${width}x${height} frame — blank, or lost against its own background`,
    );
  }
  const subject = sharp(trimmed.data);

  // ONE resize call, then one extend. sharp keeps a single resize operation per
  // pipeline, so a second `.resize()` silently replaces the first rather than
  // running after it — chaining "fit to the inner box" and "pad to the outer
  // box" as two resizes produced 896px squares instead of 800px ones.
  //
  // `fit: "contain"` squares the subject up inside the inner box, so the fixed
  // margin below lands exactly on OUTPUT_SIZE whatever shape the subject was.
  const margin = Math.round(OUTPUT_SIZE * MARGIN);
  const inner = OUTPUT_SIZE - 2 * margin;
  const webp = await subject
    .resize(inner, inner, { fit: "contain", background: "#ffffff" })
    .extend({ top: margin, bottom: margin, left: margin, right: margin, background: "#ffffff" })
    .webp({ quality: 82 })
    .toBuffer();

  return { webp, borderLuminance: luminance, sourceWidth: width, sourceHeight: height };
}
