import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "./env.js";
import { HttpError } from "../utils/http-error.js";

const extensions = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const uploadDirectory = path.resolve(backendRoot, env.UPLOAD_DIR);

export async function uploadItemImage(file) {
  const extension = extensions.get(file.mimetype);
  if (!extension) {
    throw new HttpError(400, "Upload a JPEG, PNG, or WebP image.", "INVALID_IMAGE_TYPE");
  }

  const storageKey = `${randomUUID()}${extension}`;
  try {
    await mkdir(uploadDirectory, { recursive: true });
    await writeFile(path.join(uploadDirectory, storageKey), file.buffer, {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    await unlink(path.join(uploadDirectory, storageKey)).catch(() => {});
    console.error("Could not store listing image:", error.message);
    throw new HttpError(500, "The server could not save this photo.", "IMAGE_STORAGE_FAILED");
  }

  return { url: `/uploads/${storageKey}`, storageKey };
}

export async function deleteItemImage(storageKey) {
  if (!storageKey || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\.(?:jpg|png|webp)$/i.test(storageKey)) return;
  try {
    await unlink(path.join(uploadDirectory, storageKey));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
