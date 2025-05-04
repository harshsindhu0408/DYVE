import mongoose from "mongoose";
import { Schema } from "mongoose";

const dmSchema = new Schema({
  participants: [
    {
      userId: Schema.Types.ObjectId,
      joinedAt: {
        type: Date,
        default: Date.now,
      },
      leftAt: Date,
      isActive: {
        type: Boolean,
        default: true,
      },
      userDisplay: {
        name: String,
        avatar: String,
        status: String,
        bio: String,
        email: String,
      },
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  workspaceId: Schema.Types.ObjectId,
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  lastMessageAt: {
    type: Date,
    default: Date.now,
  },
  lastMessageId: Schema.Types.ObjectId,

  participantIds: [String],
});

export const DMConversation = mongoose.model("DMConversation", dmSchema);
