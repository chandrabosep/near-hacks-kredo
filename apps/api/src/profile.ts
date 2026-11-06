/** What a company and its apps can say about themselves. Shown in the directory and on the connect page. */
import { z } from "zod";

export const CATEGORIES = ["ai", "media", "audio", "developer", "games", "productivity", "other"] as const;

const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .url()
  .refine((u) => /^https?:\/\//.test(u), "Use an http(s) link")
  .optional();

/** Empty strings from a form mean "not set". */
const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const companySchema = z.object({
  name: z.string().trim().min(2).max(80),
  logoUrl: z.preprocess(blankToUndefined, optionalUrl),
  website: z.preprocess(blankToUndefined, optionalUrl),
  category: z.preprocess(blankToUndefined, z.enum(CATEGORIES).optional()),
  supportEmail: z.preprocess(blankToUndefined, z.string().trim().toLowerCase().email().max(120).optional()),
});

export const appProfileSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.preprocess(blankToUndefined, z.string().trim().max(280).optional()),
  logoUrl: z.preprocess(blankToUndefined, optionalUrl),
  website: z.preprocess(blankToUndefined, optionalUrl),
  category: z.preprocess(blankToUndefined, z.enum(CATEGORIES).optional()),
});

export type CompanyInput = z.infer<typeof companySchema>;
export type AppProfileInput = z.infer<typeof appProfileSchema>;
