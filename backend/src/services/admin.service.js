import mongoose from "mongoose";
import { deleteItemImage } from "../config/uploads.js";
import { AuditLog } from "../models/AuditLog.js";
import { Claim } from "../models/Claim.js";
import { Item } from "../models/Item.js";
import { Notification } from "../models/Notification.js";
import { Report } from "../models/Report.js";
import { Session } from "../models/Session.js";
import { User } from "../models/User.js";
import { HttpError } from "../utils/http-error.js";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const idValue = (value) => String(value?._id ?? value);

async function audit(actor, action, targetType, targetId, reason, metadata = {}, session) {
  const [entry] = await AuditLog.create([{
    actorId: actor._id,
    action,
    targetType,
    targetId,
    reason,
    metadata,
  }], session ? { session } : undefined);
  return entry;
}

function publicItem(item, reportCount = 0) {
  return {
    id: String(item._id),
    type: item.type,
    name: item.name,
    category: item.category,
    description: item.description,
    location: item.location,
    date: new Date(item.itemDate).toISOString().slice(0, 10),
    image: item.imageUrl,
    status: item.status,
    reporter: item.reporterId?._id
      ? { id: String(item.reporterId._id), name: item.reporterId.name, email: item.reporterId.email }
      : undefined,
    reportCount,
    createdAt: item.createdAt,
  };
}

export async function getAdminOverview() {
  const [totalUsers, totalLostListings, totalFoundListings, totalReturnedItems, pendingClaims, frequentlyReported] = await Promise.all([
    User.countDocuments(),
    Item.countDocuments({ type: "lost", status: { $ne: "removed" } }),
    Item.countDocuments({ type: "found", status: { $ne: "removed" } }),
    Item.countDocuments({ status: "returned" }),
    Claim.countDocuments({ status: "pending" }),
    Report.aggregate([
      { $match: { status: { $in: ["open", "reviewed"] } } },
      { $lookup: { from: "items", localField: "itemId", foreignField: "_id", as: "item" } },
      { $unwind: "$item" },
      { $group: { _id: "$item.category", reports: { $sum: 1 } } },
      { $sort: { reports: -1, _id: 1 } },
      { $limit: 5 },
    ]),
  ]);
  return {
    totalUsers,
    totalLostListings,
    totalFoundListings,
    totalReturnedItems,
    pendingClaims,
    mostReportedCategories: frequentlyReported.map((entry) => ({ category: entry._id, reports: entry.reports })),
  };
}

export async function listAdminListings(filters) {
  const query = {};
  if (filters.status !== "all") query.status = filters.status;
  if (filters.type) query.type = filters.type;
  if (filters.q) {
    const pattern = new RegExp(escapeRegex(filters.q), "i");
    query.$or = [{ name: pattern }, { description: pattern }, { category: pattern }, { location: pattern }];
  }
  if (filters.reported === "true") {
    const reportedIds = await Report.distinct("itemId", { status: "open" });
    query._id = { $in: reportedIds };
  } else if (filters.reported === "false") {
    const reportedIds = await Report.distinct("itemId", { status: "open" });
    query._id = { $nin: reportedIds };
  }
  const skip = (filters.page - 1) * filters.limit;
  const [items, total] = await Promise.all([
    Item.find(query).populate({ path: "reporterId", select: "name email" }).sort({ createdAt: -1 }).skip(skip).limit(filters.limit),
    Item.countDocuments(query),
  ]);
  const ids = items.map((item) => item._id);
  const reportCounts = await Report.aggregate([
    { $match: { itemId: { $in: ids }, status: "open" } },
    { $group: { _id: "$itemId", count: { $sum: 1 } } },
  ]);
  const countByItem = new Map(reportCounts.map((entry) => [String(entry._id), entry.count]));
  return {
    items: items.map((item) => publicItem(item, countByItem.get(String(item._id)) ?? 0)),
    pagination: { page: filters.page, limit: filters.limit, total, pages: Math.ceil(total / filters.limit) },
  };
}

export async function listAdminReports() {
  const reports = await Report.find({ status: "open" })
    .populate({ path: "itemId", select: "name type category description location status" })
    .populate({ path: "reporterId", select: "name email" })
    .sort({ createdAt: -1 })
    .limit(500);
  return reports.map((report) => ({
    id: String(report._id),
    reason: report.reason,
    details: report.details,
    status: report.status,
    createdAt: report.createdAt,
    item: report.itemId ? { id: String(report.itemId._id), name: report.itemId.name, type: report.itemId.type, category: report.itemId.category, description: report.itemId.description, location: report.itemId.location, status: report.itemId.status } : null,
    reporter: report.reporterId ? { id: String(report.reporterId._id), name: report.reporterId.name, email: report.reporterId.email } : null,
  }));
}

