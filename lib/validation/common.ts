import { z } from "zod";

// Shared across catalog + car models — lowercase, hyphen-separated URL segment.
export const slugSchema = z
  .string()
  .min(1, "Slug is required")
  .max(160)
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "Slug must be lowercase letters, numbers, and hyphens only",
  );
