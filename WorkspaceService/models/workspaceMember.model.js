import mongoose from "mongoose";

const WorkspaceMemberSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: [true, "User ID is required"],
      index: true,
      validate: {
        validator: function (v) {
          return (
            /^[a-f\d]{24}$/i.test(v) ||
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
              v
            )
          );
        },
        message: (props) => `${props.value} is not a valid User ID format!`,
      },
    },
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    userDisplay: {
      name: { type: String, required: true },
      avatar: String,
      status: String,
      bio: String,
    },
    role: {
      type: String,
      enum: ["admin", "member", "guest", "owner"],
      default: "member",
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "active", "removed"],
      default: "pending",
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      validate: {
        validator: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
        message: "Invalid email format",
      },
    },
  },
  { timestamps: true }
);

WorkspaceMemberSchema.index({ userId: 1, workspaceId: 1 }, { unique: true });
WorkspaceMemberSchema.index({ workspaceId: 1, status: 1 });
WorkspaceMemberSchema.index({
  workspaceId: 1,
  status: 1,
  "userDisplay.name": 1,
});
WorkspaceMemberSchema.index({ workspaceId: 1, status: 1, email: 1 });

export const WorkspaceMember = mongoose.model(
  "WorkspaceMember",
  WorkspaceMemberSchema
);
