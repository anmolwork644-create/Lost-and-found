import { databaseStatus } from "../config/database.js";
import { deleteItemImage, uploadItemImage } from "../config/uploads.js";
import { Item } from "../models/Item.js";
import { Claim } from "../models/Claim.js";
import { Notification } from "../models/Notification.js";
import { MIN_POSSIBLE_MATCH_SCORE, scoreMatch } from "../utils/match-scoring.js";
import { HttpError } from "../utils/http-error.js";

const isOwner = (item, user) => Boolean(user && String(item.reporterId) === String(user._id));

function itemDto(item, user, includePrivate = false) {
  const owner = isOwner(item, user);
  const value = {
    id: String(item._id),
    type: item.type,
    name: item.name,
    category: item.category,
    description: item.description,
    location: item.location,
    date: new Date(item.itemDate).toISOString().slice(0, 10),
    image: item.imageUrl || undefined,
    status: item.status,
    mine: isOwner(item, user),
    createdAt: item.createdAt,
  };

  if (includePrivate && owner) {
    value.contact = item.privateContact;
    value.verificationQuestion = item.verificationQuestion || undefined;
  }
  return value;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function listOpenItems(filters, user) {
  if (databaseStatus() !== "connected") {
    throw new HttpError(503, "The database is unavailable.", "DATABASE_UNAVAILABLE");
  }
  const query = {};
  if (filters.status !== "all") query.status = filters.status ?? "open";
  else query.status = { $nin: ["archived", "removed"] };
  if (filters.type) query.type = filters.type;
  if (filters.category) query.category = filters.category;
  if (filters.location) query.location = filters.location;
  const startDate = filters.from ?? filters.since;
  if (startDate || filters.to) {
    query.itemDate = {};
    if (startDate) query.itemDate.$gte = new Date(`${startDate}T00:00:00.000Z`);
    if (filters.to) query.itemDate.$lte = new Date(`${filters.to}T23:59:59.999Z`);
  }
  if (filters.q) {
    const pattern = new RegExp(escapeRegex(filters.q), "i");
    query.$or = [
      { name: pattern },
      { description: pattern },
      { category: pattern },
      { location: pattern },
    ];
  }

  const skip = (filters.page - 1) * filters.limit;
  const [documents, total] = await Promise.all([
    Item.find(query).sort({ createdAt: -1 }).skip(skip).limit(filters.limit),
    Item.countDocuments(query),
  ]);
  return {
    items: documents.map((item) => itemDto(item, user)),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      pages: Math.ceil(total / filters.limit),
    },
  };
}

export async function getItem(item, user) {
  const owner = isOwner(item, user);
  if (["archived", "removed"].includes(item.status) && !owner && user?.role !== "admin") {
    throw new HttpError(404, "Listing was not found.", "LISTING_NOT_FOUND");
  }
  return itemDto(item, user, true);
}

async function notifyPotentialMatches(item) {
  const candidates = await Item.find({
    type: item.type === "lost" ? "found" : "lost",
    status: "open",
    category: item.category,
    reporterId: { $ne: item.reporterId },
  }).sort({ createdAt: -1 }).limit(500);
  const bestByOwner = new Map();
  let bestOverall;
  for (const candidate of candidates) {
    const match = scoreMatch(item, candidate);
    if (match.score < MIN_POSSIBLE_MATCH_SCORE) continue;
    if (!bestOverall || match.score > bestOverall.score) {
      bestOverall = { candidate, score: match.score };
    }
    const ownerId = String(candidate.reporterId);
    const current = bestByOwner.get(ownerId);
    if (!current || current.score < match.score) bestByOwner.set(ownerId, { candidate, score: match.score });
  }
  if (!bestByOwner.size) return;
  const notifications = [...bestByOwner.values()].map(({ candidate, score }) => ({
    receiverId: candidate.reporterId,
    itemId: candidate._id,
    relatedItemId: item._id,
    type: "potential_match",
    message: `A possible match (${score}%) was found for your “${candidate.name}” listing.`,
  }));
  if (bestOverall) {
    notifications.push({
      receiverId: item.reporterId,
      itemId: item._id,
      relatedItemId: bestOverall.candidate._id,
      type: "potential_match",
      message: `A possible match (${bestOverall.score}%) was found for your “${item.name}” listing.`,
    });
  }
  await Notification.insertMany(notifications);
}

