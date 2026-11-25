import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";

export function RequireAuth({ children, role }: { children: ReactNode; role?: "admin" }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="container-cf py-16 text-center text-muted-foreground">
        Checking your account…
      </div>
    );
  if (!user)
    return (
      <div className="container-cf max-w-lg py-16">
        <div className="card-soft p-8 text-center">
          <h1 className="text-2xl font-bold">Sign in required</h1>
          <p className="mt-2 text-muted-foreground">Sign in to access this part of CampusFind.</p>
          <Link to="/login" className="mt-5 inline-block text-primary underline">
            Go to sign in
          </Link>
        </div>
      </div>
    );
  if (role && user.role !== role)
    return (
      <div className="container-cf max-w-lg py-16">
        <div className="card-soft p-8 text-center">
          <h1 className="text-2xl font-bold">Administrator access required</h1>
          <p className="mt-2 text-muted-foreground">
            Your account does not have permission to view this page.
          </p>
        </div>
      </div>
    );
  return children;
}
