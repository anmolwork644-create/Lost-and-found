import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import {
  adminAccess,
  login,
  logout,
  me,
  refresh,
  register,
  resend,
  verify,
} from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { requireSameOrigin } from "../middleware/same-origin.js";
import { requireDatabase } from "../middleware/require-database.js";
import { validateBody } from "../middleware/validate-body.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  loginSchema,
  registerSchema,
  resendSchema,
  verifySchema,
} from "../validators/auth.validators.js";

const router = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: {
      code: "AUTH_RATE_LIMITED",
      message: "Too many authentication attempts. Try again later.",
    },
  },
});
const sessionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
const verificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

router.use(requireSameOrigin);
router.post(
  "/register",
  authLimiter,
  validateBody(registerSchema),
  requireDatabase,
  asyncHandler(register),
);
router.post("/login", authLimiter, validateBody(loginSchema), requireDatabase, asyncHandler(login));
router.post("/refresh", sessionLimiter, requireDatabase, asyncHandler(refresh));
router.post("/logout", sessionLimiter, asyncHandler(logout));
router.get("/me", requireDatabase, authenticate, me);
router.post(
  "/verify-email",
  verificationLimiter,
  validateBody(verifySchema),
  requireDatabase,
  asyncHandler(verify),
);
router.post(
  "/verification/resend",
  verificationLimiter,
  validateBody(resendSchema),
  requireDatabase,
  asyncHandler(resend),
);
router.get("/admin/access", requireDatabase, authenticate, authorize("admin"), adminAccess);

export default router;
