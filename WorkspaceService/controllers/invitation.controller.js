import { Invite } from "../models/invitatie.model.js";
import { Workspace } from "../models/workspace.model.js";
import { WorkspaceMember } from "../models/workspaceMember.model.js";
import jwt from "jsonwebtoken";
import { config } from "../config/config.js";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../utils/responseUtils.js";
import { verifyUserViaEventBus } from "../services/verifyUserViaEventBus.js";
import { generateInviteEmail } from "../emailTemplates/inviteWorkspaceTemplate.js";
import { sendEmail } from "../services/email.service.js";

// tested
export const inviteUserByEmail = async (req, res) => {
  try {
    const { email, role = "guest", generateLink = false } = req.body;
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

    // 2. Check Inviter's Role
    const inviterMembership = await WorkspaceMember.findOne({
      workspaceId,
      userId: inviterId,
      status: "active",
    }).lean();

    if (
      role === "admin" &&
      workspace.ownerId.toString() !== inviterId.toString()
    ) {
      return sendErrorResponse(
        res,
        403,
        "FORBIDDEN",
        "Only workspace owner can invite admins"
      );
    }

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

    // 3. If generateLink = true, no need for email
    if (generateLink) {
      const inviteToken = jwt.sign(
        { workspaceId, role, inviterId },
        config.jwt.invitationSecret,
        { expiresIn: "7d" }
      );

      const newInvite = new Invite({
        workspaceId,
        role,
        token: inviteToken,
        invitedBy: inviterId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isPublicLink: true,
      });
      await newInvite.save();

      const inviteLink = `${config.frontendUrl}/${workspace.slug}/accept-public-invite?token=${inviteToken}`;

      return sendSuccessResponse(
        res,
        201,
        "INVITE_LINK_GENERATED",
        "Invitation link generated",
        { inviteLink }
      );
    }

    // 4. If generateLink = false, email(s) are required
    if (!email || (Array.isArray(email) && email.length === 0)) {
      return sendErrorResponse(
        res,
        400,
        "EMAIL_REQUIRED",
        "Email address(es) are required to send invite(s)"
      );
    }

    // 5. Normalize email to array
    const emailArray = Array.isArray(email) ? email : [email];

    // 6. Invite each email individually
    for (const singleEmail of emailArray) {
      // 6a. Prevent inviting existing active members
      const existingMember = await WorkspaceMember.findOne({
        workspaceId,
        email: singleEmail,
        status: "active",
      });
      if (existingMember) {
        continue; // Skip if already member
      }

      const inviteToken = jwt.sign(
        { email: singleEmail, workspaceId, role, inviterId },
        config.jwt.invitationSecret,
        { expiresIn: "7d" }
      );

      const newInvite = new Invite({
        email: singleEmail,
        workspaceId,
        role,
        token: inviteToken,
        invitedBy: inviterId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isPublicLink: false,
      });
      await newInvite.save();

      const acceptUrl = `${config.frontendUrl}/accept-invite?token=${inviteToken}`;

      const emailSubject = `You've been invited to join ${workspace.name} on DYVE`;
      const emailHtml = generateInviteEmail({
        workspaceName: workspace.name,
        inviterName: req.user.profile.name,
        inviterAvatar: req.user.profile.avatar,
        role,
        acceptUrl,
        expiryDays: 7,
      });

      await sendEmail(singleEmail, emailSubject, emailHtml);
    }

    return sendSuccessResponse(
      res,
      201,
      "INVITES_SENT",
      "Invitations sent successfully"
    );
  } catch (error) {
    return sendErrorResponse(res, 500, "INVITE_FAILED", error.message);
  }
};

export const acceptInvite = async (req, res) => {
  try {
    const { token } = req.body;
    const { slug } = req.params;
    const isPublicInvite = !!slug; // Determine if this is a public invite

    // Verify and decode JWT token
    const decoded = jwt.verify(token, config.jwt.invitationSecret);
    const { email, workspaceId, role, inviterId } = decoded;

    // For public invites, validate workspace slug matches
    let workspace;
    if (isPublicInvite) {
      workspace = await Workspace.findOne({ slug, isDeleted: false });
      if (!workspace) {
        return sendErrorResponse(
          res,
          404,
          "WORKSPACE_NOT_FOUND",
          "Workspace not found"
        );
      }
      if (workspace._id.toString() !== workspaceId) {
        return sendErrorResponse(
          res,
          400,
          "INVALID_INVITE",
          "This invite doesn't belong to the specified workspace"
        );
      }
      if (!workspace.allowPublicInvites) {
        return sendErrorResponse(
          res,
          403,
          "PUBLIC_INVITES_DISABLED",
          "This workspace doesn't accept public invites"
        );
      }
    }

    // Validate invite exists and is pending
    const inviteQuery = isPublicInvite
      ? {
          token,
          workspaceId,
          status: "pending",
          expiresAt: { $gt: new Date() },
        }
      : {
          token,
          email,
          workspaceId,
          status: "pending",
          expiresAt: { $gt: new Date() },
        };

    const invite = await Invite.findOne(inviteQuery);
    if (!invite) {
      return sendErrorResponse(
        res,
        400,
        "INVALID_INVITE",
        "Invalid or expired invitation"
      );
    }

    // Handle authentication
    let userId;
    if (isPublicInvite) {
      if (!req.user) {
        return res.redirect(
          `${config.frontendUrl}/signup?inviteToken=${token}&workspaceSlug=${slug}`
        );
      }
      userId = req.user._id;
    } else {
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

    // Check if already a member
    const existingMember = await WorkspaceMember.findOne({
      workspaceId,
      userId,
    });
    if (existingMember) {
      return sendErrorResponse(
        res,
        400,
        "ALREADY_MEMBER",
        "You're already a member of this workspace"
      );
    }

    // Create workspace membership
    const membership = await WorkspaceMember.create({
      userId,
      workspaceId,
      role,
      invitedBy: inviterId || invite.invitedBy,
      status: "active",
      joinedVia: isPublicInvite ? "public_link" : "email_invite",
    });

    // Update invite status
    await Invite.updateOne(
      { _id: invite._id },
      {
        status: "accepted",
        ...(isPublicInvite && { acceptedBy: userId }),
      }
    );

    // Emit real-time event
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
        ...(isPublicInvite && { workspaceSlug: slug }),
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
