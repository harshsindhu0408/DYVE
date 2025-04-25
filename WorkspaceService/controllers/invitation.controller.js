import { Invite } from "../models/invitatie.model.js";
import { Workspace } from "../models/workspace.model.js";
import { WorkspaceMember } from "../models/workspaceMember.model.js";
import jwt from "jsonwebtoken";
import { config } from "../config/config.js";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../utils/responseUtils.js";
import redis from "../services/redis.js";
import { verifyUserViaEventBus } from "../services/verifyUserViaEventBus.js";
import { generateInviteEmail } from "../emailTemplates/inviteWorkspaceTemplate.js";
import { sendEmail } from "../services/email.service.js";

export const inviteUserByEmail = async (req, res) => {
  try {
    const { email, role = "member" } = req.body;
    const { workspaceId } = req.params;
    const inviterId = req.user._id; // From JWT

    // 1. Validate Workspace Exists
    const workspace = await Workspace.findOne({
      _id: workspaceId,
      isDeleted: false,
    });
    if (!workspace) {
      return sendErrorResponse(
        res,
        404,
        "WORKSPACE_NOT_FOUND",
        "Workspace not found"
      );
    }

    // 2. Check Inviter's Role in Workspace
    const inviterMembership = await WorkspaceMember.findOne({
      workspaceId,
      userId: inviterId,
      status: "active",
    }).lean();

    // 2a. Only workspace owner (superAdmin) can invite admins
    if (role === "admin" && workspace.ownerId.toString() !== inviterId) {
      return sendErrorResponse(
        res,
        403,
        "FORBIDDEN",
        "Only workspace owner can invite admins"
      );
    }

    // 2b. Only owner/admins can invite anyone
    if (
      !inviterMembership ||
      !["admin", "owner"].includes(inviterMembership.role)
    ) {
      return sendErrorResponse(
        res,
        403,
        "FORBIDDEN",
        "You need admin privileges to invite users"
      );
    }

    // 3. Prevent inviting existing active members
    const existingMember = await WorkspaceMember.findOne({
      workspaceId,
      email, // Or userId after lookup
      status: "active",
    });
    if (existingMember) {
      return sendErrorResponse(
        res,
        400,
        "MEMBER_EXISTS",
        "User is already a member of this workspace"
      );
    }

    // 4. Create Invite (same as before)
    const inviteToken = jwt.sign(
      { email, workspaceId, role, inviterId },
      config.jwt.invitationSecret,
      { expiresIn: "7d" }
    );

    const newInvite = new Invite({
      email,
      workspaceId,
      role,
      token: inviteToken,
      invitedBy: inviterId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    await newInvite.save();

    const acceptUrl = `${config.app.frontendUrl}/accept-invite?token=${inviteToken}`;
    const emailSubject = `You've been invited to join ${workspace.name} on DYVE`;
    const emailHtml = generateInviteEmail({
      workspaceName: workspace.name,
      inviterName: req.user.profile.name,
      inviterAvatar: req.user.profile.avatar,
      role: role,
      acceptUrl: acceptUrl,
      expiryDays: 7,
    });

    await sendEmail(email, emailSubject, emailHtml);

    return sendSuccessResponse(res, 201, "INVITE_SENT", "Invitation sent");
  } catch (error) {
    return sendErrorResponse(res, 500, "INVITE_FAILED", error.message);
  }
};

export const acceptInvite = async (req, res) => {
  try {
    const { token } = req.body;

    // 1. Verify and decode JWT token
    const decoded = jwt.verify(token, config.jwt.invitationSecret);
    const { email, workspaceId, role } = decoded;

    // 2. Validate invite exists and is pending
    const invite = await Invite.findOne({
      token,
      email,
      workspaceId,
      status: "pending",
      expiresAt: { $gt: new Date() },
    });

    if (!invite) {
      return sendErrorResponse(
        res,
        400,
        "INVALID_INVITE",
        "Invalid or expired invitation"
      );
    }

    // 3. Check user existence (Redis cache first)
    let userId = await redis.get(`user:email:${email}`);

    // 4. If not cached, verify via RabbitMQ
    if (!userId) {
      try {
        userId = await verifyUserViaEventBus(email);
        if (!userId) {
          return sendErrorResponse(
            res,
            404,
            "USER_NOT_FOUND",
            "Please complete your registration before accepting the invite"
          );
        }
      } catch (err) {
        console.error("User verification failed:", err);
        return sendErrorResponse(
          res,
          503,
          "SERVICE_UNAVAILABLE",
          "User verification service is temporarily unavailable"
        );
      }
    }

    // 5. Create workspace membership
    const membership = await WorkspaceMember.create({
      userId,
      workspaceId,
      role,
      invitedBy: invite.invitedBy,
      status: "active",
    });

    // 6. Update invite status
    await Invite.updateOne({ _id: invite._id }, { status: "accepted" });

    // 7. Emit real-time event
    await eventBus.publish("workspace_events", "workspace.member_joined", {
      workspaceId,
      userId,
      membershipId: membership._id,
    });

    return sendSuccessResponse(
      res,
      200,
      "INVITE_ACCEPTED",
      "Successfully joined workspace",
      {
        workspaceId,
        membershipId: membership._id,
      }
    );
  } catch (error) {
    // Handle specific JWT errors
    if (error.name === "TokenExpiredError") {
      return sendErrorResponse(
        res,
        401,
        "INVITE_EXPIRED",
        "Invitation link has expired"
      );
    }

    if (error.name === "JsonWebTokenError") {
      return sendErrorResponse(
        res,
        400,
        "INVALID_TOKEN",
        "Malformed invitation token"
      );
    }

    // MongoDB errors
    if (error.name === "MongoError" && error.code === 11000) {
      return sendErrorResponse(
        res,
        409,
        "ALREADY_MEMBER",
        "User is already a member of this workspace"
      );
    }

    // Generic error
    console.error("Invite acceptance error:", error);
    return sendErrorResponse(
      res,
      500,
      "INVITE_ACCEPT_FAILED",
      "Failed to process invitation",
      error.message
    );
  }
};

export const revokeInvite = async (req, res) => {
  try {
    const { inviteId } = req.params;
    const userId = req.user._id;

    // Verify Admin Permissions
    const isAdmin = await WorkspaceMember.exists({
      _id: inviteId,
      userId,
      role: "admin",
    });

    if (!isAdmin) {
      return sendErrorResponse(res, 403, "FORBIDDEN", "Admin access required");
    }

    // Revoke the invite
    await Invite.updateOne({ _id: inviteId }, { status: "revoked" });

    return sendSuccessResponse(
      res,
      200,
      "INVITE_REVOKED",
      "Invitation revoked successfully"
    );
  } catch (error) {
    return sendErrorResponse(res, 500, "REVOKE_INVITE_FAILED", error.message);
  }
};

export const listInvites = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.userId; // From JWT

    // Verify Admin Permissions
    const isAdmin = await WorkspaceMember.exists({
      workspaceId,
      userId,
      role: "admin",
    });

    if (!isAdmin) {
      return sendErrorResponse(res, 403, "FORBIDDEN", "Admin access required");
    }

    const invites = await Invite.find({
      workspaceId,
      status: "pending",
    }).select("-token");

    return sendSuccessResponse(
      res,
      200,
      "INVITES_FETCHED",
      "Pending invites fetched",
      invites
    );
  } catch (error) {
    return sendErrorResponse(res, 500, "FETCH_INVITES_FAILED", error.message);
  }
};
