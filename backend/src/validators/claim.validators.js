import { z } from "zod";

export const createClaimSchema = z
  .object({
    contact: z.string().trim().min(3).max(200),
    answer: z.string().trim().min(2).max(2000),
    message: z.string().trim().max(1000).optional().or(z.literal("")),
  })
  .strict();

export const claimDecisionSchema = z
  .object({
    action: z.enum(["approve", "reject"]),
    note: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .strict();

export const claimIdSchema = z.string().regex(/^[a-f\d]{24}$/i);

export const claimListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
