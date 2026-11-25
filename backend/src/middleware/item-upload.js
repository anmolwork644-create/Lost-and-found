import multer from "multer";
import { HttpError } from "../utils/http-error.js";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export const itemImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!allowedTypes.has(file.mimetype)) {
      return callback(
        new HttpError(400, "Upload a JPEG, PNG, or WebP image.", "INVALID_IMAGE_TYPE"),
      );
    }
    callback(null, true);
  },
});

export function validateImageSignature(req, _res, next) {
  const file = req.file;
  if (!file) return next();

  const bytes = file.buffer;
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng =
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isWebp =
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP";

  if (!isJpeg && !isPng && !isWebp) {
    return next(
      new HttpError(400, "The uploaded file is not a supported image.", "INVALID_IMAGE_CONTENT"),
    );
  }
  next();
}
