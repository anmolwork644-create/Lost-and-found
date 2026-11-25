import { Item } from "../models/Item.js";
import { HttpError } from "../utils/http-error.js";
import { databaseStatus } from "../config/database.js";
import { getItem } from "./item.service.js";
import { MIN_POSSIBLE_MATCH_SCORE, scoreMatch } from "../utils/match-scoring.js";

export async function findPossibleMatches(target, user, limit = 5) {
  if (databaseStatus() !== "connected") {
    throw new HttpError(503, "The database is unavailable.", "DATABASE_UNAVAILABLE");
  }
  // Reuse the detail visibility rule so closed listings remain visible only to their owner/admin.
  await getItem(target, user);
  const candidates = await Item.find({ type: target.type === "lost" ? "found" : "lost", status: "open" })
    .sort({ createdAt: -1 })
    .limit(500);

  return candidates
    .map((item) => ({ item, ...scoreMatch(target, item) }))
    .filter((match) => match.score >= MIN_POSSIBLE_MATCH_SCORE)
    .sort((left, right) => right.score - left.score || right.item.createdAt - left.item.createdAt)
    .slice(0, limit)
    .map(({ item, score, reasons }) => ({
      item: {
        id: String(item._id),
        type: item.type,
        name: item.name,
        category: item.category,
        description: item.description,
        location: item.location,
        date: new Date(item.itemDate).toISOString().slice(0, 10),
        image: item.imageUrl || undefined,
        status: item.status,
        mine: Boolean(user && String(item.reporterId) === String(user._id)),
        createdAt: item.createdAt,
      },
      score,
      reasons,
    }));
}
