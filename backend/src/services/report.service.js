import { Report } from "../models/Report.js";
import { HttpError } from "../utils/http-error.js";

export async function createListingReport(item, input, user) {
  if (String(item.reporterId) === String(user._id)) {
    throw new HttpError(400, "You cannot report your own listing.", "SELF_REPORT_NOT_ALLOWED");
  }
  if (["removed", "archived"].includes(item.status)) {
    throw new HttpError(404, "Listing was not found.", "LISTING_NOT_FOUND");
  }
  try {
    const report = await Report.create({
      itemId: item._id,
      reporterId: user._id,
      reason: input.reason,
      details: input.details || undefined,
    });
    return { id: String(report._id), status: report.status };
  } catch (error) {
    if (error?.code === 11000) {
      throw new HttpError(409, "You have already reported this listing.", "DUPLICATE_REPORT");
    }
    throw error;
  }
}
