export type ListingType = "lost" | "found";
export type ListingStatus = "open" | "pending" | "returned" | "closed" | "archived" | "removed";
export const CATEGORIES = [
  "ID Card",
  "Accessories",
  "Book",
  "Notebook",
  "Wallet",
  "Keys",
  "Charger",
  "Water Bottle",
  "Other",
] as const;
export const LOCATIONS = [
  "Library",
  "Library Entrance",
  "Canteen",
  "Hostel",
  "Main Gate",
  "Classroom Block",
  "Sports Ground",
  "Other",
] as const;

export interface Listing {
  id: string;
  type: ListingType;
  name: string;
  category: string;
  description: string;
  location: string;
  date: string;
  image?: string | undefined;
  verificationQuestion?: string;
  contact?: string; // returned by the API only to the listing owner
  status: ListingStatus;
  /** Present on authenticated responses to identify the current user's listing. */
  mine: boolean;
}
