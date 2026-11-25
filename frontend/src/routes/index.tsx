import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ListingCard } from "@/components/cf/ListingCard";
import { CATEGORIES, LOCATIONS } from "@/lib/campus-data";
import { fetchListings } from "@/lib/listing-api";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CampusFind — Campus Lost & Found" },
      {
        name: "description",
        content:
          "Search lost and found items on campus, report what you lost or found, and claim items safely.",
      },
      { property: "og:title", content: "CampusFind — Campus Lost & Found" },
      {
        property: "og:description",
        content: "Search, report and safely claim lost items on campus.",
      },
    ],
  }),
  component: Home,
});

type Tab = "all" | "lost" | "found";

function Home() {
  const [q, setQ] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [cat, setCat] = useState("");
  const [loc, setLoc] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<"open" | "pending" | "returned" | "closed" | "all">("open");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(q.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [q]);

  const { data, isPending, error } = useQuery({
    queryKey: ["items", tab, cat, loc, from, to, status, debouncedQuery, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (tab !== "all") params.set("type", tab);
      if (cat) params.set("category", cat);
      if (loc) params.set("location", loc);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (status !== "open") params.set("status", status);
      if (debouncedQuery) params.set("q", debouncedQuery);
      params.set("page", String(page));
      params.set("limit", "12");
      return fetchListings(params);
    },
  });
  const listings = data?.items ?? [];
  const items = listings;

  return (
    <>
      <section className="hero-cf">
        <div className="container-cf py-14 text-center md:py-20">
          <h1 className="text-3xl font-extrabold tracking-tight md:text-5xl">
            Lost it? Found it? <span className="text-hero-accent">Bring it home.</span>
          </h1>
          <p className="mx-auto mt-3 max-w-xl opacity-80">
            The campus lost & found board for students and staff.
          </p>
          <div className="mx-auto mt-8 flex max-w-2xl items-center gap-3 rounded-2xl bg-card p-2 pl-4 text-card-foreground shadow-lg">
            <Search className="h-5 w-5 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search wallets, keys, notebooks…"
              className="h-12 flex-1 bg-transparent text-base outline-none"
            />
          </div>
        </div>
      </section>

      <section className="container-cf py-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select
            className="input-cf"
            value={tab}
            onChange={(e) => {
              setTab(e.target.value as Tab);
              setPage(1);
            }}
            aria-label="Type"
          >
            <option value="all">All types</option>
            <option value="lost">Lost</option>
            <option value="found">Found</option>
          </select>
          <select
            className="input-cf"
            value={cat}
            onChange={(e) => {
              setCat(e.target.value);
              setPage(1);
            }}
            aria-label="Category"
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            className="input-cf"
            value={loc}
            onChange={(e) => {
              setLoc(e.target.value);
              setPage(1);
            }}
            aria-label="Location"
          >
            <option value="">All locations</option>
            {LOCATIONS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input
            type="date"
            className="input-cf"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            aria-label="From date"
            title="From date"
          />
          <input
            type="date"
            className="input-cf"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            aria-label="To date"
            title="To date"
          />
          <select
            className="input-cf"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as typeof status);
              setPage(1);
            }}
            aria-label="Listing status"
          >
            <option value="open">Open listings</option>
            <option value="pending">Claim in progress</option>
            <option value="returned">Returned items</option>
            <option value="closed">Closed listings</option>
            <option value="all">All statuses</option>
          </select>
        </div>

        <div className="mt-6 inline-flex rounded-xl bg-secondary p-1">
          {(["all", "lost", "found"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setPage(1);
              }}
              className={`rounded-lg px-5 py-2 text-sm font-medium capitalize transition ${tab === t ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
            >
              {t}
            </button>
          ))}
        </div>

        {isPending ? (
          <div className="card-soft mt-8 py-16 text-center text-muted-foreground">
            Loading listings…
          </div>
        ) : error ? (
          <div role="alert" className="card-soft mt-8 py-16 text-center text-destructive">
            {error.message}
          </div>
        ) : items.length === 0 ? (
          <div className="card-soft mt-8 py-16 text-center text-muted-foreground">
            No items match your search.
          </div>
        ) : (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((l) => (
              <ListingCard key={l.id} l={l} />
            ))}
          </div>
        )}
        {!isPending && !error && data?.pagination && data.pagination.pages > 0 && (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-sm">
            <button
              className="rounded-lg border px-4 py-2 disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </button>
            <span className="text-muted-foreground">
              Page {data.pagination.page} of {data.pagination.pages} · {data.pagination.total}{" "}
              listings
            </span>
            <button
              className="rounded-lg border px-4 py-2 disabled:opacity-50"
              disabled={page >= data.pagination.pages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </div>
        )}
      </section>
    </>
  );
}
