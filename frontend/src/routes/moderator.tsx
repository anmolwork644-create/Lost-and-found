import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ShieldCheck, Users, PackageSearch, RotateCcw, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ItemImage } from "@/components/cf/ItemImage";
import { TypeBadge } from "@/components/cf/Badges";
import { RequireAuth } from "@/components/cf/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import {
  archiveExpired,
  fetchAdminClaims,
  fetchAdminListings,
  fetchAdminOverview,
  fetchAdminReports,
  fetchAdminUsers,
  fetchAuditLog,
  moderateClaim,
  moderateListing,
  moderateUser,
  reviewReport,
  type AdminOverview,
  type AdminClaim,
  type AdminListing,
  type AdminReport,
  type AdminUser,
} from "@/lib/admin-api";

export const Route = createFileRoute("/moderator")({
  head: () => ({
    meta: [
      { title: "Moderation — CampusFind" },
      { name: "description", content: "Moderate listings, reports, claims, and users." },
    ],
  }),
  component: () => (
    <RequireAuth role="admin">
      <Moderator />
    </RequireAuth>
  ),
});

type Section = "overview" | "listings" | "reports" | "users" | "claims" | "audit";

function Moderator() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [section, setSection] = useState<Section>("overview");
  const [listingStatus, setListingStatus] = useState("all");
  const [reportedOnly, setReportedOnly] = useState(false);
  const [listingPage, setListingPage] = useState(1);
  const [userPage, setUserPage] = useState(1);
  const [claimPage, setClaimPage] = useState(1);
  const [userQuery, setUserQuery] = useState("");
  const [busy, setBusy] = useState<string>();

  const overview = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: fetchAdminOverview,
    enabled: section === "overview",
  });
  const listingParams = new URLSearchParams({
    status: listingStatus,
    page: String(listingPage),
    limit: "12",
  });
  if (reportedOnly) listingParams.set("reported", "true");
  const listings = useQuery({
    queryKey: ["admin", "listings", listingStatus, reportedOnly, listingPage],
    queryFn: () => fetchAdminListings(listingParams),
    enabled: section === "listings",
  });
  const reports = useQuery({
    queryKey: ["admin", "reports"],
    queryFn: fetchAdminReports,
    enabled: section === "reports",
  });
  const users = useQuery({
    queryKey: ["admin", "users", userQuery, userPage],
    queryFn: () =>
      fetchAdminUsers(new URLSearchParams({ q: userQuery, page: String(userPage), limit: "12" })),
    enabled: section === "users",
  });
  const claims = useQuery({
    queryKey: ["admin", "claims", claimPage],
    queryFn: () => fetchAdminClaims(new URLSearchParams({ page: String(claimPage), limit: "12" })),
    enabled: section === "claims",
  });
  const audit = useQuery({
    queryKey: ["admin", "audit"],
    queryFn: fetchAuditLog,
    enabled: section === "audit",
  });

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["admin"] }),
      client.invalidateQueries({ queryKey: ["notifications"] }),
      client.invalidateQueries({ queryKey: ["items"] }),
    ]);
  };
  const run = async (id: string, action: () => Promise<unknown>, success: string) => {
    setBusy(id);
    try {
      await action();
      await refresh();
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The moderation action failed");
    } finally {
      setBusy(undefined);
    }
  };

  const sections: Section[] = ["overview", "listings", "reports", "users", "claims", "audit"];
  return (
    <div className="container-cf max-w-5xl py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Admin dashboard</h1>
          <p className="mt-1 text-muted-foreground">
            Moderation actions are recorded in the audit log.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={busy === "archive-expired"}
          onClick={() => {
            if (window.confirm("Archive expired listings that have no active claims?"))
              void run("archive-expired", () => archiveExpired(), "Expired listings archived");
          }}
        >
          Archive expired
        </Button>
      </div>

      <div
        className="mt-7 inline-flex flex-wrap gap-1 rounded-xl bg-secondary p-1"
        role="tablist"
        aria-label="Admin sections"
      >
        {sections.map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={section === value}
            onClick={() => setSection(value)}
            className={`rounded-lg px-4 py-2 text-sm font-medium capitalize ${section === value ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
          >
            {value}
          </button>
        ))}
      </div>

      {section === "overview" && (
        <Overview
          data={overview.data}
          loading={overview.isPending}
          error={overview.error?.message}
        />
      )}
      {section === "listings" && (
        <section className="mt-6">
          <div className="mb-4 flex flex-wrap gap-3">
            <select
              className="input-cf max-w-56"
              value={listingStatus}
              onChange={(event) => {
                setListingStatus(event.target.value);
                setListingPage(1);
              }}
              aria-label="Filter listings by status"
            >
              {(
                ["all", "open", "pending", "returned", "closed", "archived", "removed"] as const
              ).map((status) => (
                <option key={status} value={status}>
                  {status === "all" ? "All statuses" : status}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={reportedOnly}
                onChange={(event) => {
                  setReportedOnly(event.target.checked);
                  setListingPage(1);
                }}
              />
              Reported only
            </label>
          </div>
          {listings.error && <ErrorMessage message={listings.error.message} />}
          {listings.isPending ? (
            <Loading />
          ) : listings.data?.items.length === 0 ? (
            <Empty>No listings in this view.</Empty>
          ) : (
            <div className="space-y-4">
              {listings.data?.items.map((item) => (
                <ListingModerationCard
                  key={item.id}
                  item={item}
                  busy={busy === item.id}
                  run={run}
                />
              ))}
            </div>
          )}
          {listings.data && (
            <PageControls
              page={listingPage}
              pages={listings.data.pagination.pages}
              setPage={setListingPage}
            />
          )}
        </section>
      )}

      {section === "reports" && (
        <section className="mt-6">
          {reports.error && <ErrorMessage message={reports.error.message} />}
          {reports.isPending ? (
            <Loading />
          ) : reports.data?.length === 0 ? (
            <Empty>
              <ShieldCheck className="mx-auto mb-2 h-9 w-9 text-found" />
              No open reports.
            </Empty>
          ) : (
            <div className="space-y-4">
              {reports.data?.map((report) => (
                <ReportCard key={report.id} report={report} busy={busy === report.id} run={run} />
              ))}
            </div>
          )}
        </section>
      )}

      {section === "users" && (
        <section className="mt-6">
          <input
            className="input-cf mb-4 max-w-md"
            placeholder="Search name or email"
            value={userQuery}
            onChange={(event) => {
              setUserQuery(event.target.value);
              setUserPage(1);
            }}
          />
          {users.error && <ErrorMessage message={users.error.message} />}
          {users.isPending ? (
            <Loading />
          ) : (
            <div className="space-y-3">
              {users.data?.users.map((person) => (
                <UserCard
                  key={person.id}
                  person={person}
                  self={person.id === user?.id}
                  busy={busy === person.id}
                  run={run}
                />
              ))}
            </div>
          )}
          {users.data && (
            <PageControls
              page={userPage}
              pages={users.data.pagination.pages}
              setPage={setUserPage}
            />
          )}
        </section>
      )}

      {section === "claims" && (
        <section className="mt-6">
          <p className="mb-4 text-sm text-muted-foreground">
            Verification answers and contact details are withheld from this admin view.
          </p>
          {claims.error && <ErrorMessage message={claims.error.message} />}
          {claims.isPending ? (
            <Loading />
          ) : claims.data?.claims.length === 0 ? (
            <Empty>No claims to review.</Empty>
          ) : (
            <div className="space-y-3">
              {claims.data?.claims.map((claim) => (
                <ClaimModerationCard
                  key={claim.id}
                  claim={claim}
                  busy={busy === claim.id}
                  run={run}
                />
              ))}
            </div>
          )}
          {claims.data && (
            <PageControls
              page={claimPage}
              pages={claims.data.pagination.pages}
              setPage={setClaimPage}
            />
          )}
        </section>
      )}

      {section === "audit" && (
        <section className="mt-6">
          {audit.error && <ErrorMessage message={audit.error.message} />}
          {audit.isPending ? (
            <Loading />
          ) : audit.data?.length === 0 ? (
            <Empty>No administrative actions recorded yet.</Empty>
          ) : (
            <div className="space-y-3">
              {audit.data?.map((entry) => (
                <div key={entry.id} className="card-soft p-4 text-sm">
                  <div className="flex flex-wrap justify-between gap-2">
                    <strong>{entry.action.replaceAll(".", " · ")}</strong>
                    <span className="text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    By {entry.actor?.name ?? "Administrator"} · {entry.targetType} ·{" "}
                    {entry.reason ?? "No reason provided"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Overview({
  data,
  loading,
  error,
}: {
  data: AdminOverview | undefined;
  loading: boolean;
  error: string | undefined;
}) {
  if (loading) return <Loading />;
  if (error || !data) return <ErrorMessage message={error ?? "Analytics unavailable."} />;
  const cards = [
    { label: "Registered users", value: data.totalUsers, icon: Users },
    { label: "Lost listings", value: data.totalLostListings, icon: PackageSearch },
    { label: "Found listings", value: data.totalFoundListings, icon: PackageSearch },
    { label: "Items returned", value: data.totalReturnedItems, icon: RotateCcw },
    { label: "Pending claims", value: data.pendingClaims, icon: ClipboardList },
  ];
  return (
    <section className="mt-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="card-soft flex items-center gap-4 p-5">
            <span className="rounded-xl bg-primary/10 p-3 text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-sm text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="card-soft mt-5 p-5">
        <h2 className="font-semibold">Most reported categories</h2>
        {data.mostReportedCategories.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No reports yet.</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {data.mostReportedCategories.map((entry) => (
              <li key={entry.category} className="flex justify-between text-sm">
                <span>{entry.category}</span>
                <span className="text-muted-foreground">{entry.reports} reports</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function ListingModerationCard({
  item,
  busy,
  run,
}: {
  item: AdminListing;
  busy: boolean;
  run: (id: string, action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const action = (
    value: "close" | "remove" | "archive" | "restore",
    reason: string,
    label: string,
  ) => {
    if (["remove", "archive"].includes(value) && !window.confirm(`${label} this listing?`)) return;
    void run(item.id, () => moderateListing(item.id, value, reason), label);
  };
  return (
    <article className="card-soft flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
      <ItemImage src={item.image} alt={item.name} className="h-20 w-full rounded-xl sm:w-28" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={item.type} />
          <span className="rounded-full bg-secondary px-2 py-1 text-xs capitalize">
            {item.status}
          </span>
          {item.reportCount > 0 && (
            <span className="text-xs font-semibold text-destructive">
              {item.reportCount} open report{item.reportCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <Link
          to="/listing/$id"
          params={{ id: item.id }}
          className="mt-1 block font-semibold hover:text-primary"
        >
          {item.name}
        </Link>
        <p className="line-clamp-1 text-sm text-muted-foreground">
          {item.category} · {item.location} · {item.reporter?.email ?? "Unknown reporter"}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {["open", "closed"].includes(item.status) && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => action("close", "Closed by admin review.", "Listing closed")}
          >
            Close
          </Button>
        )}
        {["open", "closed"].includes(item.status) && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => action("archive", "Archived by admin review.", "Listing archived")}
          >
            Archive
          </Button>
        )}
        {item.status !== "removed" && (
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => action("remove", "Removed by admin review.", "Listing removed")}
          >
            Remove
          </Button>
        )}
        {["removed", "archived"].includes(item.status) && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => action("restore", "Restored by admin review.", "Listing restored")}
          >
            Restore
          </Button>
        )}
      </div>
    </article>
  );
}

function ReportCard({
  report,
  busy,
  run,
}: {
  report: AdminReport;
  busy: boolean;
  run: (id: string, action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  return (
    <article className="card-soft p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase text-destructive">
            {report.reason.replaceAll("_", " ")}
          </p>
          <p className="mt-1 font-semibold">{report.item?.name ?? "Listing unavailable"}</p>
          <p className="text-sm text-muted-foreground">
            Reported by {report.reporter?.name ?? "Unknown user"} · {report.reporter?.email ?? ""}
          </p>
        </div>
        {report.item && (
          <Link
            className="text-sm text-primary underline"
            to="/listing/$id"
            params={{ id: report.item.id }}
          >
            View listing
          </Link>
        )}
      </div>
      {report.details && <p className="mt-3 whitespace-pre-wrap text-sm">{report.details}</p>}
      <div className="mt-4 flex gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            void run(report.id, () => reviewReport(report.id, "reviewed"), "Report marked reviewed")
          }
        >
          Mark reviewed
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => {
            if (window.confirm("Dismiss this report?"))
              void run(report.id, () => reviewReport(report.id, "dismissed"), "Report dismissed");
          }}
        >
          Dismiss
        </Button>
      </div>
    </article>
  );
}

function UserCard({
  person,
  self,
  busy,
  run,
}: {
  person: AdminUser;
  self: boolean;
  busy: boolean;
  run: (id: string, action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const next = person.status === "active" ? "suspended" : "active";
  return (
    <article className="card-soft flex flex-wrap items-center justify-between gap-3 p-4">
      <div>
        <p className="font-semibold">
          {person.name}{" "}
          <span className="text-xs font-normal capitalize text-muted-foreground">
            · {person.role} · {person.status}
          </span>
        </p>
        <p className="text-sm text-muted-foreground">
          {person.email} · {person.listingCount} listings · {person.claimCount} claims
        </p>
      </div>
      <Button
        size="sm"
        variant={next === "suspended" ? "destructive" : "outline"}
        disabled={busy || self}
        onClick={() => {
          if (
            next === "suspended" &&
            !window.confirm(`Suspend ${person.name}'s account? Their sessions will be revoked.`)
          )
            return;
          void run(
            person.id,
            () => moderateUser(person.id, next),
            next === "suspended" ? "Account suspended" : "Account reactivated",
          );
        }}
      >
        {next === "suspended" ? "Suspend" : "Reactivate"}
      </Button>
    </article>
  );
}

