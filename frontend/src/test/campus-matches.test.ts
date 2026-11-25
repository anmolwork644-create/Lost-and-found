import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchListings, fetchPossibleMatches, saveListing } from "@/lib/listing-api";
import { resolveImageUrl } from "@/lib/image-url";

const item = {
  id: "listing-1",
  type: "found" as const,
  name: "Wallet",
  category: "Wallet",
  description: "Found near the library",
  location: "Library",
  date: "2026-11-24",
  status: "open" as const,
  mine: false,
};

function mockResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe("frontend API integration", () => {
  it("loads backend-stored photos through the configured API origin", () => {
    const result = resolveImageUrl("/uploads/123e4567-e89b-12d3-a456-426614174000.png");

    expect(new URL(result!).pathname).toBe("/uploads/123e4567-e89b-12d3-a456-426614174000.png");
    expect(resolveImageUrl("https://images.example.test/item.png")).toBe(
      "https://images.example.test/item.png",
    );
  });

  it("loads listing results from the API with the active search filters", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        mockResponse({ items: [item], pagination: { page: 1, limit: 12, total: 1, pages: 1 } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const params = new URLSearchParams({
      q: "blue wallet",
      type: "found",
      location: "Library",
      page: "1",
    });

    const result = await fetchListings(params);

    expect(result.items).toEqual([item]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/items?q=blue+wallet&type=found&location=Library&page=1",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: "include" });
  });

  it("submits a listing photo as multipart form data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ item }));
    vi.stubGlobal("fetch", fetchMock);
    const form = new FormData();
    form.set("name", item.name);
    form.set("image", new File(["photo"], "wallet.png", { type: "image/png" }));

    await saveListing("found", form);

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: form,
      credentials: "include",
    });
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).has("Content-Type")).toBe(false);
  });

  it("shows suggestions returned by the backend matcher", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        mockResponse({ matches: [{ item, score: 72, reasons: ["Same category", "Nearby date"] }] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const matches = await fetchPossibleMatches("listing-1");

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      score: 72,
      item: { id: item.id },
      reasons: ["Same category", "Nearby date"],
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/items/listing-1/matches");
  });
});
