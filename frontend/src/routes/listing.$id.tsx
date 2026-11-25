import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Calendar, MapPin, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, TypeBadge } from "@/components/cf/Badges";
import { ItemImage } from "@/components/cf/ItemImage";
import { ListingCard } from "@/components/cf/ListingCard";
import { ClaimModal } from "@/components/cf/ClaimModal";
import { ReportButton } from "@/components/cf/ReportButton";
import { useAuth } from "@/lib/auth-context";
import { fetchListing, fetchPossibleMatches } from "@/lib/listing-api";

export const Route = createFileRoute("/listing/$id")({
  head: () => ({
    meta: [
      { title: "Item details — CampusFind" },
      { name: "description", content: "See details of a lost or found item." },
    ],
  }),
  component: Detail,
});

function Detail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const [claimOpen, setClaimOpen] = useState(false);
  const {
    data: listing,
    isPending,
    error,
  } = useQuery({ queryKey: ["item", id], queryFn: () => fetchListing(id) });
  const {
    data: matches = [],
    isPending: matchesPending,
    error: matchesError,
  } = useQuery({
    queryKey: ["items", "matches", id],
    queryFn: () => fetchPossibleMatches(id),
    enabled: listing?.status === "open",
  });

  if (isPending) {
    return (
      <div className="container-cf py-20 text-center text-muted-foreground">Loading listing…</div>
    );
  }
  if (error || !listing) {
    return (
      <div className="container-cf py-20 text-center text-muted-foreground">
        This listing isn't available.{" "}
        <Link to="/" className="text-primary underline">
          Back home
        </Link>
      </div>
    );
  }

  return (
    <div className="container-cf py-8">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <div className="mt-4 grid gap-8 lg:grid-cols-2">
        <ItemImage
          src={listing.image}
          alt={listing.name}
          className="aspect-[4/3] w-full rounded-2xl shadow-soft"
        />
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <TypeBadge type={listing.type} />
            <StatusBadge status={listing.status} />
          </div>
          <h1 className="text-3xl font-bold">{listing.name}</h1>
          <p className="text-muted-foreground">{listing.description}</p>
          <ReportButton id={listing.id} mine={listing.mine} />
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="card-soft p-3">
              <dt className="flex items-center gap-1 text-muted-foreground">
                <Tag className="h-3.5 w-3.5" />
                Category
              </dt>
              <dd className="font-medium">{listing.category}</dd>
            </div>
            <div className="card-soft p-3">
              <dt className="flex items-center gap-1 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                Location
              </dt>
              <dd className="font-medium">{listing.location}</dd>
            </div>
            <div className="card-soft p-3">
              <dt className="flex items-center gap-1 text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                Date
              </dt>
              <dd className="font-medium">{listing.date}</dd>
            </div>
          </dl>
          {listing.mine && (
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>This is your listing.</span>
              <Button asChild size="sm" variant="outline">
                <Link to="/post" search={{ edit: listing.id }}>
                  Edit listing
                </Link>
              </Button>
              <Link to="/my-listings" className="text-primary underline">
                My Listings
              </Link>
            </div>
          )}
          {!listing.mine &&
            listing.type === "found" &&
            listing.status === "open" &&
            (user ? (
              <Button onClick={() => setClaimOpen(true)}>Request claim</Button>
            ) : (
              <Button asChild>
                <Link to="/login">Sign in to request a claim</Link>
              </Button>
            ))}
        </div>
      </div>

      {listing.status === "open" && (
        <section className="mt-14">
          <h2 className="text-xl font-bold">Possible matches</h2>
          <p className="text-sm text-muted-foreground">
            Suggested {listing.type === "lost" ? "found" : "lost"} items based on item details and
            date. A match is only a suggestion; verify ownership directly.
          </p>
          {matchesPending ? (
            <p className="mt-4 text-sm text-muted-foreground">Checking for possible matches…</p>
          ) : null}
          {matchesError && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {matchesError.message}
            </p>
          )}
          {!matchesPending && !matchesError && matches.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              No likely matches yet. We’ll show suggestions as new listings are added.
            </p>
          )}
          {matches.length > 0 && (
            <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {matches.map(({ item, score, reasons }) => (
                <div key={item.id} className="space-y-2">
                  <ListingCard l={item} />
                  <div className="px-1 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">{score}% match suggestion</p>
                    <p>{reasons.join(" · ")}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      <ClaimModal listing={listing} open={claimOpen} onOpenChange={setClaimOpen} />
    </div>
  );
}
