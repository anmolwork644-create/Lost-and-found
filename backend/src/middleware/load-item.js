import { Item } from "../models/Item.js";
import { HttpError } from "../utils/http-error.js";
import { asyncHandler } from "../utils/async-handler.js";
import { itemIdSchema } from "../validators/item.validators.js";

export const loadItem = asyncHandler(async (req, _res, next) => {
  const parsedId = itemIdSchema.safeParse(req.params.id);
  if (!parsedId.success) throw new HttpError(400, "Listing ID is invalid.", "INVALID_LISTING_ID");

  const item = await Item.findById(parsedId.data).select(
    "+privateContact +verificationQuestion +imageStorageKey",
  );
  if (!item) throw new HttpError(404, "Listing was not found.", "LISTING_NOT_FOUND");
  req.item = item;
  next();
});
