import mongoose from "mongoose";
import { Schema } from "mongoose";

const MessageSchema = new Schema(
  {
    // Context (either channel or DM)
    channelId: {
      type: Schema.Types.ObjectId,
      index: true,
      sparse: true, // Index only documents where field exists
    },
    dmConversationId: {
      type: Schema.Types.ObjectId,
      index: true,
      sparse: true,
    },

    // Content
    senderId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    senderDisplay: {
      name: { type: String, required: true },
      avatar: String,
      status: String,
      bio: String,
    },
    content: {
      type: String,
      required: true,
    },
    attachments: [
      {
        type: {
          type: String,
          enum: ["image", "gif", "file"],
        },
        url: String,
        thumbnailUrl: String,
        filename: String,
        size: Number,
        width: Number,
        height: Number,
      },
    ],

    // Metadata
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    deletedAt: {
      type: Date,
      index: true,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },

    // Reactions
    reactions: [
      {
        userId: Schema.Types.ObjectId,
        emoji: String,
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    autoIndex: true, // Ensure indexes are created
  }
);

// Essential compound indexes
MessageSchema.index({ channelId: 1, createdAt: -1 });
MessageSchema.index({ dmConversationId: 1, createdAt: -1 });
MessageSchema.index({ senderId: 1, createdAt: -1 });
MessageSchema.index({ "reactions.emoji": 1 });

export const Message = mongoose.model("Message", MessageSchema);
