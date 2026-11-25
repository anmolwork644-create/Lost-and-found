import type { ListingStatus, ListingType } from "@/lib/campus-data";

export function TypeBadge({ type }: { type: ListingType }) {
  return (
    <span className={`badge ${type === "lost" ? "badge-lost" : "badge-found"}`}>
      {type === "lost" ? "Lost" : "Found"}
    </span>
  );
}
const LABEL: Record<ListingStatus, string> = {
  open: "Open",
  pending: "Claim Pending",
  returned: "Returned",
  closed: "Closed",
  archived: "Archived",
  removed: "Removed",
};
export function StatusBadge({ status }: { status: ListingStatus }) {
  const cls =
    status === "closed" || status === "archived" || status === "removed"
      ? "badge-closed"
      : status === "returned"
        ? "badge-found-soft"
        : status === "pending"
          ? "badge-pending"
          : "badge-open";
  return <span className={`badge ${cls}`}>{LABEL[status]}</span>;
}
