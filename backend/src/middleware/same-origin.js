import { HttpError } from "../utils/http-error.js";
import { isAllowedOrigin } from "./origin-policy.js";

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function requireSameOrigin(req, _res, next) {
  const origin = req.get("origin");
  if (unsafeMethods.has(req.method) && !isAllowedOrigin(origin)) {
    return next(new HttpError(403, "Request origin is not allowed.", "CSRF_ORIGIN_REJECTED"));
  }
  next();
}
