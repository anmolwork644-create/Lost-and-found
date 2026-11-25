import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { Session } from "../models/Session.js";
import { User } from "../models/User.js";
import { HttpError } from "../utils/http-error.js";

export async function authenticate(req, _res, next) {
  try {
    if (!env.JWT_SECRET)
      throw new HttpError(
        503,
        "Authentication is not configured on this server.",
        "AUTH_NOT_CONFIGURED",
      );
    const token = req.cookies?.campusfind_access;
    if (!token) throw new HttpError(401, "Sign in to continue.", "AUTH_REQUIRED");
    const payload = jwt.verify(token, env.JWT_SECRET, {
      issuer: "campusfind-api",
      audience: "campusfind-web",
    });
    const [user, session] = await Promise.all([
      User.findById(payload.sub),
      Session.findOne({ _id: payload.sid, userId: payload.sub, expiresAt: { $gt: new Date() } }),
    ]);
    if (
      !user ||
      user.status !== "active" ||
      !session ||
      (env.EMAIL_VERIFICATION_REQUIRED && !user.emailVerifiedAt)
    ) {
      throw new HttpError(401, "Session is no longer valid.", "SESSION_INVALID");
    }
    req.user = user;
    req.auth = { sessionId: String(session._id) };
    next();
  } catch (error) {
    if (error?.name === "JsonWebTokenError" || error?.name === "TokenExpiredError")
      return next(new HttpError(401, "Session expired. Please sign in again.", "SESSION_EXPIRED"));
    next(error);
  }
}

export async function optionalAuthenticate(req, _res, next) {
  const token = req.cookies?.campusfind_access;
  if (!token || !env.JWT_SECRET) return next();

  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      issuer: "campusfind-api",
      audience: "campusfind-web",
    });
    const [user, session] = await Promise.all([
      User.findById(payload.sub),
      Session.findOne({ _id: payload.sid, userId: payload.sub, expiresAt: { $gt: new Date() } }),
    ]);
    if (
      user?.status === "active" &&
      session &&
      (!env.EMAIL_VERIFICATION_REQUIRED || user.emailVerifiedAt)
    ) {
      req.user = user;
      req.auth = { sessionId: String(session._id) };
    }
    next();
  } catch (error) {
    if (error?.name === "JsonWebTokenError" || error?.name === "TokenExpiredError") return next();
    next(error);
  }
}
