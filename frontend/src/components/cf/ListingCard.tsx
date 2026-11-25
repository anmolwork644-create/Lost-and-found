import { Link } from "@tanstack/react-router";
import { Calendar, MapPin } from "lucide-react";
import type { Listing } from "@/lib/campus-data";
import { StatusBadge, TypeBadge } from "./Badges";
import { ItemImage } from "./ItemImage";

export function ListingCard({ l }: { l: Listing }) {
  return (
    <Link
      to="/listing/$id"
      params={{ id: l.id }}
      className="card-soft group flex flex-col overflow-hidden transition hover:-translate-y-0.5"
    >
      <div className="relative">
        <ItemImage src={l.image} alt={l.name} className="aspect-[4/3] w-full" />
        <div className="absolute left-3 top-3">
          <TypeBadge type={l.type} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-tight group-hover:text-primary">{l.name}</h3>
          <StatusBadge status={l.status} />
        </div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {l.category}
        </p>
        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {l.location}
          </span>
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            {l.date}
          </span>
        </div>
      </div>
    </Link>
  );
}