function ClaimModerationCard({
  claim,
  busy,
  run,
}: {
  claim: AdminClaim;
  busy: boolean;
  run: (id: string, action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const action = claim.status === "approved" ? "revoke" : "reject";
  return (
    <article className="card-soft flex flex-wrap items-center justify-between gap-3 p-4">
      <div>
        <p className="font-semibold">
          {claim.item?.name ?? "Listing unavailable"}{" "}
          <span className="text-xs font-normal capitalize text-muted-foreground">
            · {claim.status}
          </span>
        </p>
        <p className="text-sm text-muted-foreground">
          {claim.claimant?.name ?? "Unknown claimant"} · {claim.claimant?.email ?? ""} ·{" "}
          {claim.item?.category ?? ""}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Verification answer hidden from administrators.
        </p>
      </div>
      {["pending", "approved"].includes(claim.status) && (
        <Button
          size="sm"
          variant="destructive"
          disabled={busy}
          onClick={() => {
            const label = action === "revoke" ? "Revoke approval" : "Decline claim";
            if (window.confirm(`${label} for this claim?`))
              void run(
                claim.id,
                () => moderateClaim(claim.id, action),
                action === "revoke" ? "Approved claim revoked" : "Claim declined",
              );
          }}
        >
          {action === "revoke" ? "Revoke approval" : "Decline claim"}
        </Button>
      )}
    </article>
  );
}

function PageControls({
  page,
  pages,
  setPage,
}: {
  page: number;
  pages: number;
  setPage: (page: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <div className="mt-5 flex items-center justify-center gap-4 text-sm">
      <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
        Previous
      </Button>
      <span className="text-muted-foreground">
        Page {page} of {pages}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={page >= pages}
        onClick={() => setPage(page + 1)}
      >
        Next
      </Button>
    </div>
  );
}
function Loading() {
  return <div className="card-soft mt-4 py-10 text-center text-muted-foreground">Loading…</div>;
}
function Empty({ children }: { children: ReactNode }) {
  return <div className="card-soft mt-4 py-10 text-center text-muted-foreground">{children}</div>;
}
function ErrorMessage({ message }: { message: string }) {
  return (
    <p role="alert" className="card-soft mt-4 p-4 text-destructive">
      {message}
    </p>
  );
}
