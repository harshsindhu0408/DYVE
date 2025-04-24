import mongoose from "mongoose";

const channelInvitationSchema = new mongoose.Schema(
  {
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Channel",
      required: true,
      index: true,
    },
    workspaceId: {
      type: String,
      required: [true, "Workspace ID is required"],
      index: true,
    },
    inviterId: {
      type: String,
      required: [true, "Inviter ID is required"],
    },
    inviteeId: {
      type: String,
      required: [true, "Invitee ID is required"],
      index: true,
    },

    inviterDisplay: {
      name: { type: String, required: true },
      avatar: String,
    },
    inviteeDisplay: {
      name: { type: String, required: true },
      avatar: String,
      email: { type: String },
    },

    channelDisplay: {
      name: { type: String, required: true },
      isPrivate: { type: Boolean, required: true },
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "expired", "revoked"],
      default: "pending",
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
    invitationType: {
      type: String,
      enum: ["direct", "email", "link"],
      default: "direct",
    },
    token: {
      type: String,
      index: true,
    },
    metadata: {
      ipAddress: String,
      userAgent: String,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.__v;
        delete ret.token;
        return ret;
      },
    },
  }
);

// Compound indexes for common query patterns
channelInvitationSchema.index({ channelId: 1, status: 1 });
channelInvitationSchema.index({ workspaceId: 1, inviteeId: 1, status: 1 });
channelInvitationSchema.index({ token: 1 }, { unique: true, sparse: true });

// TTL index for automatic expiration cleanup
channelInvitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Pre-save hooks
channelInvitationSchema.pre("save", async function (next) {
  if (this.isNew) {
    // Generate token for email/link invitations
    if (this.invitationType !== "direct" && !this.token) {
      this.token = require("crypto").randomBytes(32).toString("hex");
    }

    // Prevent duplicate pending invitations
    const existingInvite = await this.constructor.findOne({
      channelId: this.channelId,
      inviteeId: this.inviteeId,
      status: "pending",
    });

    if (existingInvite) {
      throw new Error("Pending invitation already exists for this user");
    }
  }
  next();
});

// Static methods
channelInvitationSchema.statics.findValidById = function (id) {
  return this.findOne({
    _id: id,
    status: "pending",
    expiresAt: { $gt: new Date() },
  });
};

channelInvitationSchema.statics.findByToken = function (token) {
  return this.findOne({
    token,
    status: "pending",
    expiresAt: { $gt: new Date() },
  });
};

// Instance methods
channelInvitationSchema.methods.accept = function () {
  this.status = "accepted";
  return this.save();
};

channelInvitationSchema.methods.reject = function () {
  this.status = "rejected";
  return this.save();
};

channelInvitationSchema.methods.revoke = function () {
  this.status = "revoked";
  return this.save();
};

// Virtual for invitation link
channelInvitationSchema.virtual("invitationLink").get(function () {
  if (this.token) {
    return `${process.env.BASE_URL}/invitations/${this.token}`;
  }
  return null;
});

const ChannelInvitation = mongoose.model(
  "ChannelInvitation",
  channelInvitationSchema
);

export default ChannelInvitation;
