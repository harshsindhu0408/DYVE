import ChannelMember from "../models/channelMembers.model.js";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../Utils/responseUtils.js";
import mongoose from "mongoose";
import { checkAdminPermission } from "../rpcHandlers/verifyUserRole.service.js";
import { requestUserDataFromUserService } from "../services/userAccess.js";
import Channel from "../models/channel.model.js";

// tested
export async function addToChannel(req, res) {
  try {
    const { channelId } = req.params;
    const { userId } = req.body;
    const currentUserId = req.user._id;

    if (!userId) {
      return sendErrorResponse(
        res,
        400,
        "INVALID_INPUT",
        "User ID is required."
      );
    }

    if (userId === currentUserId.toString()) {
      return sendErrorResponse(
        res,
        400,
        "CANNOT_ADD_SELF",
        "You cannot add yourself to the channel."
      );
    }

    // Check if channel exists
    const channel = await Channel.findById(channelId).select(
      "type membersCount"
    );
    if (!channel) {
      return sendErrorResponse(
        res,
        404,
        "CHANNEL_NOT_FOUND",
        "Channel not found"
      );
    }

    // Check if user is already a member
    const existingMember = await ChannelMember.findOne({ channelId, userId });
    if (existingMember) {
      return sendErrorResponse(
        res,
        409,
        "ALREADY_MEMBER",
        "User is already a member of this channel."
      );
    }

    // Fetch user data
    let userData;
    try {
      userData = await requestUserDataFromUserService(userId);
    } catch (err) {
      return sendErrorResponse(
        res,
        502,
        "USER_FETCH_FAILED",
        "Failed to fetch user data"
      );
    }

    // Validate user data
    if (!userData?.name || typeof userData.name !== "string") {
      return sendErrorResponse(
        res,
        422,
        "INVALID_USER_DATA",
        "Incomplete or invalid user profile data."
      );
    }

    // Add user to channel
    await ChannelMember.create({
      channelId,
      userId,
      role: "member",
      userDisplay: {
        name: userData.name,
        avatar: userData.avatar || null,
        status: userData.status || "offline",
        bio: userData.bio || "",
      },
      lastReadAt: new Date(),
    });

    // Increment channel member count
    await Channel.updateOne(
      { _id: channelId },
      {
        $inc: { membersCount: 1 },
        $set: { lastActivityAt: new Date() },
      }
    );

    // TODO fire an event which will create the dm of the added user with all of the private channel members

    return sendSuccessResponse(
      res,
      200,
      "MEMBER_ADDED",
      "User successfully added to channel",
      { channelId, userId }
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      "ADD_MEMBER_FAILED",
      "Failed to add user to channel",
      process.env.NODE_ENV === "development" ? error.message : undefined
    );
  }
}

// tested
export async function removeFromChannel(req, res) {
  try {
    const { channelId, userId } = req.params;

    // Validate IDs
    if (
      !mongoose.Types.ObjectId.isValid(channelId) ||
      !mongoose.Types.ObjectId.isValid(userId)
    ) {
      return sendErrorResponse(
        res,
        400,
        "INVALID_ID",
        "Invalid channel or user ID"
      );
    }

    // Try removing the member
    const deleteResult = await ChannelMember.deleteOne({ channelId, userId });

    if (deleteResult.deletedCount === 0) {
      return sendErrorResponse(
        res,
        404,
        "MEMBER_NOT_FOUND",
        "User is not a channel member"
      );
    }

    // Update channel stats
    await Channel.updateOne(
      { _id: channelId },
      {
        $set: { lastActivityAt: new Date() },
        $inc: { membersCount: -1 },
      }
    );

    return sendSuccessResponse(
      res,
      200,
      "MEMBER_REMOVED",
      "Member removed successfully",
      { channelId, removedUserId: userId }
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      "REMOVE_MEMBER_FAILED",
      "Failed to remove member",
      process.env.NODE_ENV === "development" ? error.message : undefined
    );
  }
}

// tested
export const getChannelMembers = async (req, res) => {
  try {
    const { channelId } = req.params;

    // Validate channelId format
    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return sendErrorResponse(
        res,
        400,
        "INVALID_CHANNEL_ID",
        "Invalid channel ID format"
      );
    }

    const { role } = req.query;
    const query = { channelId };

    // Validate role if provided
    if (role) {
      if (!["member", "admin", "owner"].includes(role)) {
        return sendErrorResponse(
          res,
          400,
          "INVALID_ROLE",
          "Role must be one of: member, admin, owner"
        );
      }
      query.role = role;
    }

    // Verify channel exists first
    const channelExists = await Channel.exists({ _id: channelId });
    if (!channelExists) {
      return sendErrorResponse(
        res,
        404,
        "CHANNEL_NOT_FOUND",
        "Channel not found"
      );
    }

    // Get members with safety limit
    const members = await ChannelMember.find(query)
      .sort({ role: -1, joinedAt: 1 }) // Owners first, then by join date
      .limit(1000) // Prevent overloading with huge channels
      .lean();

    return sendSuccessResponse(
      res,
      200,
      "MEMBERS_FETCHED",
      "Members fetched successfully",
      {
        members,
        count: members.length, // Still provide count for convenience
      }
    );
  } catch (error) {
    console.error("Failed to fetch channel members:", error);

    return sendErrorResponse(
      res,
      500,
      "FETCH_MEMBERS_FAILED",
      "Failed to fetch channel members",
      process.env.NODE_ENV === "development"
        ? {
            message: error.message,
            stack: error.stack,
          }
        : undefined
    );
  }
};

// tested
export async function leaveChannel(req, res) {
  try {
    const { channelId } = req.params;
    const userId = req.user._id;

    // Validate channelId format
    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return sendErrorResponse(
        res,
        400,
        "INVALID_CHANNEL_ID",
        "Invalid channel ID format"
      );
    }

    const channel = await Channel.findById(channelId).select("membersCount");
    if (!channel) {
      return sendErrorResponse(
        res,
        404,
        "CHANNEL_NOT_FOUND",
        "Channel not found"
      );
    }

    const member = await ChannelMember.findOne({
      channelId: channelId,
      userId: userId,
    });
    if (!member) {
      return sendErrorResponse(
        res,
        404,
        "NOT_A_MEMBER",
        "You are not a member of this channel"
      );
    }

    // If user is owner, ensure they are not the last one
    if (member.role === "owner") {
      const otherOwnerExists = await ChannelMember.exists({
        channelId,
        role: "owner",
        userId: { $ne: userId },
      });

      if (!otherOwnerExists) {
        return sendErrorResponse(
          res,
          403,
          "LAST_OWNER",
          "Cannot leave as the last owner. Assign another owner first."
        );
      }
    }

    // Remove member and update channel
    await ChannelMember.deleteOne({ channelId, userId });
    await Channel.findByIdAndUpdate(channelId, {
      $inc: { membersCount: -1 },
      $set: { lastActivityAt: new Date() },
    });

    return sendSuccessResponse(
      res,
      200,
      "CHANNEL_LEFT",
      "Successfully left the channel",
      { channelId }
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      "LEAVE_FAILED",
      "Failed to leave channel",
      process.env.NODE_ENV === "development" ? error.stack : undefined
    );
  }
}
