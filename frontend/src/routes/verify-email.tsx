import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/auth-context";

export const Route = createFileRoute("/verify-email")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search["token"] === "string" ? search["token"] : "",
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { token } = Route.useSearch();
  const [message, setMessage] = useState("Verifying your college email…");
  useEffect(() => {
    let active = true;
    apiRequest<{ message: string }>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then((result) => {
        if (active) setMessage(result.message);
      })
      .catch((error: unknown) => {
        if (active)
          setMessage(
            error instanceof Error
              ? error.message
              : "This verification link is invalid or expired.",
          );
      });
    return () => {
      active = false;
    };
  }, [token]);
  return (
    <div className="container-cf max-w-md py-16">
      <div className="card-soft p-8 text-center">
        <h1 className="text-2xl font-bold">Email verification</h1>
        <p className="mt-3 text-muted-foreground">{message}</p>
        <Link to="/login" className="mt-6 inline-block text-primary underline">
          Continue to sign in
        </Link>
      </div>
    </div>
  );
}
