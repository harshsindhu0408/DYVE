import { handleUpdateMemberRole } from "../rpcHandlers/workspaceRpcHandlers.js";
import { sendSuccessResponse, sendErrorResponse } from "../utils/responseUtils.js";
import mongoose from "mongoose";

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