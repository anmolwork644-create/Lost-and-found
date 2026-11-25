import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/lib/auth-context";

const signedInUser = {
  id: "user-1",
  name: "Campus User",
  email: "user@campus.edu",
  role: "student" as const,
  emailVerified: true,
};

function mockResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function AuthProbe() {
  const { register, user, loading } = useAuth();
  return (
    <div>
      <p>{loading ? "loading" : (user?.email ?? "signed out")}</p>
      <button
        onClick={() =>
          void register({
            name: signedInUser.name,
            email: signedInUser.email,
            password: "long-test-password",
            role: "student",
          })
        }
      >
        Register
      </button>
    </div>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("registration authentication", () => {
  it("sets the new user as signed in when registration returns an auth session", async () => {
    const fetchMock = vi.fn().mockImplementation((input: string) => {
      if (input.endsWith("/auth/me") || input.endsWith("/auth/refresh"))
        return Promise.resolve(mockResponse({ error: { message: "Sign in" } }, 401));
      if (input.endsWith("/auth/register"))
        return Promise.resolve(
          mockResponse(
            { user: signedInUser, verificationRequired: false, message: "Account created." },
            201,
          ),
        );
      return Promise.reject(new Error(`Unexpected API request: ${input}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await screen.findByText("signed out");
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    expect(await screen.findByText(signedInUser.email)).toBeInTheDocument();
  });
});
