import { env } from "../config/env.js";

const localDevelopmentOrigin = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/;

export function isAllowedOrigin(origin) {
  if (origin === env.CLIENT_ORIGIN) return true;
  return env.NODE_ENV !== "production" && localDevelopmentOrigin.test(origin ?? "");
}
