import { PackageSearch } from "lucide-react";
import { resolveImageUrl } from "@/lib/image-url";

export function ItemImage({
  src,
  alt,
  className = "",
}: {
  src?: string | undefined;
  alt: string;
  className?: string;
}) {
  if (!src)
    return (
      <div className={`flex items-center justify-center bg-secondary text-primary/40 ${className}`}>
        <PackageSearch className="h-12 w-12" />
      </div>
    );
  return (
    <img
      src={resolveImageUrl(src)}
      alt={alt}
      loading="lazy"
      className={`object-cover ${className}`}
    />
  );
}
