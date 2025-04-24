import { WorkspaceMember, Workspace } from "../models/workspaceMember.model.js";
import mongoose from "mongoose";
import { eventBus } from "../services/rabbit.js";

export const handleCheckWorkspaceRole = async (channel, msg) => {
  try {
    const { workspaceId, userId } = msg.payload;

    const member = await WorkspaceMember.findOne({
      workspaceId,
      userId,
      status: "active",
    });

    return {
      data: {
        hasAccess: ["admin", "owner"].includes(member?.role),
        role: member?.role,
        isOwner: member?.role === "owner",
      },
    };
  } catch (error) {
    return {
      error: {
        code: "CHECK_ROLE_FAILED",
        message: error.message,
      },
    };
  }
};

export const handleUpdateMemberRole = async (channel, msg) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { workspaceId, userId, role, changedBy } = msg.payload;

    // Verify workspace exists
    const workspace = await Workspace.findById(workspaceId).session(session);
    if (!workspace) {
      throw new Error("Workspace not found");
    }

    // Get the member to update
    const memberToUpdate = await WorkspaceMember.findOne({
      workspaceId,
      userId,
      status: "active",
    }).session(session);

    if (!memberToUpdate) {
      throw new Error("Member not found in workspace");
    }

    // Save old role for audit
    const oldRole = memberToUpdate.role;
    memberToUpdate.role = role;
    await memberToUpdate.save({ session });

    // Commit transaction
    await session.commitTransaction();

    // Emit event
    await eventBus.publish("workspace_events", "member.role_updated", {
      workspaceId,
      userId,
      oldRole,
      newRole: role,
      changedBy,
      timestamp: new Date(),
    });

    return {
      data: {
        success: true,
        workspaceId,
        userId,
        newRole: role,
      },
    };
  } catch (error) {
    await session.abortTransaction();
    return {
      error: {
        code: "ROLE_UPDATE_FAILED",
        message: error.message,
      },
    };
  } finally {
    session.endSession();
  }
};

export const handleCheckOtherOwners = async (channel, msg) => {
  try {
    const { workspaceId, excludeUserId } = msg.payload;

    const ownerCount = await WorkspaceMember.countDocuments({
      workspaceId,
      role: "owner",
      userId: { $ne: excludeUserId },
      status: "active",
    });

    return {
      data: {
        hasOtherOwners: ownerCount > 0,
      },
    };
  } catch (error) {
    return {
      error: {
        code: "CHECK_OWNERS_FAILED",
        message: error.message,
      },
    };
  }
};