export async function reviewReport(reportId, actor, status, note = "") {
  const session = await mongoose.startSession();
  let report;
  try {
    await session.withTransaction(async () => {
      report = await Report.findOneAndUpdate(
        { _id: reportId, status: "open" },
        { $set: { status, reviewedBy: actor._id, reviewedAt: new Date(), reviewNote: note } },
        { new: true, session },
      );
      if (!report) throw new HttpError(404, "Open report was not found.", "REPORT_NOT_FOUND");
      await audit(actor, `report.${status}`, "report", report._id, note, { itemId: String(report.itemId) }, session);
    });
  } finally {
    await session.endSession();
  }
  return { id: String(report._id), status: report.status };
}

export async function moderateListing(itemId, actor, action, reason) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const item = await Item.findById(itemId).select("+imageStorageKey +moderationPreviousStatus").session(session);
      if (!item) throw new HttpError(404, "Listing was not found.", "LISTING_NOT_FOUND");
      if (action === "restore" && !["archived", "removed"].includes(item.status)) {
        throw new HttpError(409, "Only archived or removed listings can be restored.", "LISTING_STATUS_LOCKED");
      }
      const toStatus = action === "restore"
        ? item.moderationPreviousStatus ?? "open"
        : { close: "closed", remove: "removed", archive: "archived" }[action];
      if (["close", "archive"].includes(action) && !["open", "closed"].includes(item.status)) {
        throw new HttpError(409, "This listing has an active claim or is already finalized.", "LISTING_STATUS_LOCKED");
      }
      if (["close", "archive"].includes(action) && await Claim.exists({ itemId: item._id, status: { $in: ["pending", "approved"] } }).session(session)) {
        throw new HttpError(409, "Resolve active claims before closing or archiving this listing.", "ACTIVE_CLAIMS_EXIST");
      }
      const now = new Date();
      if (action === "remove") {
        item.moderationPreviousStatus = ["archived", "removed"].includes(item.status)
          ? item.moderationPreviousStatus ?? "open"
          : item.status === "pending"
            ? "open"
            : item.status;
        const activeClaims = await Claim.find({ itemId: item._id, status: { $in: ["pending", "approved"] } }).session(session);
        if (activeClaims.length) {
          await Claim.updateMany(
            { _id: { $in: activeClaims.map((claim) => claim._id) } },
            { $set: { status: "rejected", ownerDecision: { actorId: actor._id, action: "rejected", note: reason, at: now } }, $push: { decisionHistory: { actorId: actor._id, action: "rejected", note: reason, at: now } } },
            { session },
          );
          await Notification.insertMany(activeClaims.map((claim) => ({
            receiverId: claim.claimantId,
            senderId: actor._id,
            itemId: item._id,
            claimId: claim._id,
            type: "moderation_action",
            message: `A moderator removed “${item.name}”; this claim is closed.`,
          })), { session });
        }
        item.activeClaimId = null;
      }
      if (action === "archive") item.moderationPreviousStatus = item.status;
      item.status = toStatus;
      if (action === "restore") item.moderationPreviousStatus = undefined;
      await item.save({ session });
      await Notification.create([{
        receiverId: item.reporterId,
        senderId: actor._id,
        itemId: item._id,
        type: "moderation_action",
        message: `A moderator ${action === "remove" ? "removed" : action === "close" ? "closed" : action === "archive" ? "archived" : "restored"} your listing “${item.name}”.`,
      }], { session });
      await audit(actor, `listing.${action}`, "listing", item._id, reason, { fromStatus: action === "restore" ? "removed_or_archived" : undefined, toStatus }, session);
      result = { id: String(item._id), status: item.status };
    });
  } finally {
    await session.endSession();
  }
  if (action === "remove") {
    const removed = await Item.findById(itemId).select("+imageStorageKey");
    if (removed?.imageStorageKey) {
      await deleteItemImage(removed.imageStorageKey).catch((error) => console.error("Could not remove moderated listing image:", error.message));
      removed.imageUrl = undefined;
      removed.imageStorageKey = undefined;
      await removed.save();
    }
  }
  return result;
}

