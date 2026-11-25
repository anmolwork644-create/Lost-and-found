import { apiRequest } from "./auth-context";
import type { Listing, ListingType } from "./campus-data";

export interface ListingsResponse {
  items: Listing[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface PossibleMatch {
  item: Listing;
  score: number;
  reasons: string[];
}

export async function fetchListings(params?: URLSearchParams) {
  const query = params?.toString();
  return apiRequest<ListingsResponse>(`/items${query ? `?${query}` : ""}`);
}

export async function fetchListing(id: string) {
  const result = await apiRequest<{ item: Listing }>(`/items/${encodeURIComponent(id)}`);
  return result.item;
}

export async function fetchPossibleMatches(id: string) {
  const result = await apiRequest<{ matches: PossibleMatch[] }>(
    `/items/${encodeURIComponent(id)}/matches`,
  );
  return result.matches;
}

export async function fetchMyListings() {
  const result = await apiRequest<{ items: Listing[] }>("/items/mine");
  return result.items;
}

export async function saveListing(type: ListingType, form: FormData, id?: string) {
  const path = id ? `/items/${encodeURIComponent(id)}` : `/items/${type}`;
  const result = await apiRequest<{ item: Listing }>(path, {
    method: id ? "PATCH" : "POST",
    body: form,
  });
  return result.item;
}

export async function updateListingStatus(id: string, status: "open" | "closed") {
  const result = await apiRequest<{ item: Listing }>(`/items/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  return result.item;
}

export async function deleteListing(id: string) {
  await apiRequest<void>(`/items/${encodeURIComponent(id)}`, { method: "DELETE" });
}
