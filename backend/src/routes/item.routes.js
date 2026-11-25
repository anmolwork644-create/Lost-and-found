import { Router } from "express";
import {
  createClaim,
  getClaimPrompt,
} from "../controllers/claim.controller.js";
import {
  createItem,
  createReport,
  deleteItem,
  getItem,
  itemMatches,
  listItems,
  myItems,
  updateItem,
} from "../controllers/item.controller.js";
import { authenticate, optionalAuthenticate } from "../middleware/authenticate.js";
import { authorizeOwnerOrAdmin } from "../middleware/authorize.js";
import { loadItem } from "../middleware/load-item.js";
import { itemImageUpload, validateImageSignature } from "../middleware/item-upload.js";
import { requireDatabase } from "../middleware/require-database.js";
import { requireSameOrigin } from "../middleware/same-origin.js";
import { validateBody } from "../middleware/validate-body.js";
import { validateQuery } from "../middleware/validate.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  createItemSchema,
  itemQuerySchema,
  updateItemSchema,
} from "../validators/item.validators.js";
import { createClaimSchema } from "../validators/claim.validators.js";
import { reportSchema } from "../validators/moderation.validators.js";

const router = Router();

router.use(requireDatabase);
router.get("/", optionalAuthenticate, validateQuery(itemQuerySchema), asyncHandler(listItems));
router.get("/mine", authenticate, asyncHandler(myItems));
router.post(
  "/:type(lost|found)",
  requireSameOrigin,
  authenticate,
  itemImageUpload.single("image"),
  validateImageSignature,
  validateBody(createItemSchema),
  asyncHandler(createItem),
);
router.post(
  "/:id/reports",
  requireSameOrigin,
  authenticate,
  loadItem,
  validateBody(reportSchema),
  asyncHandler(createReport),
);
router.get("/:id/claim-prompt", authenticate, loadItem, asyncHandler(getClaimPrompt));
router.post(
  "/:id/claims",
  requireSameOrigin,
  authenticate,
  loadItem,
  validateBody(createClaimSchema),
  asyncHandler(createClaim),
);
router.get("/:id/matches", optionalAuthenticate, loadItem, asyncHandler(itemMatches));
router.get("/:id", optionalAuthenticate, loadItem, asyncHandler(getItem));
router.patch(
  "/:id",
  requireSameOrigin,
  authenticate,
  loadItem,
  authorizeOwnerOrAdmin((req) => req.item.reporterId),
  itemImageUpload.single("image"),
  validateImageSignature,
  validateBody(updateItemSchema),
  asyncHandler(updateItem),
);
router.delete(
  "/:id",
  requireSameOrigin,
  authenticate,
  loadItem,
  authorizeOwnerOrAdmin((req) => req.item.reporterId),
  asyncHandler(deleteItem),
);

export default router;
