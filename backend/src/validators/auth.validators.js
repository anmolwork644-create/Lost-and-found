import { z } from "zod";

const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
const password = z
  .string()
  .min(10)
  .max(72)
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Password must be at most 72 bytes.");

export const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email,
    password,
    role: z.enum(["student", "staff"]).default("student"),
  })
  .strict();

export const loginSchema = z
  .object({
    email,
    password: z
      .string()
      .min(1)
      .max(72)
      .refine(
        (value) => Buffer.byteLength(value, "utf8") <= 72,
        "Password must be at most 72 bytes.",
      ),
  })
  .strict();
export const verifySchema = z.object({ token: z.string().min(32).max(200) }).strict();
export const resendSchema = z.object({ email }).strict();
