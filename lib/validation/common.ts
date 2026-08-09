import { z } from "zod";

// Shared across catalog + car models — lowercase, hyphen-separated URL segment.
export const slugSchema = z
  .string()
  .min(1, "Slug is required")
  .max(160)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers, and hyphens only");

// Shared query-string pagination params for admin list endpoints.
export const pageSchema = z.coerce.number().int().min(1).default(1);
export const pageSizeSchema = z.coerce.number().int().min(1).max(100).default(20);
