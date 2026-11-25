import {
  createItem as createItemService,
  deleteItem as deleteItemService,
  getItem as getItemService,
  listMyItems,
  listOpenItems,
  updateItem as updateItemService,
} from "../services/item.service.js";
import { findPossibleMatches } from "../services/matching.service.js";
import { createListingReport } from "../services/report.service.js";

export async function listItems(req, res) {
  res.json(await listOpenItems(req.validatedQuery, req.user));
}

export async function getItem(req, res) {
  res.json({ item: await getItemService(req.item, req.user) });
}

export async function myItems(req, res) {
  res.json({ items: await listMyItems(req.user) });
}

export async function itemMatches(req, res) {
  res.json({ matches: await findPossibleMatches(req.item, req.user) });
}

export async function createReport(req, res) {
  const report = await createListingReport(req.item, req.validatedBody, req.user);
  res.status(201).json({ report });
}

export async function createItem(req, res) {
  const item = await createItemService(req.validatedBody, req.params.type, req.user, req.file);
  res.status(201).json({ item });
}

export async function updateItem(req, res) {
  const item = await updateItemService(req.item, req.validatedBody, req.user, req.file);
  res.json({ item });
}

export async function deleteItem(req, res) {
  await deleteItemService(req.item);
  res.status(204).end();
}
