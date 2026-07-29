import { z } from "zod";

export const settingsSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().min(1).max(2000),
});

export type SettingsInput = z.infer<typeof settingsSchema>;
