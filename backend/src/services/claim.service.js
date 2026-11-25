import mongoose from "mongoose";
import { Claim } from "../models/Claim.js";
import { Item } from "../models/Item.js";
import { Notification } from "../models/Notification.js";
import { HttpError } from "../utils/http-error.js";

const equalId = (left, right) => Boolean(left && right && String(left) === String(right));
const asDate = () => new Date();

function itemSummary(item) {
  if (!item) return null;
  return {
    id: String(item._id),
    name: item.name,
    type: item.type,
    category: item.category,
    location: item.location,
    date: new Date(item.itemDate).toISOString().slice(0, 10),
    status: item.status,
  };
}

function claimDto(claim, viewerId, view) {
  const item = claim.itemId;
  const viewerIsClaimant = equalId(claim.claimantId?._id ?? claim.claimantId, viewerId);
  const viewerIsOwner = view === "owner";
  const sharingAllowed = ["approved", "completed"].includes(claim.status);
  const dto = {
    id: String(claim._id),
    status: claim.status,
    createdAt: claim.createdAt,
    item: itemSummary(item),
    decisionHistory: claim.decisionHistory ?? [],
    ownerDecision: claim.ownerDecision?.action
      ? {
          action: claim.ownerDecision.action,
          note: claim.ownerDecision.note,
          at: claim.ownerDecision.at,
        }
      : undefined,
  };

  if (viewerIsClaimant || viewerIsOwner) {
    dto.answer = claim.verificationAnswer;
    dto.message = claim.message || "";
  }
  if (viewerIsClaimant) {
    dto.contact = claim.claimantContact;
    dto.ownerContact = sharingAllowed ? item?.privateContact : undefined;
  }
  if (viewerIsOwner) {
    dto.claimant = claim.claimantId?._id
      ? { id: String(claim.claimantId._id), name: claim.claimantId.name }
      : undefined;
    dto.contact = sharingAllowed ? claim.claimantContact : undefined;
  }
  return dto;
}

function ensureItemCanBeClaimed(item, user) {
  if (item.type !== "found") throw new HttpError(400, "Only found items can receive ownership claims.", "CLAIM_REQUIRES_FOUND_ITEM");
  if (equalId(item.reporterId, user._id)) throw new HttpError(400, "You cannot claim your own listing.", "SELF_CLAIM_NOT_ALLOWED");
  if (item.status !== "open") throw new HttpError(409, "This listing is no longer accepting claims.", "LISTING_NOT_CLAIMABLE");
}

export async function getClaimPrompt(item, user) {
  ensureItemCanBeClaimed(item, user);
  return item.verificationQuestion || "Describe a private identifying detail that proves this item is yours.";
}

export async function submitClaim(item, input, user) {
  ensureItemCanBeClaimed(item, user);
  const session = await mongoose.startSession();
  let created;
  try {
    await session.withTransaction(async () => {
      const claimable = await Item.updateOne(
        { _id: item._id, type: "found", status: "open", reporterId: { $ne: user._id } },
        { $inc: { claimRequestRevision: 1 } },
        { session },
      );
      if (claimable.modifiedCount !== 1) {
        throw new HttpError(409, "This listing is no longer accepting claims.", "LISTING_NOT_CLAIMABLE");
      }
      const [claim] = await Claim.create(
        [{
          itemId: item._id,
          claimantId: user._id,
          claimantContact: input.contact,
          verificationAnswer: input.answer,
          message: input.message || undefined,
          status: "pending",
        }],
        { session },
      );
      await Notification.create(
        [{
          receiverId: item.reporterId,
          senderId: user._id,
          itemId: item._id,
          claimId: claim._id,
          type: "claim_received",
          message: `A new ownership claim was submitted for “${item.name}”.`,
        }],
        { session },
      );
      created = claim;
    });
  } catch (error) {
    if (error?.code === 11000) throw new HttpError(409, "You already have an active claim for this item.", "DUPLICATE_CLAIM");
    throw error;
  } finally {
    await session.endSession();
  }
  return claimDto({ ...created.toObject(), itemId: item }, user._id, "claimant");
}

const claimPopulate = [
  { path: "claimantId", select: "name" },
  { path: "itemId", select: "name type category location itemDate status +privateContact +reporterId" },
];

