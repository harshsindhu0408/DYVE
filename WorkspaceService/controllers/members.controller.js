import { handleUpdateMemberRole } from "../rpcHandlers/workspaceRpcHandlers.js";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../utils/responseUtils.js";
import mongoose from "mongoose";
import { eventBus } from "../services/rabbit.js";

export const updateMemberRole = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { workspaceId, userId } = req.params;
    const { role } = req.body;
    const currentUserId = req.user._id;

    // Validate role
    if (!["member", "admin", "owner", "guest"].includes(role)) {
      await session.abortTransaction();
      return sendErrorResponse(
        res,
        400,
        "INVALID_ROLE",
        "Invalid role specified"
      );
    }

    // Verify permissions via RPC call to Workspace Service
    const { canChangeRoles, isOwner } = await rpcCheckWorkspacePermissions(
      workspaceId,
      currentUserId
    );

    if (!canChangeRoles) {
      await session.abortTransaction();
      return sendErrorResponse(
        res,
        403,
        "PERMISSION_DENIED",
        "You don't have permission to change roles"
      );
    }

    // Prevent changing the last owner via RPC
    if (role !== "owner" && isOwner) {
      const { hasOtherOwners } = await rpcCheckOtherOwners(workspaceId, userId);
      if (!hasOtherOwners) {
        await session.abortTransaction();
        return sendErrorResponse(
          res,
          400,
          "LAST_OWNER",
          "Workspace must have at least one owner"
        );
      }
    }

    // RPC call to update role in Workspace Service
    const updateResult = await handleUpdateMemberRole(
      workspaceId,
      userId,
      role,
      currentUserId
    );

    if (!updateResult.success) {
      await session.abortTransaction();
      return sendErrorResponse(
        res,
        updateResult.status || 500,
        updateResult.code || "ROLE_UPDATE_FAILED",
        updateResult.message || "Failed to update member role"
      );
    }

    await session.commitTransaction();

    // Emit role change event
    eventBus.emit("workspace:member:role_updated", {
      workspaceId,
      userId,
      newRole: role,
      changedBy: currentUserId,
    });

    return sendSuccessResponse(
      res,
      200,
      "ROLE_UPDATED",
      "Member role updated successfully",
      {
        workspaceId,
        userId,
        newRole: role,
      }
    );
  } catch (error) {
    await session.abortTransaction();

    // Handle specific RPC errors
    if (error.isRpcError) {
      return sendErrorResponse(
        res,
        error.status || 500,
        error.code || "RPC_ERROR",
        error.message || "Workspace service communication failed"
      );
    }

    return sendErrorResponse(
      res,
      500,
      "ROLE_UPDATE_FAILED",
      "Failed to update member role",
      error.message
    );
  } finally {
    session.endSession();
  }
};

