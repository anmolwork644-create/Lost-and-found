import {
  archiveExpiredListings as archiveExpiredListingsService,
  getAdminOverview,
  listAdminClaims,
  listAdminListings,
  listAdminReports,
  listAdminUsers,
  listAuditLogs,
  moderateClaim as moderateClaimService,
  moderateListing as moderateListingService,
  moderateUser as moderateUserService,
  reviewReport as reviewReportService,
} from "../services/admin.service.js";
import { HttpError } from "../utils/http-error.js";
import { claimIdSchema } from "../validators/claim.validators.js";
import { itemIdSchema } from "../validators/item.validators.js";

const objectId = /^[a-f\d]{24}$/i;
function id(value, type = "resource") {
  const schema = type === "item" ? itemIdSchema : type === "claim" ? claimIdSchema : objectId;
  const valid = typeof value === "string" && (schema instanceof RegExp ? schema.test(value) : schema.safeParse(value).success);
  if (!valid) throw new HttpError(400, `${type} ID is invalid.`, `INVALID_${type.toUpperCase()}_ID`);
  return value;
}

export async function overview(_req, res) { res.json({ overview: await getAdminOverview() }); }
export async function listings(req, res) { res.json(await listAdminListings(req.validatedQuery)); }
export async function reports(_req, res) { res.json({ reports: await listAdminReports() }); }
export async function users(req, res) { res.json(await listAdminUsers(req.validatedQuery)); }
export async function claims(req, res) { res.json(await listAdminClaims(req.validatedQuery)); }
export async function audit(req, res) { res.json(await listAuditLogs(req.validatedQuery.page, req.validatedQuery.limit)); }

export async function moderateListing(req, res) {
  res.json({ item: await moderateListingService(id(req.params.itemId, "item"), req.user, req.validatedBody.action, req.validatedBody.reason) });
}
export async function archiveExpired(req, res) {
  res.json(await archiveExpiredListingsService(req.user, req.validatedBody.before));
}
export async function reviewReport(req, res) {
  res.json({ report: await reviewReportService(id(req.params.reportId), req.user, req.validatedBody.status, req.validatedBody.note) });
}
export async function moderateUser(req, res) {
  res.json({ user: await moderateUserService(id(req.params.userId), req.user, req.validatedBody.status, req.validatedBody.reason) });
}
export async function moderateClaim(req, res) {
  res.json({ claim: await moderateClaimService(id(req.params.claimId, "claim"), req.user, req.validatedBody.action, req.validatedBody.reason) });
}