async function loadClaim(claimId, session) {
  const claim = await Claim.findById(claimId)
    .select("+verificationAnswer +claimantContact +message")
    .session(session);
  if (!claim) throw new HttpError(404, "Claim was not found.", "CLAIM_NOT_FOUND");
  return claim;
}

export async function listSubmittedClaims(user, filters = { page: 1, limit: 20 }) {
  const query = { claimantId: user._id };
  const skip = (filters.page - 1) * filters.limit;
  const [claims, total] = await Promise.all([Claim.find(query)
    .select("+verificationAnswer +claimantContact +message")
    .populate(claimPopulate)
    .sort({ createdAt: -1 }).skip(skip).limit(filters.limit), Claim.countDocuments(query)]);
  return {
    claims: claims.map((claim) => claimDto(claim, user._id, "claimant")),
    pagination: { page: filters.page, limit: filters.limit, total, pages: Math.ceil(total / filters.limit) },
  };
}

export async function listReceivedClaims(user, filters = { page: 1, limit: 20 }) {
  const itemIds = await Item.find({ reporterId: user._id }).distinct("_id");
  const query = { itemId: { $in: itemIds } };
  const skip = (filters.page - 1) * filters.limit;
  const [claims, total] = await Promise.all([Claim.find(query)
    .select("+verificationAnswer +claimantContact +message")
    .populate(claimPopulate)
    .sort({ createdAt: -1 }).skip(skip).limit(filters.limit), Claim.countDocuments(query)]);
  return {
    claims: claims.map((claim) => claimDto(claim, user._id, "owner")),
    pagination: { page: filters.page, limit: filters.limit, total, pages: Math.ceil(total / filters.limit) },
  };
}

export async function decideClaim(claimId, user, action, note = "") {
  const session = await mongoose.startSession();
  let decided;
  try {
    await session.withTransaction(async () => {
      const claim = await loadClaim(claimId, session);
      const item = await Item.findById(claim.itemId).session(session);
      if (!item) throw new HttpError(404, "Listing was not found.", "LISTING_NOT_FOUND");
      if (!equalId(item.reporterId, user._id)) throw new HttpError(403, "Only the listing owner can decide this claim.", "CLAIM_OWNER_REQUIRED");
      if (equalId(claim.claimantId, user._id)) throw new HttpError(403, "Claimants cannot decide their own claims.", "CLAIMANT_CANNOT_DECIDE");
      if (claim.status !== "pending") throw new HttpError(409, "This claim has already been decided.", "CLAIM_NOT_PENDING");

      const now = asDate();
      if (action === "approve") {
        const reserved = await Item.updateOne(
          { _id: item._id, status: "open", activeClaimId: null },
          { $set: { status: "pending", activeClaimId: claim._id } },
          { session },
        );
        if (reserved.modifiedCount !== 1) throw new HttpError(409, "Another claim has already been approved for this item.", "ITEM_ALREADY_CLAIMED");
      }

      claim.status = action === "approve" ? "approved" : "rejected";
      claim.ownerDecision = { actorId: user._id, action: claim.status, note, at: now };
      claim.decisionHistory.push({ actorId: user._id, action: claim.status, note, at: now });
      await claim.save({ session });
      await Notification.create(
        [{
          receiverId: claim.claimantId,
          senderId: user._id,
          itemId: item._id,
          claimId: claim._id,
          type: "claim_updated",
          message: action === "approve" ? `Your claim for “${item.name}” was approved.` : `Your claim for “${item.name}” was declined.`,
        }],
        { session },
      );

      if (action === "approve") {
        const others = await Claim.find({ itemId: item._id, status: "pending", _id: { $ne: claim._id } }).session(session);
        if (others.length) {
          await Claim.updateMany(
            { _id: { $in: others.map((other) => other._id) }, status: "pending" },
            { $set: { status: "rejected", ownerDecision: { actorId: user._id, action: "rejected", note: "Another ownership claim was approved.", at: now } }, $push: { decisionHistory: { actorId: user._id, action: "rejected", note: "Another ownership claim was approved.", at: now } } },
            { session },
          );
          await Notification.insertMany(others.map((other) => ({
            receiverId: other.claimantId,
            senderId: user._id,
            itemId: item._id,
            claimId: other._id,
            type: "claim_updated",
            message: `Your claim for “${item.name}” was closed because another claim was approved.`,
          })), { session });
        }
      }
      decided = claim;
    });
  } finally {
    await session.endSession();
  }
  const [fresh] = await Claim.find({ _id: decided._id })
    .select("+verificationAnswer +claimantContact +message")
    .populate(claimPopulate);
  return claimDto(fresh, user._id, "owner");
}