export async function archiveExpiredListings(actor, before) {
  const cutoff = before ? new Date(`${before}T23:59:59.999Z`) : new Date(Date.now() - 90 * 86_400_000);
  const activeClaimItemIds = await Claim.distinct("itemId", { status: { $in: ["pending", "approved"] } });
  const expired = await Item.find({ status: { $in: ["open", "closed"] }, itemDate: { $lte: cutoff }, _id: { $nin: activeClaimItemIds } })
    .sort({ itemDate: 1 }).limit(500);
  if (!expired.length) {
    await audit(actor, "listing.archive_expired", "system", actor._id, "Archive expired listings", { archived: 0, before: cutoff.toISOString() });
    return { archived: 0, before: cutoff.toISOString().slice(0, 10) };
  }
  let archivedCount = 0;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const ids = expired.map((item) => item._id);
      const eligible = await Item.find({ _id: { $in: ids }, status: { $in: ["open", "closed"] }, itemDate: { $lte: cutoff } }).session(session);
      if (eligible.length) {
        const archived = await Item.bulkWrite(eligible.map((item) => ({
          updateOne: {
            filter: { _id: item._id, status: item.status, itemDate: { $lte: cutoff } },
            update: { $set: { status: "archived", moderationPreviousStatus: item.status } },
          },
        })), { session });
        archivedCount = archived.modifiedCount;
        await Notification.insertMany(eligible.map((item) => ({
          receiverId: item.reporterId,
          itemId: item._id,
          type: "moderation_action",
          message: `Your listing “${item.name}” was archived because it is expired.`,
        })), { session });
      }
      await audit(actor, "listing.archive_expired", "system", actor._id, "Archive expired listings", { archived: archivedCount, before: cutoff.toISOString() }, session);
    });
  } finally {
    await session.endSession();
  }
  return { archived: archivedCount, before: cutoff.toISOString().slice(0, 10) };
}

export async function listAdminUsers(filters) {
  const query = {};
  if (filters.status !== "all") query.status = filters.status;
  if (filters.role !== "all") query.role = filters.role;
  if (filters.q) {
    const pattern = new RegExp(escapeRegex(filters.q), "i");
    query.$or = [{ name: pattern }, { email: pattern }];
  }
  const skip = (filters.page - 1) * filters.limit;
  const [users, total] = await Promise.all([
    User.find(query).select("name email role status emailVerifiedAt createdAt").sort({ createdAt: -1 }).skip(skip).limit(filters.limit),
    User.countDocuments(query),
  ]);
  const ids = users.map((user) => user._id);
  const [listingCounts, claimCounts] = await Promise.all([
    Item.aggregate([{ $match: { reporterId: { $in: ids } } }, { $group: { _id: "$reporterId", count: { $sum: 1 } } }]),
    Claim.aggregate([{ $match: { claimantId: { $in: ids } } }, { $group: { _id: "$claimantId", count: { $sum: 1 } } }]),
  ]);
  const listingsByUser = new Map(listingCounts.map((entry) => [String(entry._id), entry.count]));
  const claimsByUser = new Map(claimCounts.map((entry) => [String(entry._id), entry.count]));
  return {
    users: users.map((user) => ({ id: String(user._id), name: user.name, email: user.email, role: user.role, status: user.status, emailVerified: Boolean(user.emailVerifiedAt), createdAt: user.createdAt, listingCount: listingsByUser.get(String(user._id)) ?? 0, claimCount: claimsByUser.get(String(user._id)) ?? 0 })),
    pagination: { page: filters.page, limit: filters.limit, total, pages: Math.ceil(total / filters.limit) },
  };
}

export async function moderateUser(userId, actor, status, reason) {
  if (idValue(userId) === idValue(actor._id) && status === "suspended") throw new HttpError(400, "You cannot suspend your own admin account.", "CANNOT_SUSPEND_SELF");
  const session = await mongoose.startSession();
  let user;
  try {
    await session.withTransaction(async () => {
      user = await User.findByIdAndUpdate(userId, { $set: { status } }, { new: true, session }).select("name email role status");
      if (!user) throw new HttpError(404, "User was not found.", "USER_NOT_FOUND");
      if (status === "suspended") await Session.deleteMany({ userId }, { session });
      await Notification.create([{ receiverId: user._id, type: "moderation_action", message: status === "suspended" ? "A moderator suspended your account. Contact campus support if you believe this was a mistake." : "A moderator reactivated your account." }], { session });
      await audit(actor, `user.${status}`, "user", user._id, reason, {}, session);
    });
  } finally {
    await session.endSession();
  }
  return { id: String(user._id), name: user.name, status: user.status };
}

