import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge, TypeBadge } from "@/components/cf/Badges";
import { ItemImage } from "@/components/cf/ItemImage";
import { RequireAuth } from "@/components/cf/RequireAuth";
import { deleteListing, fetchMyListings, updateListingStatus } from "@/lib/listing-api";

export const Route = createFileRoute("/my-listings")({
  head: () => ({
    meta: [
      { title: "My Listings — CampusFind" },
      { name: "description", content: "Manage your lost and found listings." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <MyListings />
    </RequireAuth>
  ),
});

function MyListings() {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string>();
  const {
    data: items = [],
    isPending,
    error,
  } = useQuery({
    queryKey: ["my-items"],
    queryFn: fetchMyListings,
  });

  const changeStatus = async (id: string, status: "open" | "closed") => {
    setBusyId(id);
    try {
      await updateListingStatus(id, status);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-items"] }),
        queryClient.invalidateQueries({ queryKey: ["items"] }),
        queryClient.invalidateQueries({ queryKey: ["item", id] }),
      ]);
      toast.success(status === "closed" ? "Listing closed" : "Listing reopened");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not update the listing");
    } finally {
      setBusyId(undefined);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this listing? This cannot be undone.")) return;
    setBusyId(id);
    try {
      await deleteListing(id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-items"] }),
        queryClient.invalidateQueries({ queryKey: ["items"] }),
        queryClient.removeQueries({ queryKey: ["item", id] }),
      ]);
      toast.success("Listing deleted");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not delete the listing");
    } finally {
      setBusyId(undefined);
    }
  };

  return (
    <div className="container-cf max-w-4xl py-10">
      <h1 className="text-3xl font-bold">My listings</h1>
      {isPending && (
        <div className="card-soft mt-6 py-12 text-center text-muted-foreground">
          Loading your listings…
        </div>
      )}
      {error && (
        <div role="alert" className="card-soft mt-6 py-12 text-center text-destructive">
          {error.message}
        </div>
      )}
      {!isPending && !error && items.length === 0 && (
        <div className="card-soft mt-6 py-12 text-center text-muted-foreground">
          You haven't posted anything yet.{" "}
          <Link to="/post" search={{ edit: undefined }} className="text-primary underline">
            Post an item
          </Link>
        </div>
      )}
      <div className="mt-6 space-y-5">
        {items.map((item) => (
          <div key={item.id} className="card-soft p-5">
            <div className="flex flex-col gap-4 sm:flex-row">
              <ItemImage
                src={item.image}
                alt={item.name}
                className="h-24 w-full rounded-xl sm:w-32"
              />
              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <TypeBadge type={item.type} />
                  <StatusBadge status={item.status} />
                </div>
                <Link
                  to="/listing/$id"
                  params={{ id: item.id }}
                  className="text-lg font-semibold hover:text-primary"
                >
                  {item.name}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {item.location} · {item.date}
                </p>
                {item.contact && (
                  <p className="text-xs text-muted-foreground">Private contact: {item.contact}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 sm:flex-col">
                <Button asChild size="sm" variant="outline">
                  <Link to="/post" search={{ edit: item.id }}>
                    Edit
                  </Link>
                </Button>
                {(item.status === "open" || item.status === "closed") && (
                  <Button
                    size="sm"
                    variant={item.status === "closed" ? "found" : "outline"}
                    disabled={busyId === item.id}
                    onClick={() =>
                      void changeStatus(item.id, item.status === "closed" ? "open" : "closed")
                    }
                  >
                    {item.status === "closed" ? "Reopen" : "Close"}
                  </Button>
                )}
                {item.status === "pending" && (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/claims">Review claim</Link>
                  </Button>
                )}
                {item.status === "returned" && (
                  <span className="px-2 py-1 text-xs text-muted-foreground">Returned</span>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busyId === item.id}
                  onClick={() => void remove(item.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
