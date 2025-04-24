import mongoose from "mongoose";

const userRoles = ["guest", "member", "admin", "superAdmin"];
const userStatuses = ["invited", "active", "inactive", "revoked"];

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      validate: {
        validator: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
        message: "Invalid email format",
      },
    },
    passwordHash: {
      type: String,
      select: false,
    },
    profile: {
      name: {
        type: String,
        required: true,
        trim: true,
      },
      avatar: {
        type: String,
        default: "",
        validate: {
          validator: function (url) {
            if (!url) return true;
            return /^https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)$/.test(
              url
            );
          },
          message: (props) => `Avatar URL must be a valid HTTP/HTTPS URL`,
        },
      },
      phone: {
        type: String,
        default: "",
        validate: {
          validator: function (phone) {
            if (!phone) return true;
            return /^\+?[1-9]\d{1,14}$/.test(phone);
          },
          message: (props) => `${props.value} is not a valid phone number!`,
        },
      },
      bio: {
        type: String,
        default: "",
        maxLength: 500,
      },
    },
    role: {
      type: String,
      enum: userRoles,
      default: "member",
    },
    status: {
      type: String,
      enum: userStatuses,
      default: "active",
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    invitationToken: {
      type: String,
      select: false,
    },
    invitationExpires: {
      type: Date,
      select: false,
    },
    forgotPasswordOTP: {
      type: Number,
    },
    forgotPasswordOTPExpires: {
      type: Date,
    },
    passwordResetToken: {
      type: String,
    },
    passwordResetTokenExpires: {
      type: Date,
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.passwordHash;
        delete ret.invitationToken;
        delete ret.invitationExpires;
        return ret;
      },
    },
  }
);

export const User = mongoose.model("User", userSchema);
