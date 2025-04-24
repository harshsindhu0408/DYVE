import ChannelMember from "../models/ChannelMember.js";
import ChannelInvitation from "../models/ChannelInvitation.js";
import Channel from '../models/channel.model.js'
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../Utils/responseUtils.js";
import mongoose from "mongoose";
import { checkAdminPermission } from "../rpcHandlers/verifyUserRole.service.js";
import { rpcGetUserData } from "../rpcHandlers/userClient.js";

export async function addToChannel(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { channelId } = req.params;
    const { userIds, inviteViaEmail = false } = req.body;
    const currentUserId = req.user._id;

    // Validate input
    if (!userIds || !Array.isArray(userIds)) {
      await session.abortTransaction();
      return sendErrorResponse(
        res,
        400,
        "INVALID_INPUT",
        "User IDs must be provided as an array"
      );
    }

    // Get channel details
    const channel = await mongoose
      .model("Channel")
      .findById(channelId)
      .session(session);
    if (!channel) {
      await session.abortTransaction();
      return sendErrorResponse(
        res,
        404,
        "CHANNEL_NOT_FOUND",
        "Channel not found"
      );
    }

    // Check if current user is channel admin/owner or workspace admin
    const currentMember = await ChannelMember.findOne({
      channelId,
      userId: currentUserId,
    }).session(session);

    // Verify workspace admin status using your existing service
    const { hasAccess: isWorkspaceAdmin } = await checkAdminPermission(
      channel.workspaceId,
      currentUserId
    );

    const canAddMembers =
      currentMember?.role === "admin" ||
      currentMember?.role === "owner" ||
      isWorkspaceAdmin;

    if (!canAddMembers) {
      await session.abortTransaction();
      return sendErrorResponse(
        res,
        403,
        "PERMISSION_DENIED",
        "You do not have permission to add members to this channel"
      );
    }

    // Process each user
    const results = {
      added: [],
      alreadyMembers: [],
      invitationsSent: [],
      failed: [],
    };

    for (const userId of userIds) {
      try {
        // Skip if trying to add self
        if (userId === currentUserId) {
          results.failed.push({
            userId,
            reason: "Cannot add yourself to channel",
          });
          continue;
        }

        // Check if user is already a member
        const existingMember = await ChannelMember.findOne({
          channelId,
          userId,
        }).session(session);

        if (existingMember) {
          results.alreadyMembers.push(userId);
          continue;
        }

        // For private channels or email invites, create invitation
        if (channel.type === "private" || inviteViaEmail) {
          // Get user details from User Service
          let userData;
          try {
            userData = await rpcGetUserData(userId);
          } catch (error) {
            results.failed.push({
              userId,
              reason: "Failed to fetch user details via RabbitMQ",
            });
            continue;
          }

          const invitation = await ChannelInvitation.create(
            [
              {
                channelId,
                workspaceId: channel.workspaceId,
                inviterId: currentUserId,
                inviteeId: userId,
                inviterDisplay: {
                  name: req.user.profile.name,
                  avatar: req.user.profile.avatar,
                },
                inviteeDisplay: {
                  name: userData.profile.name,
                  avatar: userData.profile.avatar,
                  email: userData.email,
                },
                channelDisplay: {
                  name: channel.name,
                  isPrivate: channel.type === "private",
                },
                invitationType: inviteViaEmail ? "email" : "direct",
                status: "pending",
                metadata: {
                  ipAddress: req.ip,
                  userAgent: req.headers["user-agent"],
                },
              },
            ],
            { session }
          );

          results.invitationsSent.push(userId);
        } else {
          const userData = await rpcGetUserData(userId);

          await ChannelMember.create(
            [
              {
                channelId,
                userId,
                role: "member",
                userDisplay: {
                  name: userData.profile.name,
                  avatar: userData.profile.avatar,
                },
                lastReadAt: new Date(),
              },
            ],
            { session }
          );

          results.added.push(userId);
        }
      } catch (error) {
        results.failed.push({
          userId,
          reason: error.message,
        });
        // Continue with next user even if one fails
      }
    }

    await session.commitTransaction();

    return sendSuccessResponse(
      res,
      200,
      "MEMBERS_PROCESSED",
      "Members processed successfully",
      {
        channelId,
        results,
      }
    );
  } catch (error) {
    await session.abortTransaction();

    if (error.name === "ValidationError") {
      return sendErrorResponse(res, 400, "VALIDATION_ERROR", error.message);
    }

    return sendErrorResponse(
      res,
      500,
      "ADD_MEMBERS_FAILED",
      "Failed to add members to channel",
      error.message
    );
  } finally {
    session.endSession();
  }
}

