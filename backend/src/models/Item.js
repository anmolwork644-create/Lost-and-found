import mongoose from "mongoose";

const categories = [
  "ID Card",
  "Accessories",
  "Book",
  "Notebook",
  "Wallet",
  "Keys",
  "Charger",
  "Water Bottle",
  "Other",
];
const locations = [
  "Library",
  "Library Entrance",
  "Canteen",
  "Hostel",
  "Main Gate",
  "Classroom Block",
  "Sports Ground",
  "Other",
];

const itemSchema = new mongoose.Schema(
  {
    reporterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: { type: String, enum: ["lost", "found"], required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, required: true, enum: categories, index: true },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    location: { type: String, required: true, enum: locations, index: true },
    itemDate: { type: Date, required: true, index: true },
    imageUrl: { type: String, trim: true },
    imageStorageKey: { type: String, select: false },
    privateContact: { type: String, required: true, trim: true, maxlength: 200, select: false },
    verificationQuestion: { type: String, trim: true, maxlength: 250, select: false },
    status: { type: String, enum: ["open", "pending", "returned", "closed", "archived", "removed"], default: "open", index: true },
    moderationPreviousStatus: {
      type: String,
      enum: ["open", "closed", "returned"],
      select: false,
    },
    activeClaimId: { type: mongoose.Schema.Types.ObjectId, ref: "Claim", default: null },
    claimRequestRevision: { type: Number, default: 0, select: false },
  },
  { timestamps: true },
);

itemSchema.index({ status: 1, type: 1, createdAt: -1 });
itemSchema.index({ reporterId: 1, createdAt: -1 });

export const Item = mongoose.model("Item", itemSchema);
