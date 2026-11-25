import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/cf/Field";
import { useAuth } from "@/lib/auth-context";
import { reportListing } from "@/lib/admin-api";

export function ReportButton({ id, mine = false }: { id: string; mine?: boolean }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<
    "inappropriate" | "misleading" | "duplicate" | "private_information" | "other"
  >("inappropriate");
  const [details, setDetails] = useState("");
  if (mine) return null;
  if (!user)
    return (
      <Link
        to="/login"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
      >
        <Flag className="h-3 w-3" />
        Sign in to report
      </Link>
    );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await reportListing(id, reason, details);
      toast.success("Report sent", { description: "A moderator will review this listing." });
      setDetails("");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit report");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
      >
        <Flag className="h-3 w-3" /> Report listing
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Report listing</DialogTitle>
            <DialogDescription>
              Reports are private and reviewed by campus moderators.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Reason">
              <select
                className="input-cf"
                value={reason}
                onChange={(event) => setReason(event.target.value as typeof reason)}
              >
                <option value="inappropriate">Inappropriate content</option>
                <option value="misleading">Misleading information</option>
                <option value="duplicate">Duplicate listing</option>
                <option value="private_information">Exposes private information</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Details (optional)">
              <textarea
                rows={3}
                maxLength={1000}
                className="input-cf"
                value={details}
                onChange={(event) => setDetails(event.target.value)}
              />
            </Field>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Sending…" : "Send report"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
