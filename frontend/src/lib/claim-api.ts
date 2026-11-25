import { apiRequest } from "./auth-context";
import type { ListingType } from "./campus-data";

export type ClaimStatus = "pending" | "approved" | "rejected" | "cancelled" | "completed";

export interface ClaimRecord {
  id: string;
  status: ClaimStatus;
  answer: string;
  message: string;
  contact?: string;
  ownerContact?: string;
  claimant?: { id: string; name: string };
  item: {
    id: string;
    name: string;
    type: ListingType;
    category: string;
    location: string;
    date: string;
    status: string;
  } | null;
  ownerDecision?: { action: "approved" | "rejected"; note?: string; at?: string };
  createdAt: string;
}

export interface ClaimListResponse {
  claims: ClaimRecord[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface CampusNotification {
  id: string;
  type:
    "claim_received" | "claim_updated" | "potential_match" | "item_returned" | "moderation_action";
  message: string;
  read: boolean;
  createdAt: string;
  itemId?: string;
  itemName?: string;
  relatedItemId?: string;
  relatedItemName?: string;
  claimId?: string;
}

export async function fetchClaimPrompt(itemId: string) {
  return apiRequest<{ prompt: string }>(`/items/${encodeURIComponent(itemId)}/claim-prompt`);
}

export async function submitClaim(
  itemId: string,
  data: { contact: string; answer: string; message?: string },
) {
  return apiRequest<{ claim: ClaimRecord }>(`/items/${encodeURIComponent(itemId)}/claims`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function fetchSubmittedClaims(page = 1) {
  return apiRequest<ClaimListResponse>(`/claims/submitted?page=${page}&limit=20`);
}

export async function fetchReceivedClaims(page = 1) {
  return apiRequest<ClaimListResponse>(`/claims/received?page=${page}&limit=20`);
}

export async function decideClaim(id: string, action: "approve" | "reject") {
  return apiRequest<{ claim: ClaimRecord }>(`/claims/${encodeURIComponent(id)}/decision`, {
    method: "PATCH",
    body: JSON.stringify({ action }),
  });
}

export async function cancelClaim(id: string) {
  return apiRequest<{ claim: ClaimRecord }>(`/claims/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
  });
}

export async function completeClaim(id: string) {
  return apiRequest<{ claim: ClaimRecord }>(`/claims/${encodeURIComponent(id)}/complete`, {
    method: "POST",
  });
}

export async function fetchNotifications() {
  return (await apiRequest<{ notifications: CampusNotification[] }>("/notifications"))
    .notifications;
}

export async function fetchUnreadNotificationCount() {
  return (await apiRequest<{ count: number }>("/notifications/unread-count")).count;
}

export async function markNotificationRead(id: string) {
  return apiRequest(`/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" });
}
