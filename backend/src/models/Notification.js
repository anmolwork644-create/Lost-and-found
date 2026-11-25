import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item" },
    relatedItemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item" },
    claimId: { type: mongoose.Schema.Types.ObjectId, ref: "Claim" },
    type: { type: String, enum: ["claim_received", "claim_updated", "potential_match", "item_returned", "moderation_action"], required: true },
    message: { type: String, required: true, trim: true, maxlength: 300 },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationSchema.index({ receiverId: 1, createdAt: -1 });
notificationSchema.index({ receiverId: 1, readAt: 1 });

export const Notification = mongoose.model("Notification", notificationSchema);
