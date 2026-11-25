import mongoose from "mongoose";

const decisionSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, enum: ["approved", "rejected", "cancelled", "completed"], required: true },
    note: { type: String, trim: true, maxlength: 500 },
    at: { type: Date, default: Date.now, required: true },
  },
  { _id: false },
);

const claimSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: true },
    claimantId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    claimantContact: { type: String, required: true, trim: true, maxlength: 200, select: false },
    verificationAnswer: { type: String, required: true, trim: true, maxlength: 2000, select: false },
    message: { type: String, trim: true, maxlength: 1000, select: false },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled", "completed"],
      default: "pending",
    },
    ownerDecision: {
      actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      action: { type: String, enum: ["approved", "rejected"] },
      note: { type: String, trim: true, maxlength: 500 },
      at: Date,
    },
    decisionHistory: { type: [decisionSchema], default: [] },
  },
  { timestamps: true },
);

claimSchema.index(
  { itemId: 1, claimantId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["pending", "approved", "completed"] } } },
);
claimSchema.index({ createdAt: -1 });
claimSchema.index({ claimantId: 1, createdAt: -1 });
claimSchema.index({ itemId: 1, createdAt: -1 });
claimSchema.index({ status: 1, createdAt: -1 });

export const Claim = mongoose.model("Claim", claimSchema);