export async function removeFromChannel(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { channelId, userId } = req.params;
    const currentUserId = req.user._id;

    // Validate input
    if (!userId) {
      await session.abortTransaction();
      return sendErrorResponse(
        res,
        400,
        "USER_ID_REQUIRED",
        "User ID must be provided"
      );
    }

    // Get channel details
    const channel = await mongoose
      .model("Channel")
      .findById(channelId)
      .session(session);
    if (!channel) {
      await session.abortTransaction();
      return sendErrorResponse(
        res,
        404,
        "CHANNEL_NOT_FOUND",
        "Channel not found"
      );
    }

    // Check if current user has permission to remove members
    const currentMember = await ChannelMember.findOne({
      channelId,
      userId: currentUserId,
    }).session(session);

    // Verify workspace admin status
    const { hasAccess: isWorkspaceAdmin } = await checkAdminPermission(
      channel.workspaceId,
      currentUserId
    );

    const canRemoveMembers =
      currentMember?.role === "admin" ||
      currentMember?.role === "owner" ||
      isWorkspaceAdmin;

    if (!canRemoveMembers) {
      await session.abortTransaction();
      return sendErrorResponse(
        res,
        403,
        "PERMISSION_DENIED",
        "You do not have permission to remove members from this channel"
      );
    }

    // Check if target user is a member
    const targetMember = await ChannelMember.findOne({
      channelId,
      userId,
    }).session(session);

    if (!targetMember) {
      await session.abortTransaction();
      return sendErrorResponse(
        res,
        404,
        "MEMBER_NOT_FOUND",
        "User is not a member of this channel"
      );
    }

    // Prevent removing channel owners (unless it's yourself)
    if (targetMember.role === "owner" && userId !== currentUserId) {
      await session.abortTransaction();
      return sendErrorResponse(
        res,
        403,
        "OWNER_REMOVAL_DENIED",
        "Cannot remove channel owner"
      );
    }

    // Prevent removing yourself if you're the only owner
    if (userId === currentUserId && targetMember.role === "owner") {
      const ownerCount = await ChannelMember.countDocuments({
        channelId,
        role: "owner",
      }).session(session);

      if (ownerCount <= 1) {
        await session.abortTransaction();
        return sendErrorResponse(
          res,
          403,
          "LAST_OWNER_REMOVAL_DENIED",
          "Cannot remove the only owner of the channel"
        );
      }
    }

    // Remove the member
    await ChannelMember.deleteOne({
      channelId,
      userId,
    }).session(session);

    // Update channel last activity
    await mongoose
      .model("Channel")
      .updateOne(
        { _id: channelId },
        { $set: { lastActivityAt: new Date() } },
        { session }
      );

    await session.commitTransaction();

    return sendSuccessResponse(
      res,
      200,
      "MEMBER_REMOVED",
      "Member removed successfully",
      {
        channelId,
        removedUserId: userId,
      }
    );
  } catch (error) {
    await session.abortTransaction();

    if (error.name === "ValidationError") {
      return sendErrorResponse(res, 400, "VALIDATION_ERROR", error.message);
    }

    return sendErrorResponse(
      res,
      500,
      "REMOVE_MEMBER_FAILED",
      "Failed to remove member from channel",
      error.message
    );
  } finally {
    session.endSession();
  }
}

export const getChannelMembers = async (req, res) => {
  try {
    const { channelId } = req.params;
    const { page = 1, limit = 50, role } = req.query;

    const query = { channelId };
    if (role) query.role = role;

    const members = await ChannelMember.find(query)
      .sort({ role: -1, joinedAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await ChannelMember.countDocuments(query);

    return sendSuccessResponse(
      res,
      200,
      "MEMBERS_FETCHED",
      "Members fetched successfully",
      {
        members,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      }
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      "FETCH_MEMBERS_FAILED",
      "Failed to fetch channel members",
      error.message
    );
  }
};


