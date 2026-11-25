import { Link } from "@tanstack/react-router";
import { Menu, Search, X } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { fetchUnreadNotificationCount } from "@/lib/claim-api";

const links = [
  { to: "/", label: "Home" },
  { to: "/post", label: "Post an Item" },
  { to: "/my-listings", label: "My Listings" },
  { to: "/claims", label: "Claims" },
  { to: "/moderator", label: "Moderator" },
] as const;

export function Navbar() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: fetchUnreadNotificationCount,
    enabled: Boolean(user),
  });
  const visibleLinks = links.filter(
    (link) =>
      (link.to !== "/moderator" || user?.role === "admin") &&
      (link.to !== "/claims" || Boolean(user)),
  );
  const accountAction = user ? (
    <Button
      variant="outline"
      onClick={() => {
        void logout();
      }}
    >
      Sign out
    </Button>
  ) : (
    <Button variant="outline" asChild>
      <Link to="/login">Sign in</Link>
    </Button>
  );
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="container-cf flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-lg font-extrabold text-primary">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Search className="h-4 w-4" />
          </span>
          CampusFind
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          {visibleLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              activeOptions={{ exact: true }}
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
              activeProps={{ className: "text-primary" }}
            >
              {l.label}
              {l.to === "/claims" && unreadCount > 0 ? (
                <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
                  {unreadCount}
                </span>
              ) : null}
            </Link>
          ))}
          <Button asChild>
            <Link to="/post" search={{ edit: undefined }}>
              Post an Item
            </Link>
          </Button>
          <span className="max-w-32 truncate text-sm text-muted-foreground">{user?.name}</span>
          {accountAction}
        </nav>
        <button className="md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <nav className="container-cf flex flex-col gap-3 border-t py-4 md:hidden">
          {visibleLinks.map((l) => (
            <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="font-medium">
              {l.label}
              {l.to === "/claims" && unreadCount > 0 ? ` (${unreadCount})` : ""}
            </Link>
          ))}
          <Button asChild>
            <Link to="/post" search={{ edit: undefined }} onClick={() => setOpen(false)}>
              Post an Item
            </Link>
          </Button>
          {user && <span className="text-sm text-muted-foreground">{user.name}</span>}
          {user ? (
            <Button
              variant="outline"
              onClick={() => {
                void logout();
                setOpen(false);
              }}
            >
              Sign out
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link to="/login" onClick={() => setOpen(false)}>
                Sign in
              </Link>
            </Button>
          )}
        </nav>
      )}
    </header>
  );
}
