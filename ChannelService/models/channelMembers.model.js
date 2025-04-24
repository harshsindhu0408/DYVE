import mongoose from "mongoose";

const channelMemberSchema = new mongoose.Schema(
  {
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Channel",
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    userDisplay: {
      name: { type: String, required: true },
      avatar: String,
      status: String,
    },
    role: {
      type: String,
      enum: ["member", "admin", "owner"],
      default: "member",
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    lastReadAt: {
      type: Date,
      default: Date.now,
    },
    notificationPref: {
      type: String,
      enum: ["all", "mentions", "none"],
      default: "all",
    },
    isMuted: {
      type: Boolean,
      default: false,
    },
    customNickname: {
      type: String,
      trim: true,
      maxlength: [32, "Nickname cannot exceed 32 characters"],
    },
    unreadCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    starred: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound index to ensure unique user-channel pairs
channelMemberSchema.index({ channelId: 1, userId: 1 }, { unique: true });

channelMemberSchema.statics.syncUserData = async function (userId, userData) {
  return this.updateMany(
    { userId },
    {
      $set: {
        "userDisplay.name": userData.name,
        "userDisplay.avatar": userData.avatar,
        "userDisplay.status": userData.status,
      },
    }
  );
};

// Virtual populate for channel details
channelMemberSchema.virtual("channel", {
  ref: "Channel",
  localField: "channelId",
  foreignField: "_id",
  justOne: true,
});

// Update lastReadAt and reset unreadCount
channelMemberSchema.methods.markAsRead = function () {
  this.lastReadAt = new Date();
  this.unreadCount = 0;
  return this.save();
};

// Increment unread count
channelMemberSchema.methods.incrementUnread = async function () {
  if (this.notificationPref !== "none" && !this.isMuted) {
    this.unreadCount += 1;
    await this.save();
  }
};

// Static method for finding members by channel
channelMemberSchema.statics.findByChannel = function (channelId, options = {}) {
  return this.find({ channelId })
    .populate("user", "name email avatar status")
    .sort(options.sort || { role: -1, joinedAt: 1 });
};

const ChannelMember = mongoose.model("ChannelMember", channelMemberSchema);

export default ChannelMember;
