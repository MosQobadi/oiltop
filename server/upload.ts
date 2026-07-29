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

  const filename = `${randomUUID()}${ext}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);

  return `/uploads/${filename}`;
}
