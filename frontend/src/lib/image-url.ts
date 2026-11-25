const backendOrigin = (import.meta.env["VITE_API_URL"] ?? "http://localhost:5000").replace(
  /\/$/,
  "",
);

export function resolveImageUrl(src?: string) {
  if (!src) return undefined;
  if (src.startsWith("/uploads/")) return new URL(src, `${backendOrigin}/`).toString();
  return src;
}
