import { User } from "../models/user.model.js";
import mongoose from "mongoose";
import { Session } from "../models/session.model.js";
import {
  sendErrorResponse,
  sendSuccessResponse,
} from "../Utils/responseUtils.js";
import { hashPassword } from "../helpers/bcrypt.js";
import { eventBus } from "../services/rabbit.js";

// Tested
export async function getUserProfile(req, res) {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return sendErrorResponse(
        res,
        401,
        "UNAUTHORIZED",
        "Authentication required"
      );
    }

    const user = await User.findById(userId)
      .select(
        "-passwordHash -forgotPasswordOTP -forgotPasswordOTPExpires -passwordResetToken -passwordResetTokenExpires -__v"
      )
      .lean()
      .session(req.dbSession);

    if (!user) {
      return sendErrorResponse(
        res,
        404,
        "USER_NOT_FOUND",
        "User does not exist"
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "USER_FETCHED_SUCCESSFULLY",
      "User details fetched successfully",
      user,
      "database"
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      "SERVER_ERROR",
      "Unable to fetch user data - server error", // Fixed typo
      process.env.NODE_ENV === "development" ? error.message : undefined
    );
  }
}

// Tested
export async function updateUserProfile(req, res) {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return sendErrorResponse(
        res,
        401,
        "UNAUTHORIZED",
        "Authentication required"
      );
    }

    const updates = req.body || {};

    const restrictedFields = ["email", "role", "status"];
    const hasRestrictedUpdate = restrictedFields.some((field) =>
      Object.prototype.hasOwnProperty.call(updates, field)
    );

    if (hasRestrictedUpdate) {
      return sendErrorResponse(
        res,
        403,
        "RESTRICTED_FIELD_UPDATE",
        "You are not allowed to update restricted fields"
      );
    }

    // Validate and hash password if provided
    if (updates.passwordHash) {
      const passwordRegex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

      if (!passwordRegex.test(updates.passwordHash)) {
        return sendErrorResponse(
          res,
          400,
          "WEAK_PASSWORD",
          "Password must contain at least 8 characters, one uppercase, one lowercase, one number, and one special character"
        );
      }

      updates.passwordHash = await hashPassword(updates.passwordHash);
    }

    if (updates.profile?.bio && updates.profile.bio.length > 500) {
      return sendErrorResponse(
        res,
        400,
        "BIO_TOO_LONG",
        "Bio cannot exceed 500 characters"
      );
    }

    if (updates.profile?.name && !updates.profile.avatar) {
      updates.profile.avatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
        updates.profile.name
      )}`;
    }

    if (updates.profile) {
      const profileUpdates = {};
      for (const [key, value] of Object.entries(updates.profile)) {
        if (value !== undefined) {
          profileUpdates[`profile.${key}`] = value;
        }
      }
      delete updates.profile;
      Object.assign(updates, profileUpdates);
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      {
        new: true,
        runValidators: true,
        context: "query",
      }
    )
      .select(
        "-passwordHash -forgotPasswordOTP -forgotPasswordOTPExpires -passwordResetToken -passwordResetTokenExpires -__v"
      )
      .lean();

    if (!updatedUser) {
      return sendErrorResponse(res, 404, "USER_NOT_FOUND", "User not found");
    }

    try {
      await eventBus.publish("user_events", "user.updated", {
        userId: updatedUser._id,
        changes: {
          name: updatedUser.profile.name,
          avatar: updatedUser.profile.avatar,
          status: updatedUser.status,
        },
      });
    } catch (e) {
      console.error("Failed to publish user update event:", e);
      // The eventBus will automatically retry when connection is restored
      // Continue with the response - the message is queued for retry
    }

    return sendSuccessResponse(
      res,
      200,
      "PROFILE_UPDATED_SUCCESSFULLY",
      updatedUser,
      "database"
    );
  } catch (error) {
    console.error("Update User Profile Error:", error);

    return sendErrorResponse(
      res,
      500,
      "SERVER_ERROR",
      "An unexpected error occurred while updating the user profile",
      error.message
    );
  }
}

// Tested
export async function deleteUserProfile(req, res) {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return sendErrorResponse(
        res,
        401,
        "UNAUTHORIZED",
        "Authentication required"
      );
    }

    const user = await User.findById(userId)
      .select("-passwordHash -forgotPasswordOTP -forgotPasswordOTPExpires -__v")
      .session(req.dbSession)
      .lean();

    if (!user) {
      return sendErrorResponse(
        res,
        404,
        "USER_NOT_FOUND",
        "User does not exist"
      );
    }

    // Delete the user
    const deletedUser = await User.findByIdAndDelete(userId).session(
      req.dbSession
    );

    try {
      await eventBus.publish("user_events", "user.deleted", {
        userId: deletedUser._id,
        changes: {
          name: deletedUser.profile.name,
          avatar: deletedUser.profile.avatar,
          status: deletedUser.status,
        },
      });
    } catch (e) {
      console.error("Failed to publish user update event:", e);
      // The eventBus will automatically retry when connection is restored
      // Continue with the response - the message is queued for retry
    }


    // Optionally delete all active sessions associated with the user
    await Session.deleteMany({ userId }).session(req.dbSession); // if you use Session model

    return sendSuccessResponse(
      res,
      200,
      "USER_DELETED_SUCCESSFULLY",
      "User profile and sessions deleted successfully"
    );
  } catch (error) {
    console.error("Delete User Profile Error:", error);

    return sendErrorResponse(
      res,
      500,
      "SERVER_ERROR",
      "An error occurred while deleting the user profile",
      error.message
    );
  }
}
