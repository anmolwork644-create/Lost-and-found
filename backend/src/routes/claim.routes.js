import { Router } from "express";
import {
  cancelClaim,
  completeClaim,
  decideClaim,
  receivedClaims,
  submittedClaims,
} from "../controllers/claim.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireDatabase } from "../middleware/require-database.js";
import { requireSameOrigin } from "../middleware/same-origin.js";
import { validateBody } from "../middleware/validate-body.js";
import { validateQuery } from "../middleware/validate.js";
import { asyncHandler } from "../utils/async-handler.js";
import { claimDecisionSchema, claimListQuerySchema } from "../validators/claim.validators.js";

const router = Router();
router.use(requireDatabase, authenticate);
router.get("/submitted", validateQuery(claimListQuerySchema), asyncHandler(submittedClaims));
router.get("/received", validateQuery(claimListQuerySchema), asyncHandler(receivedClaims));
router.patch("/:claimId/decision", requireSameOrigin, validateBody(claimDecisionSchema), asyncHandler(decideClaim));
router.post("/:claimId/cancel", requireSameOrigin, asyncHandler(cancelClaim));
router.post("/:claimId/complete", requireSameOrigin, asyncHandler(completeClaim));

export default router;
