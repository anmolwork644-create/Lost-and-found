import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Lock } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/cf/Field";
import { RequireAuth } from "@/components/cf/RequireAuth";
import { CATEGORIES, LOCATIONS, type ListingType } from "@/lib/campus-data";
import { fetchListing, saveListing } from "@/lib/listing-api";
import { resolveImageUrl } from "@/lib/image-url";

export const Route = createFileRoute("/post")({
  validateSearch: (search: Record<string, unknown>) => ({
    edit: typeof search["edit"] === "string" ? search["edit"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Post an Item — CampusFind" },
      { name: "description", content: "Report a lost or found item on campus." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <PostPage />
    </RequireAuth>
  ),
});

const empty = {
  name: "",
  category: "",
  description: "",
  location: "",
  date: "",
  question: "",
  contact: "",
};

function PostPage() {
  const { edit } = Route.useSearch();
  const queryClient = useQueryClient();
  const {
    data: existing,
    isPending: loadingListing,
    error: loadError,
  } = useQuery({
    queryKey: ["item", edit],
    queryFn: () => fetchListing(edit!),
    enabled: Boolean(edit),
  });
  const [type, setType] = useState<ListingType>("lost");
  const [fields, setFields] = useState(empty);
  const [imageFile, setImageFile] = useState<File>();
  const [currentImage, setCurrentImage] = useState<string>();
  const [removeImage, setRemoveImage] = useState(false);
  const [filePreview, setFilePreview] = useState<string>();
  const [savedId, setSavedId] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!existing || !edit) return;
    setType(existing.type);
    setFields({
      name: existing.name,
      category: existing.category,
      description: existing.description,
      location: existing.location,
      date: existing.date,
      question: existing.verificationQuestion ?? "",
      contact: existing.contact ?? "",
    });
    setCurrentImage(existing.image);
  }, [edit, existing]);

  useEffect(() => {
    if (!imageFile) {
      setFilePreview(undefined);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const set = (key: keyof typeof empty) => (event: { target: { value: string } }) => {
    setFields((previous) => ({ ...previous, [key]: event.target.value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const form = new FormData();
    form.set("name", fields.name);
    form.set("category", fields.category);
    form.set("description", fields.description);
    form.set("location", fields.location);
    form.set("itemDate", fields.date);
    form.set("privateContact", fields.contact);
    if (type === "found" && fields.question.trim())
      form.set("verificationQuestion", fields.question.trim());
    if (imageFile) form.set("image", imageFile);
    if (edit && removeImage) form.set("removeImage", "true");

    try {
      const item = await saveListing(type, form, edit);
      setSavedId(item.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["items"] }),
        queryClient.invalidateQueries({ queryKey: ["my-items"] }),
        queryClient.invalidateQueries({ queryKey: ["item", item.id] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
      toast.success(edit ? "Listing updated" : "Item posted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the listing");
    } finally {
      setBusy(false);
    }
  };

  if (edit && loadingListing)
    return (
      <div className="container-cf py-16 text-center text-muted-foreground">
        Loading your listing…
      </div>
    );
  if (edit && (loadError || !existing))
    return (
      <div role="alert" className="container-cf py-16 text-center text-destructive">
        {loadError?.message ?? "This listing could not be found."}
      </div>
    );

  if (savedId)
    return (
      <div className="container-cf max-w-lg py-16">
        <div className="card-soft p-8 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-found" />
          <h1 className="mt-4 text-2xl font-bold">
            {edit ? "Your listing is updated" : "Your item is posted"}
          </h1>
          <p className="mt-2 text-muted-foreground">Your listing is now saved in CampusFind.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link to="/listing/$id" params={{ id: savedId }}>
                View listing
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/my-listings">My listings</Link>
            </Button>
            {!edit && (
              <Button variant="outline" onClick={() => setSavedId(undefined)}>
                Post another
              </Button>
            )}
          </div>
        </div>
      </div>
    );

  return (
    <div className="container-cf max-w-2xl py-10">
      <h1 className="text-3xl font-bold">{edit ? "Edit your listing" : "Post an item"}</h1>
      <form onSubmit={submit} className="card-soft mt-6 space-y-5 p-6">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-secondary p-1">
          {(["lost", "found"] as ListingType[]).map((value) => (
            <button
              type="button"
              key={value}
              disabled={Boolean(edit)}
              onClick={() => setType(value)}
              className={`rounded-lg py-2.5 text-sm font-semibold transition ${type === value ? (value === "lost" ? "bg-lost text-lost-foreground" : "bg-found text-found-foreground") : "text-muted-foreground"}`}
            >
              {value === "lost" ? "I lost something" : "I found something"}
            </button>
          ))}
        </div>
        <Field label="Item name">
          <input
            required
            minLength={2}
            maxLength={120}
            className="input-cf"
            value={fields.name}
            onChange={set("name")}
            placeholder="e.g. Black leather wallet"
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Category">
            <select
              required
              className="input-cf"
              value={fields.category}
              onChange={set("category")}
            >
              <option value="">Select…</option>
              {CATEGORIES.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </Field>
          <Field label="Approximate location">
            <select
              required
              className="input-cf"
              value={fields.location}
              onChange={set("location")}
            >
              <option value="">Select…</option>
              {LOCATIONS.map((location) => (
                <option key={location}>{location}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Date">
          <input
            required
            type="date"
            className="input-cf"
            value={fields.date}
            onChange={set("date")}
          />
        </Field>
        <Field
          label="Description"
          hint={
            type === "found"
              ? "Keep unique identifying details private. Add a verification question below so the owner can confirm the item."
              : undefined
          }
        >
          <textarea
            required
            minLength={3}
            maxLength={2000}
            rows={3}
            className="input-cf"
            value={fields.description}
            onChange={set("description")}
          />
        </Field>
        {type === "found" && (
          <Field label="Verification question" hint="Only you will see this question.">
            <input
              maxLength={250}
              className="input-cf"
              value={fields.question}
              onChange={set("question")}
              placeholder="What is written on the first page?"
            />
          </Field>
        )}
        <div className="space-y-2">
          <span className="text-sm font-medium">Photo (optional, up to 5 MB)</span>
          <div className="flex gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
            Do not upload photos showing ID numbers, card numbers, phone numbers or other sensitive
            information.
          </div>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-4 file:py-2 file:font-medium"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
                toast.error("Choose a JPEG, PNG, or WebP image");
                event.target.value = "";
                setImageFile(undefined);
                return;
              }
              if (file && file.size > 5 * 1024 * 1024) {
                toast.error("Choose an image smaller than 5 MB");
                event.target.value = "";
                setImageFile(undefined);
                return;
              }
              setImageFile(file);
              setRemoveImage(false);
            }}
          />
          {edit && currentImage && !removeImage && !imageFile && (
            <Button type="button" size="sm" variant="outline" onClick={() => setRemoveImage(true)}>
              Remove current photo
            </Button>
          )}
          {removeImage && (
            <Button type="button" size="sm" variant="outline" onClick={() => setRemoveImage(false)}>
              Keep current photo
            </Button>
          )}
          {(filePreview ?? (!removeImage ? currentImage : undefined)) && (
            <img
              src={filePreview ?? resolveImageUrl(currentImage)}
              alt="Listing photo preview"
              className="h-32 rounded-lg object-cover"
            />
          )}
        </div>
        <Field
          label="Private contact (email or phone)"
          hint={
            <span className="inline-flex items-center gap-1">
              <Lock className="h-3 w-3" /> Never shown publicly.
            </span>
          }
        >
          <input
            required
            minLength={3}
            maxLength={200}
            autoComplete="email"
            className="input-cf"
            value={fields.contact}
            onChange={set("contact")}
          />
        </Field>
        <Button disabled={busy} type="submit" size="lg" className="w-full">
          {busy ? "Saving…" : edit ? "Save changes" : "Post item"}
        </Button>
      </form>
    </div>
  );
}
