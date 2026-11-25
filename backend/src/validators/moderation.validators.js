import { z } from "zod";

export const reportSchema = z.object({
  reason: z.enum(["inappropriate", "misleading", "duplicate", "private_information", "other"]),
  details: z.string().trim().max(1000).optional().or(z.literal("")),
}).strict();

export const reportReviewSchema = z.object({
  status: z.enum(["reviewed", "dismissed"]),
  note: z.string().trim().max(500).optional().or(z.literal("")),
}).strict();

export const listingModerationSchema = z.object({
  action: z.enum(["close", "remove", "archive", "restore"]),
  reason: z.string().trim().min(3).max(500),
}).strict();

export const userModerationSchema = z.object({
  status: z.enum(["active", "suspended"]),
  reason: z.string().trim().min(3).max(500),
}).strict();

export const claimModerationSchema = z.object({
  action: z.enum(["reject", "revoke"]),
  reason: z.string().trim().min(3).max(500),
}).strict();

export const adminListingsQuerySchema = z.object({
  status: z.enum(["all", "open", "pending", "returned", "closed", "archived", "removed"]).default("all"),
  type: z.enum(["lost", "found"]).optional(),
  q: z.string().trim().max(100).optional(),
  reported: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export const adminUsersQuerySchema = z.object({
  status: z.enum(["all", "active", "suspended"]).default("all"),
  role: z.enum(["all", "student", "staff", "admin"]).default("all"),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export const adminClaimsQuerySchema = z.object({
  status: z.enum(["all", "pending", "approved", "rejected", "cancelled", "completed"]).default("all"),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export const archiveExpiredSchema = z.object({ before: z.iso.date().optional() }).strict();
export const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();
