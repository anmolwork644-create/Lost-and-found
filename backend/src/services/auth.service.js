import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { databaseStatus } from "../config/database.js";
import { Session } from "../models/Session.js";
import { User } from "../models/User.js";
import { HttpError } from "../utils/http-error.js";

const ACCESS_COOKIE = "campusfind_access";
const REFRESH_COOKIE = "campusfind_refresh";
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(randomBytes(32).toString("hex"), 12);
const durationMs = (value) => {
  const [, amount, unit] = value.match(/^(\d+)(s|m|h|d)$/);
  return Number(amount) * { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
};
const ACCESS_MAX_AGE = durationMs(env.ACCESS_TOKEN_TTL);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const cookieBase = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: env.NODE_ENV === "production" ? "none" : "lax",
  path: "/api/v1",
};

function assertAuthConfig() {
  if (!env.JWT_SECRET)
    throw new HttpError(
      503,
      "Authentication is not configured on this server.",
      "AUTH_NOT_CONFIGURED",
    );
}

function createAccessToken(user, sessionId) {
  assertAuthConfig();
  return jwt.sign({ sid: sessionId, role: user.role }, env.JWT_SECRET, {
    subject: String(user._id),
    expiresIn: env.ACCESS_TOKEN_TTL,
    issuer: "campusfind-api",
    audience: "campusfind-web",
  });
}

function setCookies(res, accessToken, refreshToken) {
  res.cookie(ACCESS_COOKIE, accessToken, { ...cookieBase, maxAge: ACCESS_MAX_AGE });
  if (refreshToken) {
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...cookieBase,
      maxAge: env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
    });
  }
}

export function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, cookieBase);
  res.clearCookie(REFRESH_COOKIE, cookieBase);
}

export function publicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: Boolean(user.emailVerifiedAt),
    createdAt: user.createdAt,
  };
}

function assertCollegeDomain(email) {
  const domains = env.COLLEGE_EMAIL_DOMAINS.split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
  const domain = email.split("@")[1];
  if (domains.length && !domains.includes(domain))
    throw new HttpError(400, "Use an approved college email address.", "COLLEGE_EMAIL_REQUIRED");
}

async function sendVerificationEmail(user, rawToken) {
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } } : {}),
  });
  const verifyUrl = `${env.CLIENT_ORIGIN}/verify-email?token=${encodeURIComponent(rawToken)}`;
  await transport.sendMail({
    from: env.EMAIL_FROM,
    to: user.email,
    subject: "Verify your CampusFind email",
    text: `Verify your CampusFind account by opening this link: ${verifyUrl}\nThis link expires in 30 minutes.`,
  });
}

async function createVerification(user) {
  const token = randomBytes(32).toString("hex");
  user.emailVerificationHash = hash(token);
  user.emailVerificationExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await user.save();
  await sendVerificationEmail(user, token);
}

function issueAuthCookies(res, user, session, refreshToken) {
  setCookies(res, createAccessToken(user, session._id), refreshToken);
}

export async function registerUser({ name, email, password, role }, res) {
  assertAuthConfig();
  email = email.toLowerCase();
  assertCollegeDomain(email);
  const passwordHash = await bcrypt.hash(password, 12);
  let user;
  try {
    user = await User.create({
      name,
      email,
      passwordHash,
      role,
      emailVerifiedAt: env.EMAIL_VERIFICATION_REQUIRED ? null : new Date(),
    });
  } catch (error) {
    if (error?.code === 11000)
      throw new HttpError(
        409,
        "An account with this email already exists.",
        "EMAIL_ALREADY_REGISTERED",
      );
    throw error;
  }
  if (env.EMAIL_VERIFICATION_REQUIRED) {
    await createVerification(user);
  } else if (res) {
    const refreshToken = randomBytes(48).toString("base64url");
    const session = await Session.create({
      userId: user._id,
      refreshTokenHash: hash(refreshToken),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
    });
    issueAuthCookies(res, user, session, refreshToken);
  }
  return { user, verificationRequired: env.EMAIL_VERIFICATION_REQUIRED };
}

