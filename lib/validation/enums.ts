import { z } from "zod";

// Mirrors the enums in prisma/schema.prisma. Kept as plain Zod enums (not
// imported from lib/generated/prisma) so the validation layer doesn't depend
// on generated output — update both places together if an enum changes.

export const userRoleSchema = z.enum(["ADMIN", "CUSTOMER"]);
export const userStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);
export const partTypeSchema = z.enum(["ENGINE_OIL", "FILTER", "ACCESSORY", "OTHER"]);
export const filterKindSchema = z.enum(["OIL_FILTER", "AIR_FILTER", "CABIN_FILTER", "FUEL_FILTER"]);
export const categoryStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);
export const brandStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);
export const productStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);
export const carBrandStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);
export const carModelStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);
export const carEngineStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);
export const fuelTypeSchema = z.enum(["PETROL", "DIESEL", "HYBRID", "ELECTRIC", "LPG_CNG"]);
export const fitmentClimateSchema = z.enum(["STANDARD", "HOT", "COLD"]);
export const fitmentInquiryStatusSchema = z.enum(["NEW", "CONTACTED", "RESOLVED"]);
export const orderStatusSchema = z.enum(["PENDING", "SENDING", "SENT", "DELIVERED", "CANCELLED"]);
export const paymentStatusSchema = z.enum(["UNPAID", "PAID", "REFUNDED"]);
