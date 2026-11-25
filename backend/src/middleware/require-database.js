import { databaseStatus } from "../config/database.js";
import { HttpError } from "../utils/http-error.js";

export function requireDatabase(_req, _res, next) {
  if (databaseStatus() !== "connected") {
    return next(
      new HttpError(503, "The database is unavailable. Try again shortly.", "DATABASE_UNAVAILABLE"),
    );
  }
  next();
}