export async function verifyEmail(token) {
  const user = await User.findOne({
    emailVerificationHash: hash(token),
    emailVerificationExpiresAt: { $gt: new Date() },
  }).select("+emailVerificationHash +emailVerificationExpiresAt");
  if (!user)
    throw new HttpError(
      400,
      "Verification link is invalid or expired.",
      "INVALID_VERIFICATION_TOKEN",
    );
  user.emailVerifiedAt = new Date();
  user.emailVerificationHash = undefined;
  user.emailVerificationExpiresAt = undefined;
  await user.save();
}

export async function resendVerification(email) {
  if (!env.EMAIL_VERIFICATION_REQUIRED) return;
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || user.emailVerifiedAt) return;
  await createVerification(user);
}

export async function loginUser({ email, password }, res) {
  assertAuthConfig();
  const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash");
  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !passwordMatches)
    throw new HttpError(401, "Email or password is incorrect.", "INVALID_CREDENTIALS");
  if (user.status !== "active")
    throw new HttpError(403, "This account is unavailable.", "ACCOUNT_UNAVAILABLE");
  if (env.EMAIL_VERIFICATION_REQUIRED && !user.emailVerifiedAt)
    throw new HttpError(403, "Verify your college email before signing in.", "EMAIL_NOT_VERIFIED");

  const refreshToken = randomBytes(48).toString("base64url");
  const session = await Session.create({
    userId: user._id,
    refreshTokenHash: hash(refreshToken),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
  });
  issueAuthCookies(res, user, session, refreshToken);
  return publicUser(user);
}

export async function refreshSession(req, res) {
  assertAuthConfig();
  const rawToken = req.cookies?.[REFRESH_COOKIE];
  if (!rawToken) throw new HttpError(401, "Sign in to continue.", "AUTH_REQUIRED");
  const oldHash = hash(rawToken);
  const session = await Session.findOne({
    refreshTokenHash: oldHash,
    expiresAt: { $gt: new Date() },
  }).select("+refreshTokenHash");
  if (!session) {
    clearAuthCookies(res);
    throw new HttpError(401, "Session expired. Please sign in again.", "SESSION_EXPIRED");
  }
  const user = await User.findById(session.userId);
  if (
    !user ||
    user.status !== "active" ||
    (env.EMAIL_VERIFICATION_REQUIRED && !user.emailVerifiedAt)
  ) {
    await Session.deleteOne({ _id: session._id });
    clearAuthCookies(res);
    throw new HttpError(401, "Session is no longer valid.", "SESSION_INVALID");
  }
  const refreshToken = randomBytes(48).toString("base64url");
  const rotated = await Session.findOneAndUpdate(
    { _id: session._id, refreshTokenHash: oldHash, expiresAt: { $gt: new Date() } },
    {
      $set: {
        refreshTokenHash: hash(refreshToken),
        expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
      },
    },
    { new: true },
  );
  if (!rotated)
    throw new HttpError(401, "Session expired. Please sign in again.", "SESSION_EXPIRED");
  issueAuthCookies(res, user, rotated, refreshToken);
  return publicUser(user);
}

export async function logoutSession(req) {
  const refreshToken = req.cookies?.[REFRESH_COOKIE];
  const sessionId = req.auth?.sessionId;
  if (!refreshToken && !sessionId) return;
  if (databaseStatus() !== "connected") {
    throw new HttpError(
      503,
      "The database is unavailable. Your browser session was cleared, but server-side revocation could not be confirmed.",
      "DATABASE_UNAVAILABLE",
    );
  }
  if (refreshToken) await Session.deleteOne({ refreshTokenHash: hash(refreshToken) });
  else await Session.deleteOne({ _id: sessionId });
}