export async function listAdminClaims(filters) {
  const query = {};
  if (filters.status !== "all") query.status = filters.status;
  if (filters.q) {
    const pattern = new RegExp(escapeRegex(filters.q), "i");
    const [claimantIds, itemIds] = await Promise.all([
      User.distinct("_id", { $or: [{ name: pattern }, { email: pattern }] }),
      Item.distinct("_id", { name: pattern }),
    ]);
    query.$or = [{ claimantId: { $in: claimantIds } }, { itemId: { $in: itemIds } }];
  }
  const claims = await Claim.find(query)
    .select("status createdAt ownerDecision decisionHistory itemId claimantId")
    .populate({ path: "itemId", select: "name type category status" })
    .populate({ path: "claimantId", select: "name email status" })
    .sort({ createdAt: -1 }).skip((filters.page - 1) * filters.limit).limit(filters.limit);
  const total = await Claim.countDocuments(query);
  return {
    claims: claims.map((claim) => ({ id: String(claim._id), status: claim.status, createdAt: claim.createdAt, ownerDecision: claim.ownerDecision?.action ? { action: claim.ownerDecision.action, note: claim.ownerDecision.note, at: claim.ownerDecision.at } : undefined, item: claim.itemId ? { id: String(claim.itemId._id), name: claim.itemId.name, type: claim.itemId.type, category: claim.itemId.category, status: claim.itemId.status } : null, claimant: claim.claimantId ? { id: String(claim.claimantId._id), name: claim.claimantId.name, email: claim.claimantId.email, status: claim.claimantId.status } : null })),
    pagination: { page: filters.page, limit: filters.limit, total, pages: Math.ceil(total / filters.limit) },
  };
}

export async function moderateClaim(claimId, actor, action, reason) {
  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      const claim = await Claim.findById(claimId).session(session);
      if (!claim) throw new HttpError(404, "Claim was not found.", "CLAIM_NOT_FOUND");
      const item = await Item.findById(claim.itemId).session(session);
      if (!item) throw new HttpError(404, "Listing was not found.", "LISTING_NOT_FOUND");
      const expected = action === "reject" ? "pending" : "approved";
      if (claim.status !== expected) throw new HttpError(409, `Only ${expected} claims can be moderated with this action.`, "CLAIM_STATUS_CONFLICT");
      if (action === "revoke") {
        const released = await Item.updateOne({ _id: item._id, status: "pending", activeClaimId: claim._id }, { $set: { status: "open", activeClaimId: null } }, { session });
        if (released.modifiedCount !== 1) throw new HttpError(409, "The approved claim no longer controls this listing.", "CLAIM_STATUS_CONFLICT");
      }
      const now = new Date();
      claim.status = "rejected";
      claim.ownerDecision = { actorId: actor._id, action: "rejected", note: reason, at: now };
      claim.decisionHistory.push({ actorId: actor._id, action: "rejected", note: reason, at: now });
      await claim.save({ session });
      await Notification.insertMany([
        { receiverId: claim.claimantId, senderId: actor._id, itemId: item._id, claimId: claim._id, type: "moderation_action", message: `A moderator reviewed and declined your claim for “${item.name}”.` },
        { receiverId: item.reporterId, senderId: actor._id, itemId: item._id, claimId: claim._id, type: "moderation_action", message: `A moderator took action on a claim for your listing “${item.name}”.` },
      ], { session });
      await audit(actor, `claim.${action}`, "claim", claim._id, reason, { itemId: String(item._id) }, session);
      updated = { id: String(claim._id), status: claim.status };
    });
  } finally {
    await session.endSession();
  }
  return updated;
}

export async function listAuditLogs(page = 1, limit = 50) {
  const [logs, total] = await Promise.all([
    AuditLog.find().populate({ path: "actorId", select: "name email" }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    AuditLog.countDocuments(),
  ]);
  return { logs: logs.map((log) => ({ id: String(log._id), action: log.action, targetType: log.targetType, targetId: String(log.targetId), reason: log.reason, metadata: log.metadata, createdAt: log.createdAt, actor: log.actorId ? { name: log.actorId.name, email: log.actorId.email } : null })), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

