import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: true, index: true },
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    reason: { type: String, enum: ["inappropriate", "misleading", "duplicate", "private_information", "other"], required: true },
    details: { type: String, trim: true, maxlength: 1000 },
    status: { type: String, enum: ["open", "reviewed", "dismissed"], default: "open", index: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
    reviewNote: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true },
);

reportSchema.index({ itemId: 1, reporterId: 1 }, { unique: true, partialFilterExpression: { status: "open" } });
reportSchema.index({ status: 1, createdAt: -1 });

export const Report = mongoose.model("Report", reportSchema);
