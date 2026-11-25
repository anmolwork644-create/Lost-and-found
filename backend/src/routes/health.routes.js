import { Router } from "express";
import { z } from "zod";
import { databaseStatus } from "../config/database.js";
import { validateQuery } from "../middleware/validate.js";

const router = Router();
const healthQuery = z.object({ detail: z.enum(["basic", "full"]).optional() }).strict();

router.get("/", validateQuery(healthQuery), (req, res) => {
  const response = { status: "ok", service: "campusfind-api", timestamp: new Date().toISOString() };
  if (req.validatedQuery.detail === "full") response.database = databaseStatus();
  res.status(200).json(response);
});

router.get("/ready", (_req, res) => {
  const database = databaseStatus();
  const ready = database === "connected";
  res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready", database });
});

export default router;