export const listWorkspaceMembers = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { status = "active", search = "", page = 1, limit = 20 } = req.query;

    // Validate workspace membership and permissions
    const currentUserMember = await WorkspaceMember.findOne({
      workspaceId,
      userId: req.user._id,
      status: "active",
    });

    if (!currentUserMember) {
      return sendErrorResponse(
        res,
        403,
        "NOT_MEMBER",
        "You are not a member of this workspace"
      );
    }

    // Build query
    const query = {
      workspaceId,
      status,
    };

    if (search) {
      query.$or = [
        { "userDisplay.name": { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    // Get paginated results
    const [members, total] = await Promise.all([
      WorkspaceMember.find(query)
        .sort({ role: 1, "userDisplay.name": 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      WorkspaceMember.countDocuments(query),
    ]);

    // Enrich with fresh user data
    const enrichedMembers = await Promise.all(
      members.map(async (member) => {
        const userData = await requestUserData(member.userId);
        return {
          ...member,
          userDisplay: {
            ...member.userDisplay,
            ...(userData && {
              avatar: userData.avatar || member.userDisplay.avatar,
              status: userData.status || member.userDisplay.status,
            }),
          },
        };
      })
    );

    return sendSuccessResponse(
      res,
      200,
      "MEMBERS_FETCHED",
      "Workspace members retrieved successfully",
      {
        members: enrichedMembers,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit),
        },
      }
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      "FETCH_MEMBERS_FAILED",
      "Failed to fetch workspace members",
      error.message
    );
  }
};

export const getWorkspaceMember = async (req, res) => {
  try {
    const { workspaceId, userId } = req.params;

    const member = await WorkspaceMember.findOne({
      workspaceId,
      userId,
      status: "active",
    }).lean();

    if (!member) {
      return sendErrorResponse(
        res,
        404,
        "MEMBER_NOT_FOUND",
        "Workspace member not found"
      );
    }

    // Enrich with fresh user data
    const userData = await requestUserData(userId);
    const enrichedMember = {
      ...member,
      userDisplay: {
        ...member.userDisplay,
        ...(userData && {
          avatar: userData.avatar || member.userDisplay.avatar,
          status: userData.status || member.userDisplay.status,
        }),
      },
    };

    return sendSuccessResponse(
      res,
      200,
      "MEMBER_FETCHED",
      "Workspace member retrieved successfully",
      enrichedMember
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      "FETCH_MEMBER_FAILED",
      "Failed to fetch workspace member",
      error.message
    );
  }
};

export const updateWorkspaceMember = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { workspaceId, userId } = req.params;
    const { role, status } = req.body;
    const currentUserId = req.user._id;

    // Validate current user permissions
    const currentUserMember = await WorkspaceMember.findOne({
      workspaceId,
      userId: currentUserId,
      status: "active",
    }).session(session);

    if (
      !currentUserMember ||
      !["admin", "owner"].includes(currentUserMember.role)
    ) {
      await session.abortTransaction();
      return sendErrorResponse(
        res,
        403,
        "PERMISSION_DENIED",
        "You don't have permission to update members"
      );
    }

    // Get the member to update
    const memberToUpdate = await WorkspaceMember.findOne({
      workspaceId,
      userId,
      status: { $ne: "removed" },
    }).session(session);

    if (!memberToUpdate) {
      await session.abortTransaction();
      return sendErrorResponse(
        res,
        404,
        "MEMBER_NOT_FOUND",
        "Workspace member not found"
      );
    }

    // Prevent modifying owners unless current user is owner
    if (memberToUpdate.role === "owner" && currentUserMember.role !== "owner") {
      await session.abortTransaction();
      return sendErrorResponse(
        res,
        403,
        "PERMISSION_DENIED",
        "Only owners can modify other owners"
      );
    }

    // Validate role changes
    if (role && !["admin", "member", "guest", "owner"].includes(role)) {
      await session.abortTransaction();
      return sendErrorResponse(
        res,
        400,
        "INVALID_ROLE",
        "Invalid role specified"
      );
    }

    // Validate status changes
    if (status && !["active", "removed"].includes(status)) {
      await session.abortTransaction();
      return sendErrorResponse(
        res,
        400,
        "INVALID_STATUS",
        "Invalid status specified"
      );
    }

    // Prevent removing last owner
    if (status === "removed" && memberToUpdate.role === "owner") {
      const ownerCount = await WorkspaceMember.countDocuments({
        workspaceId,
        role: "owner",
        status: "active",
        userId: { $ne: userId },
      }).session(session);

      if (ownerCount === 0) {
        await session.abortTransaction();
        return sendErrorResponse(
          res,
          400,
          "LAST_OWNER",
          "Workspace must have at least one owner"
        );
      }
    }

    // Update member
    const updateData = {};
    if (role) updateData.role = role;
    if (status) updateData.status = status;

    const updatedMember = await WorkspaceMember.findOneAndUpdate(
      { _id: memberToUpdate._id },
      updateData,
      { new: true, session }
    );

    await session.commitTransaction();

    // Emit appropriate event
    if (status === "removed") {
      await eventBus.publish("workspace_events", "member.removed", {
        workspaceId,
        userId,
        removedBy: currentUserId,
      });
    } else if (role) {
      await eventBus.publish("workspace_events", "member.role_updated", {
        workspaceId,
        userId,
        oldRole: memberToUpdate.role,
        newRole: role,
        changedBy: currentUserId,
      });
    }

    return sendSuccessResponse(
      res,
      200,
      "MEMBER_UPDATED",
      "Workspace member updated successfully",
      updatedMember
    );
  } catch (error) {
    await session.abortTransaction();
    return sendErrorResponse(
      res,
      500,
      "UPDATE_MEMBER_FAILED",
      "Failed to update workspace member",
      error.message
    );
  } finally {
    session.endSession();
  }
};

export const removeWorkspaceMember = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { workspaceId, userId } = req.params;
    const currentUserId = req.user._id;

    // Validate current user permissions
    const currentUserMember = await WorkspaceMember.findOne({
      workspaceId,
      userId: currentUserId,
      status: "active",
    }).session(session);

    if (
      !currentUserMember ||
      !["admin", "owner"].includes(currentUserMember.role)
    ) {
      await session.abortTransaction();
      return sendErrorResponse(
        res,
        403,
        "PERMISSION_DENIED",
        "You don't have permission to remove members"
      );
    }

    // Get the member to remove
    const memberToRemove = await WorkspaceMember.findOne({
      workspaceId,
      userId,
      status: "active",
    }).session(session);

    if (!memberToRemove) {
      await session.abortTransaction();
      return sendErrorResponse(
        res,
        404,
        "MEMBER_NOT_FOUND",
        "Workspace member not found"
      );
    }

    // Prevent removing self
    if (userId === currentUserId) {
      await session.abortTransaction();
      return sendErrorResponse(
        res,
        400,
        "SELF_REMOVAL",
        "You cannot remove yourself from the workspace"
      );
    }

    // Prevent removing owners unless current user is owner
    if (memberToRemove.role === "owner" && currentUserMember.role !== "owner") {
      await session.abortTransaction();
      return sendErrorResponse(
        res,
        403,
        "PERMISSION_DENIED",
        "Only owners can remove other owners"
      );
    }

    // Prevent removing last owner
    if (memberToRemove.role === "owner") {
      const ownerCount = await WorkspaceMember.countDocuments({
        workspaceId,
        role: "owner",
        status: "active",
        userId: { $ne: userId },
      }).session(session);

      if (ownerCount === 0) {
        await session.abortTransaction();
        return sendErrorResponse(
          res,
          400,
          "LAST_OWNER",
          "Workspace must have at least one owner"
        );
      }
    }

    // Mark member as removed
    const removedMember = await WorkspaceMember.findOneAndUpdate(
      { _id: memberToRemove._id },
      { status: "removed" },
      { new: true, session }
    );

    await session.commitTransaction();

    // Emit removal event
    await eventBus.publish("workspace_events", "member.removed", {
      workspaceId,
      userId,
      removedBy: currentUserId,
    });

    return sendSuccessResponse(
      res,
      200,
      "MEMBER_REMOVED",
      "Workspace member removed successfully",
      removedMember
    );
  } catch (error) {
    await session.abortTransaction();
    return sendErrorResponse(
      res,
      500,
      "REMOVE_MEMBER_FAILED",
      "Failed to remove workspace member",
      error.message
    );
  } finally {
    session.endSession();
  }
};
