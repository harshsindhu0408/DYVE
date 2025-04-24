import mongoose from "mongoose";
import { Schema } from "mongoose";

const SessionSchema = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    token: {
      type: String,
      required: true,
    },
    socketId: {
      type: String, // optional for now
    },
    deviceInfo: {
      type: String,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    ipAddress: {
      type: String,
    },
  },
  { timestamps: true }
);

export const Session = mongoose.model("Session", SessionSchema);
