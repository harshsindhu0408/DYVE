import mongoose from "mongoose";

const channelSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: String,
      required: [true, "Workspace ID is required"],
      index: true,
    },
    workspaceName: {
      type: String,
      required: [true, "Workspace name is required"],
    },
    name: {
      type: String,
      required: [true, "Channel name is required"],
      trim: true,
      maxlength: [80, "Channel name cannot exceed 80 characters"],
      minlength: [1, "Channel name must be at least 1 character"],
      validate: {
        validator: function (v) {
          return !/^[0-9]+$/.test(v);
        },
        message: "Channel name cannot be numbers only",
      },
    },
    description: {
      type: String,
      trim: true,
      maxlength: [250, "Description cannot exceed 250 characters"],
      default: "",
    },
    type: {
      type: String,
      enum: ["public", "private"],
      default: "public",
    },
    createdBy: {
      userId: { type: String, required: true },
      name: { type: String, required: true },
      avatar: String,
      status: String,
      bio: String,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    isGeneral: {
      type: Boolean,
      default: false,
    },
    topic: {
      type: String,
      trim: true,
      maxlength: [250, "Topic cannot exceed 250 characters"],
      default: "",
    },
    pinnedMessages: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Message",
      },
    ],
    customSettings: {
      allowThreads: {
        type: Boolean,
        default: true,
      },
      sendWelcomeMessages: {
        type: Boolean,
        default: true,
      },
      defaultNotificationPref: {
        type: String,
        enum: ["all", "mentions", "none"],
        default: "all",
      },
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for member count
channelSchema.virtual("memberCount", {
  ref: "ChannelMember",
  localField: "_id",
  foreignField: "channelId",
  count: true,
});


// Query helper for active channels
channelSchema.query.active = function () {
  return this.where({ isArchived: false });
};

// Static method for finding by workspace
channelSchema.statics.findByWorkspace = function (workspaceId) {
  return this.find({ workspaceId }).sort({ isGeneral: -1, name: 1 });
};

const Channel = mongoose.model("Channel", channelSchema);

export default Channel;