export async function listMyItems(user) {
  const documents = await Item.find({ reporterId: user._id })
    .select("+privateContact +verificationQuestion +imageStorageKey")
    .sort({ createdAt: -1 });
  return documents.map((item) => itemDto(item, user, true));
}

export async function createItem(data, type, user, file) {
  let uploaded;
  if (file) uploaded = await uploadItemImage(file);
  try {
    const item = await Item.create({
      ...data,
      itemDate: new Date(`${data.itemDate}T00:00:00.000Z`),
      reporterId: user._id,
      type,
      ...(uploaded ? { imageUrl: uploaded.url, imageStorageKey: uploaded.storageKey } : {}),
      ...(data.verificationQuestion ? {} : { verificationQuestion: undefined }),
    });
    await notifyPotentialMatches(item).catch((error) => {
      console.error("Could not create possible-match notifications:", error.message);
    });
    return itemDto(item, user, true);
  } catch (error) {
    if (uploaded)
      await deleteItemImage(uploaded.storageKey).catch((cleanupError) => console.error(cleanupError));
    if (error?.code === 11000) {
      throw new HttpError(409, "A matching listing already exists.", "DUPLICATE_LISTING");
    }
    throw error;
  }
}

export async function updateItem(item, data, user, file) {
  if (file && data.removeImage === "true") {
    throw new HttpError(
      400,
      "Choose either a replacement image or remove the current image.",
      "CONFLICTING_IMAGE_ACTIONS",
    );
  }
  if (data.status === "closed" && await Claim.exists({ itemId: item._id, status: { $in: ["pending", "approved"] } })) {
    throw new HttpError(409, "Resolve active claims before closing this listing.", "ACTIVE_CLAIMS_EXIST");
  }
  if (data.status && ["pending", "returned"].includes(item.status)) {
    throw new HttpError(409, "Claim-managed listing status can only change through the claim workflow.", "CLAIM_STATUS_LOCKED");
  }

  let uploaded;
  if (file) uploaded = await uploadItemImage(file);
  const oldImageKey = item.imageStorageKey;
  try {
    const updates = { ...data };
    delete updates.removeImage;
    if (updates.itemDate) updates.itemDate = new Date(`${updates.itemDate}T00:00:00.000Z`);
    Object.assign(item, updates);

    if (uploaded) {
      item.imageUrl = uploaded.url;
      item.imageStorageKey = uploaded.storageKey;
    } else if (data.removeImage === "true") {
      item.imageUrl = undefined;
      item.imageStorageKey = undefined;
    }

    await item.save();
  } catch (error) {
    if (uploaded)
      await deleteItemImage(uploaded.storageKey).catch((cleanupError) => console.error(cleanupError));
    throw error;
  }

  const imageWasReplaced = uploaded && oldImageKey;
  const imageWasRemoved = data.removeImage === "true" && oldImageKey;
  if (imageWasReplaced || imageWasRemoved) {
    await deleteItemImage(oldImageKey).catch((error) => {
      console.error("Could not remove the previous listing image:", error.message);
    });
  }
  return itemDto(item, user, true);
}

export async function deleteItem(item) {
  if (await Claim.exists({ itemId: item._id })) {
    throw new HttpError(409, "Listings with claim history cannot be deleted. Close the listing instead.", "CLAIM_HISTORY_EXISTS");
  }
  if (item.imageStorageKey) await deleteItemImage(item.imageStorageKey);
  await Item.deleteOne({ _id: item._id });
}

