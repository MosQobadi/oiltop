import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

export class InvalidFileError extends Error {}

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

// `file.type` is just the client-supplied Content-Type of the multipart part
// and is trivially spoofable, so it's only used to pick the expected
// extension — the actual format is confirmed by sniffing the file's magic
// bytes below before anything is written to disk.
const MAGIC_BYTE_CHECKS: Record<string, (buffer: Buffer) => boolean> = {
  "image/jpeg": (buffer) =>
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff,
  "image/png": (buffer) =>
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/gif": (buffer) =>
    buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "GIF8",
  "image/webp": (buffer) =>
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP",
};

// Shared by every admin form using ImageUploadField (Categories, Brands,
// Products, Car Brands, ...) — not resource-specific.
export async function saveUploadedImage(file: File): Promise<string> {
  const ext = ALLOWED_MIME_TYPES[file.type];
  if (!ext) {
    throw new InvalidFileError("Only JPEG, PNG, WEBP, or GIF images are allowed");
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new InvalidFileError("Image must be smaller than 5MB");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!MAGIC_BYTE_CHECKS[file.type]!(buffer)) {
    throw new InvalidFileError("File content does not match a valid image format");
  }

  const filename = `${randomUUID()}${ext}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);

  return `/uploads/${filename}`;
}
