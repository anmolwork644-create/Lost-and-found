import { Router } from "express";
import {
  archiveExpired,
  audit,
  claims,
  listings,
  moderateClaim,
  moderateListing,
  moderateUser,
  overview,
  reports,
  reviewReport,
  users,
} from "../controllers/admin.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { requireDatabase } from "../middleware/require-database.js";
import { requireSameOrigin } from "../middleware/same-origin.js";
import { validateBody } from "../middleware/validate-body.js";
import { validateQuery } from "../middleware/validate.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  adminClaimsQuerySchema,
  adminListingsQuerySchema,
  adminUsersQuerySchema,
  archiveExpiredSchema,
  auditQuerySchema,
  claimModerationSchema,
  listingModerationSchema,
  reportReviewSchema,
  userModerationSchema,
} from "../validators/moderation.validators.js";

const router = Router();
router.use(requireDatabase, authenticate, authorize("admin"));
router.get("/overview", asyncHandler(overview));
router.get("/listings", validateQuery(adminListingsQuerySchema), asyncHandler(listings));
router.patch("/listings/:itemId/action", requireSameOrigin, validateBody(listingModerationSchema), asyncHandler(moderateListing));
router.post("/listings/archive-expired", requireSameOrigin, validateBody(archiveExpiredSchema), asyncHandler(archiveExpired));
router.get("/reports", asyncHandler(reports));
router.patch("/reports/:reportId", requireSameOrigin, validateBody(reportReviewSchema), asyncHandler(reviewReport));
router.get("/users", validateQuery(adminUsersQuerySchema), asyncHandler(users));
router.patch("/users/:userId/status", requireSameOrigin, validateBody(userModerationSchema), asyncHandler(moderateUser));
router.get("/claims", validateQuery(adminClaimsQuerySchema), asyncHandler(claims));
router.patch("/claims/:claimId/action", requireSameOrigin, validateBody(claimModerationSchema), asyncHandler(moderateClaim));
router.get("/audit", validateQuery(auditQuerySchema), asyncHandler(audit));

export default router;
