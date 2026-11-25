import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/cf/Field";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/register")({ component: RegisterPage });

function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"student" | "staff">("student");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await register({ name, email, password, role });
      toast.success(result.message);
      if (result.verificationRequired) {
        setMessage(result.message);
      } else {
        await navigate({ to: "/" });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-cf max-w-md py-12">
      <h1 className="text-3xl font-bold">Create an account</h1>
      <p className="mt-2 text-muted-foreground">Use your college email to join CampusFind.</p>
      <form onSubmit={submit} className="card-soft mt-6 space-y-5 p-6">
        {message ? (
          <div role="status" className="rounded-xl bg-secondary p-4 text-sm">
            {message}
          </div>
        ) : (
          <>
            <Field label="Full name">
              <input
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
                className="input-cf"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field label="College email">
              <input
                required
                type="email"
                autoComplete="email"
                className="input-cf"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field label="I am a">
              <select
                className="input-cf"
                value={role}
                onChange={(event) => setRole(event.target.value as "student" | "staff")}
              >
                <option value="student">Student</option>
                <option value="staff">Staff</option>
              </select>
            </Field>
            <Field label="Password" hint="Use 10 or more characters.">
              <input
                required
                type="password"
                minLength={10}
                maxLength={72}
                autoComplete="new-password"
                className="input-cf"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            <Button disabled={busy} type="submit" className="w-full">
              {busy ? "Creating account…" : "Create account"}
            </Button>
          </>
        )}
        <p className="text-center text-sm text-muted-foreground">
          Already registered?{" "}
          <Link to="/login" className="font-medium text-primary underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
