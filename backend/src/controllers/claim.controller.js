import {
  cancelClaim as cancelClaimService,
  completeClaim as completeClaimService,
  decideClaim as decideClaimService,
  getClaimPrompt as getClaimPromptService,
  listReceivedClaims,
  listSubmittedClaims,
  markNotificationRead as markNotificationReadService,
  listNotifications as listNotificationsService,
  unreadNotificationCount,
  submitClaim as submitClaimService,
} from "../services/claim.service.js";
import { HttpError } from "../utils/http-error.js";
import { claimIdSchema } from "../validators/claim.validators.js";

function parseId(id, label = "Claim") {
  const parsed = claimIdSchema.safeParse(id);
  if (!parsed.success) throw new HttpError(400, `${label} ID is invalid.`, `INVALID_${label.toUpperCase()}_ID`);
  return parsed.data;
}

export async function getClaimPrompt(req, res) {
  const prompt = await getClaimPromptService(req.item, req.user);
  res.json({ prompt });
}

export async function createClaim(req, res) {
  const claim = await submitClaimService(req.item, req.validatedBody, req.user);
  res.status(201).json({ claim });
}

export async function submittedClaims(req, res) {
  res.json(await listSubmittedClaims(req.user, req.validatedQuery));
}

export async function receivedClaims(req, res) {
  res.json(await listReceivedClaims(req.user, req.validatedQuery));
}

export async function decideClaim(req, res) {
  const claim = await decideClaimService(
    parseId(req.params.claimId),
    req.user,
    req.validatedBody.action,
    req.validatedBody.note,
  );
  res.json({ claim });
}

export async function cancelClaim(req, res) {
  res.json({ claim: await cancelClaimService(parseId(req.params.claimId), req.user) });
}

export async function completeClaim(req, res) {
  res.json({ claim: await completeClaimService(parseId(req.params.claimId), req.user) });
}

export async function notifications(req, res) {
  res.json({ notifications: await listNotificationsService(req.user) });
}

export async function unreadNotifications(req, res) {
  res.json({ count: await unreadNotificationCount(req.user) });
}

export async function markNotificationRead(req, res) {
  res.json({ notification: await markNotificationReadService(parseId(req.params.notificationId, "Notification"), req.user) });
}
