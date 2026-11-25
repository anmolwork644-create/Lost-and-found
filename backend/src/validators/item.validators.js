import { z } from "zod";

const categories = [
  "ID Card",
  "Accessories",
  "Book",
  "Notebook",
  "Wallet",
  "Keys",
  "Charger",
  "Water Bottle",
  "Other",
];
const locations = [
  "Library",
  "Library Entrance",
  "Canteen",
  "Hostel",
  "Main Gate",
  "Classroom Block",
  "Sports Ground",
  "Other",
];

const itemFields = {
  name: z.string().trim().min(2).max(120),
  category: z.enum(categories),
  description: z.string().trim().min(3).max(2000),
  location: z.enum(locations),
  itemDate: z.iso.date(),
  privateContact: z.string().trim().min(3).max(200),
  verificationQuestion: z.string().trim().max(250).optional().or(z.literal("")),
};

export const createItemSchema = z.object(itemFields).strict();
export const updateItemSchema = z
  .object({
    ...Object.fromEntries(
      Object.entries(itemFields).map(([key, schema]) => [key, schema.optional()]),
    ),
    status: z.enum(["open", "closed"]).optional(),
    removeImage: z.enum(["true", "false"]).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");

export const itemQuerySchema = z
  .object({
    type: z.enum(["lost", "found"]).optional(),
    category: z.enum(categories).optional(),
    location: z.enum(locations).optional(),
    status: z.enum(["all", "open", "pending", "returned", "closed"]).default("open"),
    since: z.iso.date().optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    q: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  })
  .strict()
  .refine((value) => !(value.from && value.to) || value.from <= value.to, {
    path: ["to"],
    message: "End date must be on or after start date.",
  });

export const itemIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
