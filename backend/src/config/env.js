import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(5000),
    CLIENT_ORIGIN: z
      .string()
      .url()
      .transform((value) => new URL(value).origin)
      .default("http://localhost:8080"),
    TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(0),
    MONGODB_URI: z.string().optional(),
    MONGODB_DB: z.string().trim().min(1).default("campusfind"),
    UPLOAD_DIR: z.string().trim().min(1).default("uploads"),
    JWT_SECRET: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(32).optional(),
    ),
    ACCESS_TOKEN_TTL: z
      .string()
      .regex(/^\d+(s|m|h|d)$/)
      .default("15m"),
    REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().max(90).default(7),
    COLLEGE_EMAIL_DOMAINS: z.string().default(""),
    EMAIL_VERIFICATION_REQUIRED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === "production" && !value.JWT_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["JWT_SECRET"],
        message: "JWT_SECRET is required in production.",
      });
    }
    if (value.NODE_ENV === "production" && !value.MONGODB_URI) {
      ctx.addIssue({
        code: "custom",
        path: ["MONGODB_URI"],
        message: "MONGODB_URI is required in production.",
      });
    } else if (
      value.NODE_ENV === "production" &&
      !/^mongodb(?:\+srv)?:\/\//i.test(value.MONGODB_URI ?? "")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["MONGODB_URI"],
        message: "MONGODB_URI must use a MongoDB connection string in production.",
      });
    }
    if (value.NODE_ENV === "production" && new URL(value.CLIENT_ORIGIN).protocol !== "https:") {
      ctx.addIssue({
        code: "custom",
        path: ["CLIENT_ORIGIN"],
        message: "CLIENT_ORIGIN must use HTTPS in production.",
      });
    }
    if (value.SMTP_USER && !value.SMTP_PASSWORD) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_PASSWORD"],
        message: "SMTP_PASSWORD is required when SMTP_USER is set.",
      });
    }
    if (value.EMAIL_VERIFICATION_REQUIRED && (!value.SMTP_HOST || !value.EMAIL_FROM)) {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_VERIFICATION_REQUIRED"],
        message: "Email verification needs SMTP_HOST and EMAIL_FROM.",
      });
    }
  });

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
