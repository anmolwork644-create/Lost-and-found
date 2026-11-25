import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["student", "staff", "admin"], default: "student", required: true },
    status: { type: String, enum: ["active", "suspended"], default: "active", required: true },
    emailVerifiedAt: { type: Date, default: null },
    emailVerificationHash: { type: String, select: false },
    emailVerificationExpiresAt: { type: Date, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.passwordHash;
        delete ret.emailVerificationHash;
        delete ret.emailVerificationExpiresAt;
        delete ret.__v;
        return ret;
      },
    },
  },
);

userSchema.index({ createdAt: -1 });

export const User = mongoose.model("User", userSchema);
