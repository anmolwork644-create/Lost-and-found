import { Router } from "express";
import { markNotificationRead, notifications, unreadNotifications } from "../controllers/claim.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireDatabase } from "../middleware/require-database.js";
import { requireSameOrigin } from "../middleware/same-origin.js";
import { asyncHandler } from "../utils/async-handler.js";

const router = Router();
router.use(requireDatabase, authenticate);
router.get("/", asyncHandler(notifications));
router.get("/unread-count", asyncHandler(unreadNotifications));
router.patch("/:notificationId/read", requireSameOrigin, asyncHandler(markNotificationRead));

export default router;