export async function cancelClaim(claimId, user) {
  const session = await mongoose.startSession();
  let cancelled;
  try {
    await session.withTransaction(async () => {
      const claim = await loadClaim(claimId, session);
      if (!equalId(claim.claimantId, user._id)) throw new HttpError(403, "Only the claimant can cancel this request.", "CLAIMANT_REQUIRED");
      if (claim.status !== "pending") throw new HttpError(409, "Only pending claims can be cancelled.", "CLAIM_NOT_PENDING");
      claim.status = "cancelled";
      claim.decisionHistory.push({ actorId: user._id, action: "cancelled", at: asDate() });
      await claim.save({ session });
      const item = await Item.findById(claim.itemId).session(session);
      if (item) {
        await Notification.create([{ receiverId: item.reporterId, senderId: user._id, itemId: item._id, claimId: claim._id, type: "claim_updated", message: `An ownership claim for “${item.name}” was cancelled.` }], { session });
      }
      cancelled = claim;
    });
  } finally {
    await session.endSession();
  }
  const [fresh] = await Claim.find({ _id: cancelled._id })
    .select("+verificationAnswer +claimantContact +message")
    .populate(claimPopulate);
  return claimDto(fresh, user._id, "claimant");
}

export async function completeClaim(claimId, user) {
  const session = await mongoose.startSession();
  let completed;
  try {
    await session.withTransaction(async () => {
      const claim = await loadClaim(claimId, session);
      const item = await Item.findById(claim.itemId).session(session);
      if (!item) throw new HttpError(404, "Listing was not found.", "LISTING_NOT_FOUND");
      if (!equalId(item.reporterId, user._id)) throw new HttpError(403, "Only the listing owner can complete recovery.", "CLAIM_OWNER_REQUIRED");
      if (claim.status !== "approved" || !equalId(item.activeClaimId, claim._id)) throw new HttpError(409, "Only the approved claim can be completed.", "CLAIM_NOT_APPROVED");
      const now = asDate();
      item.status = "returned";
      item.activeClaimId = null;
      await item.save({ session });
      claim.status = "completed";
      claim.decisionHistory.push({ actorId: user._id, action: "completed", at: now });
      await claim.save({ session });
      await Notification.create([{ receiverId: claim.claimantId, senderId: user._id, itemId: item._id, claimId: claim._id, type: "item_returned", message: `“${item.name}” was marked Returned.` }], { session });
      completed = claim;
    });
  } finally {
    await session.endSession();
  }
  const [fresh] = await Claim.find({ _id: completed._id })
    .select("+verificationAnswer +claimantContact +message")
    .populate(claimPopulate);
  return claimDto(fresh, user._id, "owner");
}

export async function listNotifications(user) {
  const notifications = await Notification.find({ receiverId: user._id })
    .populate({ path: "itemId", select: "name" })
    .populate({ path: "relatedItemId", select: "name" })
    .sort({ createdAt: -1 })
    .limit(100);
  return notifications.map((notification) => ({
    id: String(notification._id),
    type: notification.type,
    message: notification.message,
    read: Boolean(notification.readAt),
    createdAt: notification.createdAt,
    itemId: notification.itemId ? String(notification.itemId._id) : undefined,
    itemName: notification.itemId?.name,
    relatedItemId: notification.relatedItemId ? String(notification.relatedItemId._id) : undefined,
    relatedItemName: notification.relatedItemId?.name,
    claimId: notification.claimId ? String(notification.claimId) : undefined,
  }));
}

export async function unreadNotificationCount(user) {
  return Notification.countDocuments({ receiverId: user._id, readAt: null });
}

export async function markNotificationRead(notificationId, user) {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, receiverId: user._id, readAt: null },
    { $set: { readAt: asDate() } },
    { new: true },
  );
  if (!notification) {
    const exists = await Notification.exists({ _id: notificationId, receiverId: user._id });
    if (!exists) throw new HttpError(404, "Notification was not found.", "NOTIFICATION_NOT_FOUND");
    return { id: String(notificationId), read: true };
  }
  return { id: String(notification._id), read: true };
}
