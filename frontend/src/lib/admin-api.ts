import { apiRequest } from "./auth-context";

export interface AdminOverview {
  totalUsers: number;
  totalLostListings: number;
  totalFoundListings: number;
  totalReturnedItems: number;
  pendingClaims: number;
  mostReportedCategories: { category: string; reports: number }[];
}

export interface AdminListing {
  id: string;
  type: "lost" | "found";
  name: string;
  category: string;
  description: string;
  location: string;
  date: string;
  image?: string;
  status: string;
  reportCount: number;
  reporter?: { id: string; name: string; email: string };
  createdAt: string;
}
export interface AdminReport {
  id: string;
  reason: string;
  details?: string;
  status: string;
  createdAt: string;
  item: {
    id: string;
    name: string;
    type: "lost" | "found";
    category: string;
    description: string;
    location: string;
    status: string;
  } | null;
  reporter: { id: string; name: string; email: string } | null;
}
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "suspended";
  emailVerified: boolean;
  createdAt: string;
  listingCount: number;
  claimCount: number;
}
export interface AdminClaim {
  id: string;
  status: string;
  createdAt: string;
  ownerDecision?: { action: string; note?: string; at?: string };
  item: { id: string; name: string; type: string; category: string; status: string } | null;
  claimant: { id: string; name: string; email: string; status: string } | null;
}
export interface AuditEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  reason?: string;
  createdAt: string;
  actor: { name: string; email: string } | null;
}

export async function fetchAdminOverview() {
  return (await apiRequest<{ overview: AdminOverview }>("/admin/overview")).overview;
}
export async function fetchAdminListings(params = new URLSearchParams()) {
  return apiRequest<{
    items: AdminListing[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }>(`/admin/listings?${params}`);
}
export async function fetchAdminReports() {
  return (await apiRequest<{ reports: AdminReport[] }>("/admin/reports")).reports;
}
export async function fetchAdminUsers(params = new URLSearchParams()) {
  return apiRequest<{
    users: AdminUser[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }>(`/admin/users?${params}`);
}
export async function fetchAdminClaims(params = new URLSearchParams()) {
  return apiRequest<{
    claims: AdminClaim[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }>(`/admin/claims?${params}`);
}
export async function fetchAuditLog() {
  return (await apiRequest<{ logs: AuditEntry[] }>("/admin/audit?limit=50")).logs;
}

export async function moderateListing(
  id: string,
  action: "close" | "remove" | "archive" | "restore",
  reason: string,
) {
  return apiRequest(`/admin/listings/${encodeURIComponent(id)}/action`, {
    method: "PATCH",
    body: JSON.stringify({ action, reason }),
  });
}
export async function archiveExpired(before?: string) {
  return apiRequest<{ archived: number }>("/admin/listings/archive-expired", {
    method: "POST",
    body: JSON.stringify(before ? { before } : {}),
  });
}
export async function reviewReport(id: string, status: "reviewed" | "dismissed") {
  return apiRequest(`/admin/reports/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}
export async function moderateUser(id: string, status: "active" | "suspended") {
  return apiRequest(`/admin/users/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({
      status,
      reason:
        status === "suspended"
          ? "Account suspended after admin review."
          : "Account reactivated after admin review.",
    }),
  });
}
export async function moderateClaim(id: string, action: "reject" | "revoke") {
  return apiRequest(`/admin/claims/${encodeURIComponent(id)}/action`, {
    method: "PATCH",
    body: JSON.stringify({
      action,
      reason:
        action === "revoke"
          ? "Approved claim revoked after admin review."
          : "Claim declined after admin review.",
    }),
  });
}

export async function reportListing(
  id: string,
  reason: "inappropriate" | "misleading" | "duplicate" | "private_information" | "other",
  details: string,
) {
  return apiRequest(`/items/${encodeURIComponent(id)}/reports`, {
    method: "POST",
    body: JSON.stringify({ reason, details }),
  });
}
