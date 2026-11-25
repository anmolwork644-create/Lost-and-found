import { HttpError } from "../utils/http-error.js";

export function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, "Sign in to continue.", "AUTH_REQUIRED"));
    if (!roles.includes(req.user.role))
      return next(new HttpError(403, "You do not have permission to do that.", "FORBIDDEN"));
    next();
  };
}

export function authorizeOwnerOrAdmin(getOwnerId) {
  return async (req, _res, next) => {
    try {
      if (!req.user) throw new HttpError(401, "Sign in to continue.", "AUTH_REQUIRED");
      if (req.user.role === "admin") return next();
      const ownerId = await getOwnerId(req);
      if (!ownerId || String(ownerId) !== String(req.user._id))
        throw new HttpError(
          403,
          "You do not have permission to change this resource.",
          "FORBIDDEN",
        );
      next();
    } catch (error) {
      next(error);
    }
  };
}
