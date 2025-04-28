import mongoose from "mongoose";

const InviteSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    role: {
      type: String,
      enum: ["admin", "member", "guest"],
      default: "member",
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "expired", "revoked"],
      default: "pending",
    },
    isPublicLink: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Compound index for faster lookup
InviteSchema.index({ email: 1, workspaceId: 1 });
export const Invite = mongoose.model("Invite", InviteSchema);
