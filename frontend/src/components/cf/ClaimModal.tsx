import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Listing } from "@/lib/campus-data";
import { fetchClaimPrompt, submitClaim } from "@/lib/claim-api";
import { Field } from "./Field";

export function ClaimModal({
  listing,
  open,
  onOpenChange,
}: {
  listing: Listing;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [f, setF] = useState({ contact: "", answer: "", message: "" });
  const [busy, setBusy] = useState(false);
  const {
    data: prompt,
    isPending: promptLoading,
    error: promptError,
  } = useQuery({
    queryKey: ["claim-prompt", listing.id],
    queryFn: () => fetchClaimPrompt(listing.id),
    enabled: open,
  });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await submitClaim(listing.id, {
        contact: f.contact,
        answer: f.answer,
        ...(f.message ? { message: f.message } : {}),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["claims", "submitted"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
      toast.success("Claim sent", { description: "The listing owner will review your request." });
      setF({ contact: "", answer: "", message: "" });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit your claim");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Claim this item</DialogTitle>
          <DialogDescription>{listing.name}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Your account name will be shared with the listing owner. Contact details are shared only
            if the claim is approved.
          </p>
          <Field label="Private contact (email or phone)">
            <input
              required
              minLength={3}
              maxLength={200}
              className="input-cf"
              value={f.contact}
              onChange={(e) => setF({ ...f, contact: e.target.value })}
            />
          </Field>
          <Field label={prompt?.prompt ?? "Ownership verification"}>
            <textarea
              required
              minLength={2}
              maxLength={2000}
              rows={3}
              className="input-cf"
              value={f.answer}
              onChange={(e) => setF({ ...f, answer: e.target.value })}
            />
          </Field>
          <Field label="Message (optional)">
            <textarea
              maxLength={1000}
              rows={2}
              className="input-cf"
              value={f.message}
              onChange={(e) => setF({ ...f, message: e.target.value })}
            />
          </Field>
          {promptError && (
            <p role="alert" className="text-sm text-destructive">
              {promptError.message}
            </p>
          )}
          <Button
            disabled={busy || promptLoading || Boolean(promptError)}
            type="submit"
            className="w-full"
          >
            {busy ? "Sending…" : "Send claim"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Your answer is private to you and the listing owner. Contact details are shared after
            approval.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
