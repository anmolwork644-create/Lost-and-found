import { ZodError } from "zod";
import { HttpError } from "../utils/http-error.js";

export function errorHandler(error, _req, res, _next) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        details: error.flatten(),
      },
    });
  }
  if (error?.type === "entity.parse.failed") {
    return res
      .status(400)
      .json({ error: { code: "INVALID_JSON", message: "Request body must contain valid JSON." } });
  }
  if (error?.type === "entity.too.large") {
    return res
      .status(413)
      .json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large." } });
  }
  if (error?.name === "MulterError") {
    const tooLarge = error.code === "LIMIT_FILE_SIZE";
    return res.status(tooLarge ? 413 : 400).json({
      error: {
        code: tooLarge ? "IMAGE_TOO_LARGE" : "INVALID_UPLOAD",
        message: tooLarge
          ? "Images must be 5 MB or smaller."
          : "Only one listing image can be uploaded.",
      },
    });
  }
  if (error?.name === "ValidationError" || error?.name === "CastError") {
    return res
      .status(400)
      .json({ error: { code: "DATA_VALIDATION_ERROR", message: "The supplied data is invalid." } });
  }
  if (error?.code === 11000) {
    return res.status(409).json({
      error: { code: "DUPLICATE_VALUE", message: "A record with that value already exists." },
    });
  }

  const status =
    Number.isInteger(error?.status) && error.status >= 400 && error.status < 600
      ? error.status
      : 500;
  if (status === 500 && !(error instanceof HttpError)) console.error(error);
  return res.status(status).json({
    error: {
      code:
        error instanceof HttpError
          ? error.code
          : status >= 500
            ? "INTERNAL_ERROR"
            : (error.code ?? "REQUEST_ERROR"),
      message: status >= 500 ? "An unexpected server error occurred." : error.message,
    },
  });
}
