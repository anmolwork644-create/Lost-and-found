import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RequireAuth } from "@/components/cf/RequireAuth";
import {
  cancelClaim,
  completeClaim,
  decideClaim,
  fetchNotifications,
  fetchReceivedClaims,
  fetchSubmittedClaims,
  markNotificationRead,
  type ClaimRecord,
} from "@/lib/claim-api";

export const Route = createFileRoute("/claims")({
  head: () => ({
    meta: [
      { title: "Claims — CampusFind" },
      { name: "description", content: "Review ownership claims and recovery updates." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <ClaimsPage />
    </RequireAuth>
  ),
});

type View = "submitted" | "received";

function ClaimsPage() {
  const [view, setView] = useState<View>("received");
  const [submittedPage, setSubmittedPage] = useState(1);
  const [receivedPage, setReceivedPage] = useState(1);
  const [busy, setBusy] = useState<string>();
  const client = useQueryClient();
  const submitted = useQuery({
    queryKey: ["claims", "submitted", submittedPage],
    queryFn: () => fetchSubmittedClaims(submittedPage),
    enabled: view === "submitted",
  });
  const received = useQuery({
    queryKey: ["claims", "received", receivedPage],
    queryFn: () => fetchReceivedClaims(receivedPage),
    enabled: view === "received",
  });
  const notifications = useQuery({ queryKey: ["notifications"], queryFn: fetchNotifications });
  const claims =
    view === "submitted" ? (submitted.data?.claims ?? []) : (received.data?.claims ?? []);
  const pagination = view === "submitted" ? submitted.data?.pagination : received.data?.pagination;
  const loading = view === "submitted" ? submitted.isPending : received.isPending;
  const error = view === "submitted" ? submitted.error : received.error;

  const refresh = async () => {
    setSubmittedPage(1);
    setReceivedPage(1);
    await Promise.all([
      client.invalidateQueries({ queryKey: ["claims"] }),
      client.invalidateQueries({ queryKey: ["notifications"] }),
      client.invalidateQueries({ queryKey: ["items"] }),
    ]);
  };

  const runAction = async (id: string, action: () => Promise<unknown>, message: string) => {
    setBusy(id);
    try {
      await action();
      await refresh();
      toast.success(message);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not update this claim");
    } finally {
      setBusy(undefined);
    }
  };

  const markRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      await client.invalidateQueries({ queryKey: ["notifications"] });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not update notification");
    }
  };

  return (
    <div className="container-cf max-w-4xl py-10">
      <h1 className="text-3xl font-bold">Claims & notifications</h1>
      <p className="mt-2 text-muted-foreground">Private ownership requests and recovery updates.</p>

      <section className="card-soft mt-6 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Notifications</h2>
          <span className="text-sm text-muted-foreground">
            {notifications.data?.filter((note) => !note.read).length ?? 0} unread
          </span>
        </div>
        {notifications.isPending ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading notifications…</p>
        ) : null}
        {notifications.error ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {notifications.error.message}
          </p>
        ) : null}
        {!notifications.isPending &&
          !notifications.error &&
          (notifications.data?.length ?? 0) === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">You’re all caught up.</p>
          )}
        <div className="mt-3 divide-y">
          {notifications.data?.map((note) => (
            <div
              key={note.id}
              className={`flex items-center justify-between gap-3 py-3 text-sm ${note.read ? "text-muted-foreground" : "font-medium"}`}
            >
              <div>
                <p>{note.message}</p>
                {(note.relatedItemId || note.itemId) && (
                  <Link
                    to="/listing/$id"
                    params={{ id: note.relatedItemId ?? note.itemId! }}
                    className="mt-1 inline-block text-xs text-primary underline"
                  >
                    {note.relatedItemId
                      ? `View possible match${note.relatedItemName ? `: ${note.relatedItemName}` : ""}`
                      : `View item${note.itemName ? `: ${note.itemName}` : ""}`}
                  </Link>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(note.createdAt).toLocaleString()}
                </p>
              </div>
              {!note.read && (
                <Button size="sm" variant="outline" onClick={() => void markRead(note.id)}>
                  Mark read
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>

      <div
        className="mt-8 inline-flex rounded-xl bg-secondary p-1"
        role="tablist"
        aria-label="Claim lists"
      >
        {(["received", "submitted"] as View[]).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={view === value}
            onClick={() => setView(value)}
            className={`rounded-lg px-5 py-2 text-sm font-medium capitalize ${view === value ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
          >
            {value} claims
          </button>
        ))}
      </div>

      {loading && (
        <div className="card-soft mt-5 py-12 text-center text-muted-foreground">
          Loading claims…
        </div>
      )}
      {error && (
        <div role="alert" className="card-soft mt-5 py-12 text-center text-destructive">
          {error.message}
        </div>
      )}
      {!loading && !error && claims.length === 0 && (
        <div className="card-soft mt-5 py-12 text-center text-muted-foreground">
          No {view} claims yet.{" "}
          {view === "submitted" && (
            <Link to="/" className="text-primary underline">
              Browse found items
            </Link>
          )}
        </div>
      )}
      <div className="mt-5 space-y-4">
        {claims.map((claim) => (
          <ClaimCard
            key={claim.id}
            claim={claim}
            view={view}
            busy={busy === claim.id}
            act={runAction}
          />
        ))}
      </div>
      {pagination && pagination.pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4 text-sm">
          <Button
            size="sm"
            variant="outline"
            disabled={pagination.page <= 1}
            onClick={() =>
              view === "submitted"
                ? setSubmittedPage((page) => page - 1)
                : setReceivedPage((page) => page - 1)
            }
          >
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {pagination.page} of {pagination.pages} · {pagination.total} claims
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={pagination.page >= pagination.pages}
            onClick={() =>
              view === "submitted"
                ? setSubmittedPage((page) => page + 1)
                : setReceivedPage((page) => page + 1)
            }
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

function ClaimCard({
  claim,
  view,
  busy,
  act,
}: {
  claim: ClaimRecord;
  view: View;
  busy: boolean;
  act: (id: string, action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const item = claim.item;
  const statusLabel = claim.status.charAt(0).toUpperCase() + claim.status.slice(1);
  return (
    <article className="card-soft p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {view === "received" ? "Claim received" : "Claim submitted"}
          </p>
          {item ? (
            <Link
              to="/listing/$id"
              params={{ id: item.id }}
              className="mt-1 block text-lg font-semibold hover:text-primary"
            >
              {item.name}
            </Link>
          ) : (
            <h2 className="mt-1 text-lg font-semibold">Listing unavailable</h2>
          )}
          {item && (
            <p className="text-sm text-muted-foreground">
              {item.category} · {item.location} · {item.date}
            </p>
          )}
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${claim.status === "approved" || claim.status === "completed" ? "badge-found-soft" : claim.status === "pending" ? "badge-pending" : "badge-closed"}`}
        >
          {statusLabel}
        </span>
      </div>

      {view === "received" && claim.claimant && (
        <p className="mt-4 text-sm">
          <span className="text-muted-foreground">Claimant:</span> {claim.claimant.name}
        </p>
      )}
      <div className="mt-4 rounded-xl bg-secondary/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Private verification answer
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm">{claim.answer}</p>
        {claim.message && (
          <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{claim.message}</p>
        )}
      </div>

      {claim.contact && (
        <p className="mt-3 text-sm">
          <span className="font-medium">
            {view === "received" ? "Claimant contact" : "Your contact"}:
          </span>{" "}
          {claim.contact}
        </p>
      )}
      {claim.ownerContact && (
        <p className="mt-2 text-sm">
          <span className="font-medium">Finder contact:</span> {claim.ownerContact}
        </p>
      )}
      {claim.ownerDecision?.note && (
        <p className="mt-3 text-sm text-muted-foreground">
          Decision note: {claim.ownerDecision.note}
        </p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Submitted {new Date(claim.createdAt).toLocaleString()}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {view === "received" && claim.status === "pending" && (
          <>
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                void act(
                  claim.id,
                  () => decideClaim(claim.id, "approve"),
                  "Claim approved. Contact details are now shared privately.",
                )
              }
            >
              Approve claim
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void act(claim.id, () => decideClaim(claim.id, "reject"), "Claim declined")
              }
            >
              Reject
            </Button>
          </>
        )}
        {view === "received" && claim.status === "approved" && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void act(claim.id, () => completeClaim(claim.id), "Recovery marked complete")
            }
          >
            Mark item returned
          </Button>
        )}
        {view === "submitted" && claim.status === "pending" && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Cancel this ownership claim?"))
                void act(claim.id, () => cancelClaim(claim.id), "Claim cancelled");
            }}
          >
            Cancel request
          </Button>
        )}
      </div>
    </article>
  );
}
