import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "student" | "staff" | "admin";
  emailVerified: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    name: string;
    email: string;
    password: string;
    role: "student" | "staff";
  }) => Promise<{ verificationRequired: boolean; message: string }>;
  logout: () => Promise<void>;
}

const apiBase = `${(import.meta.env["VITE_API_URL"] ?? "http://localhost:5000").replace(/\/$/, "")}/api/v1`;
const AuthContext = createContext<AuthContextValue | null>(null);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    const headers = new Headers(init?.headers);
    const isMultipart = typeof FormData !== "undefined" && init?.body instanceof FormData;
    if (!isMultipart && !headers.has("Content-Type"))
      headers.set("Content-Type", "application/json");
    response = await fetch(`${apiBase}${path}`, {
      ...init,
      credentials: "include",
      headers,
    });
  } catch {
    throw new Error("Could not reach the CampusFind server. Check that the backend is running.");
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(payload?.error?.message ?? "The request could not be completed.");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function apiRequest<T>(path: string, init?: RequestInit) {
  return request<T>(path, init);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const loadUser = async () => {
      try {
        const result = await request<{ user: AuthUser }>("/auth/me");
        if (active) setUser(result.user);
      } catch {
        try {
          await request("/auth/refresh", { method: "POST" });
          const result = await request<{ user: AuthUser }>("/auth/me");
          if (active) setUser(result.user);
        } catch {
          if (active) setUser(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadUser();
    return () => {
      active = false;
    };
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    login: async (email, password) => {
      const result = await request<{ user: AuthUser }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setUser(result.user);
    },
    register: async (data) => {
      const result = await request<{
        user: AuthUser;
        verificationRequired: boolean;
        message: string;
      }>("/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!result.verificationRequired) setUser(result.user);
      return result;
    },
    logout: async () => {
      try {
        await request("/auth/logout", { method: "POST" });
      } finally {
        setUser(null);
      }
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be inside AuthProvider");
  return value;
}
