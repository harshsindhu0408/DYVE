import { Invite } from "../models/invitatie.model.js";
import { Workspace } from "../models/workspace.model.js";
import { WorkspaceMember } from "../models/workspaceMember.model.js";
import jwt from "jsonwebtoken";
import { config } from "../config/config.js";
import { generateInviteEmail } from "../emailTemplates/inviteWorkspaceTemplate.js";
import { sendEmail } from "../services/email.service.js";
import { requestUserData } from "../services/userAccess.js";
import { eventBus } from "../services/rabbit.js";
import {
  sendErrorResponse,
  sendSuccessResponse,
} from "../Utils/responseUtils.js";
import { getFullUrl } from "../Utils/urlHelper.js";

// tested
export const inviteUserByEmail = async (req, res) => {
  try {
    const { email, role = "guest", generateLink = false } = req.body;
    const { workspaceId } = req.params;
    const inviterId = req.user._id;

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

    // 2. Check Inviter's Role (same as before)
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

    // 3. Handle generateLink case (same as before)
    if (generateLink) {
      if (!workspace.allowPublicInvites) {
        return sendErrorResponse(
          res,
          403,
          "PUBLIC_INVITES_DISABLED",
          "This workspace doesn't accept public invites"
        );
      }

      const inviteToken = jwt.sign(
        { workspaceId, role, inviterId, isPublicLink: true },
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

    // 4. Validate email(s)
    if (!email || (Array.isArray(email) && email.length === 0)) {
      return sendErrorResponse(
        res,
        400,
        "EMAIL_REQUIRED",
        "Email address(es) are required"
      );
    }

    // 5. Normalize emails
    const emailArray = Array.isArray(email)
      ? email
      : typeof email === "string"
      ? email.split(",").map((e) => e.trim())
      : [];

    // 6. Prepare all invites concurrently
    const invitePromises = emailArray.map(async (singleEmail) => {
      try {
        // Check existing member
        const existingMember = await WorkspaceMember.findOne({
          workspaceId,
          email: singleEmail,
          status: "active",
        });
        if (existingMember) {
          return {
            email: singleEmail,
            status: "skipped",
            reason: "already_member",
          };
        }

        // Check existing invite
        const existingInvite = await Invite.findOne({
          email: singleEmail,
          workspaceId,
          status: "pending",
          expiresAt: { $gt: new Date() },
        });
        if (existingInvite) {
          return {
            email: singleEmail,
            status: "skipped",
            reason: "pending_invite_exists",
          };
        }

        // Create new invite
        const inviteToken = jwt.sign(
          {
            email: singleEmail,
            workspaceId,
            role,
            inviterId,
            isPublicLink: false,
          },
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

        // Prepare email
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

        // Send email (fire and forget)
        await sendEmail(singleEmail, emailSubject, emailHtml);
        return { email: singleEmail, status: "sent" };
      } catch (error) {
        console.error(`Error processing invite for ${singleEmail}:`, error);
        return { email: singleEmail, status: "failed", error: error.message };
      }
    });

    // Process all invites concurrently
    const results = await Promise.allSettled(invitePromises);

    // Analyze results
    const summary = {
      total: emailArray.length,
      sent: 0,
      skipped: 0,
      failed: 0,
      details: [],
    };

    results.forEach((result) => {
      if (result.status === "fulfilled") {
        const value = result.value;
        summary.details.push(value);
        if (value.status === "sent") summary.sent++;
        else if (value.status === "skipped") summary.skipped++;
        else if (value.status === "failed") summary.failed++;
      } else {
        summary.failed++;
        summary.details.push({
          status: "failed",
          error: result.reason.message,
        });
      }
    });

    return sendSuccessResponse(
      res,
      201,
      "INVITES_PROCESSED",
      "Invitations processed",
      { summary }
    );
  } catch (error) {
    return sendErrorResponse(res, 500, "INVITE_FAILED", error.message);
  }
};

// tested
export const acceptInvite = async (req, res) => {
  try {
    const { token } = req.body;
    const { slug } = req.params;

    // Verify and decode JWT token
    const decoded = jwt.verify(token, config.jwt.invitationSecret);
    const { email, workspaceId, role, inviterId, isPublicLink } = decoded;
    const isPublicInvite = isPublicLink;

    // For public invites, validate workspace slug matches
    let workspace;
    let ownerId;
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
      ownerId = workspace.ownerId;
    } else {
      // For non-public invites, get the workspace to find the owner
      workspace = await Workspace.findById(workspaceId);
      if (!workspace) {
        return sendErrorResponse(
          res,
          404,
          "WORKSPACE_NOT_FOUND",
          "Workspace not found"
        );
      }
      ownerId = workspace.ownerId;
    }

    // Handle authentication - user must be logged in
    if (!req.user) {
      return res.redirect(
        `${config.frontendUrl}/signup?inviteToken=${token}&workspaceSlug=${slug}`
      );
    }
    const userId = req.user._id;

    // Fetch user data once
    const userDataService = await requestUserData(userId);

    // For email invites (non-public), verify the user's email matches
    if (!isPublicInvite && !isPublicLink) {
      if (userDataService?.email?.toLowerCase() !== email.toLowerCase()) {
        return sendErrorResponse(
          res,
          403,
          "INVALID_EMAIL",
          "You can only accept invites sent to your email address"
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

    // For email invites, validate the specific invite exists
    if (!isPublicInvite && !isPublicLink) {
      const invite = await Invite.findOne({
        token,
        email,
        workspaceId,
        status: "pending", // Only accept pending invites
        expiresAt: { $gt: new Date() },
      });

      if (!invite) {
        return sendErrorResponse(
          res,
          400,
          "INVALID_INVITE",
          "Invalid, expired or revoked invitation"
        );
      }

      // Additional check for revoked status
      if (invite.status === "revoked") {
        return sendErrorResponse(
          res,
          400,
          "INVITE_REVOKED",
          "This invitation has been revoked by an admin"
        );
      }

      // Mark email invite as used
      await Invite.updateOne({ _id: invite._id }, { status: "accepted" });
    }

    // Create workspace membership
    const membership = await WorkspaceMember.create({
      userId,
      workspaceId,
      role:
        isPublicInvite || isPublicLink
          ? workspace?.defaultRole || "member"
          : role,
      invitedBy: inviterId,
      status: "active",
      joinedVia: isPublicInvite ? "public_link" : "email_invite",
      userDisplay: {
        name: userDataService.name,
        bio: userDataService.bio,
        avatar: userDataService.avatar,
        status: userDataService.status,
      },
      email: userDataService.email,
    });

    // Emit real-time event with all required data
    await eventBus.publish("workspace_events", "workspace.member.joined", {
      workspaceId,
      ownerId, // Now properly included
      userId,
      membership,
      userData: userDataService,
      workspaceName: workspace.name,
      defaultChannel: {
        name: "general",
        description: "General discussion channel",
      },
    });

    return sendSuccessResponse(
      res,
      200,
      "INVITE_ACCEPTED",
      "Successfully joined workspace",
      {
        workspaceId,
        ...((isPublicInvite || isPublicLink) && { workspaceSlug: slug }),
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

// tested
export const revokeInvitation = async (req, res) => {
  try {
    const { inviteId } = req.params;
    const userId = req.user._id; // Current user ID from JWT

    // 1. First find the invitation to get workspaceId
    const invitation = await Invite.findOne({
      _id: inviteId,
      status: "pending", // Only revoke pending invites
    });

    if (!invitation) {
      return sendErrorResponse(
        res,
        404,
        "INVITE_NOT_FOUND",
        "Invitation not found or already processed"
      );
    }

    const { workspaceId } = invitation;

    // 2. Verify the requesting user has admin permissions in this workspace
    const member = await WorkspaceMember.findOne({
      workspaceId,
      userId,
      status: "active", // Only check active members
    });

    if (!member) {
      return sendErrorResponse(
        res,
        403,
        "NOT_A_MEMBER",
        "You are not a member of this workspace"
      );
    }

    const { role } = member;

    if (role !== "admin" && role !== "owner") {
      return sendErrorResponse(
        res,
        403,
        "FORBIDDEN",
        "Admin access required to revoke invitations"
      );
    }

    // 3. Revoke the invitation
    const updatedInvite = await Invite.findOneAndUpdate(
      { _id: inviteId },
      { status: "revoked" },
      { new: true }
    );

    if (!updatedInvite) {
      return sendErrorResponse(
        res,
        500,
        "REVOKE_FAILED",
        "Failed to revoke invitation"
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "INVITE_REVOKED",
      "Invitation successfully revoked",
      { invite: updatedInvite }
    );
  } catch (error) {
    return sendErrorResponse(res, 500, "SERVER_ERROR", error.message);
  }
};

// tested
export const listInvites = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.user._id; // From JWT

    // Verify Admin Permissions
    const member = await WorkspaceMember.findOne({
      workspaceId,
      userId,
    });

    console.log("memeber is ----", member);

    if (!member) {
      return sendErrorResponse(
        res,
        404,
        "NOT_FOUND",
        "Member not found in workspace"
      );
    }

    const { role } = member;

    if (role === "admin" || role === "owner") {
      // ✅ Allowed
    } else {
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

// tested
export const getPendingInvitesForUser = async (req, res) => {
  try {
    // 1. Authentication validation
    if (!req.user?._id) {
      return sendErrorResponse(
        res,
        401,
        "UNAUTHORIZED",
        "Authentication required"
      );
    }

    const { _id: userId, email } = req.user;

    // 2. Email validation
    if (!email) {
      return sendErrorResponse(res, 400, "BAD_REQUEST", "User email not found");
    }

    // 3. Single optimized query with all required data
    const invites = await Invite.aggregate([
      {
        $match: {
          $or: [{ email: email.toLowerCase() }, { userId: userId }],
          status: "pending",
          expiresAt: { $gt: new Date() },
        },
      },
      // Lookup workspace details
      {
        $lookup: {
          from: "workspaces",
          localField: "workspaceId",
          foreignField: "_id",
          as: "workspace",
        },
      },
      { $unwind: { path: "$workspace", preserveNullAndEmptyArrays: false } },
      // Filter out deleted workspaces
      { $match: { "workspace.isDeleted": { $ne: true } } },
      // Lookup inviter details
      {
        $lookup: {
          from: "users",
          localField: "invitedBy",
          foreignField: "_id",
          as: "inviter",
        },
      },
      { $unwind: { path: "$inviter", preserveNullAndEmptyArrays: true } },
      // Lookup workspace members count
      {
        $lookup: {
          from: "workspacemembers",
          localField: "workspaceId",
          foreignField: "workspaceId",
          as: "members",
          pipeline: [
            { $match: { status: "active" } }, // Only count active members
            { $project: { _id: 1, userDisplay: 1 } }, // Only get needed fields
          ],
        },
      },
      // Project only necessary fields
      {
        $project: {
          token: 0,
          __v: 0,
          "workspace.__v": 0,
          "workspace.isDeleted": 0,
          "inviter.password": 0,
          "inviter.__v": 0,
          "inviter.tokens": 0,
        },
      },
    ]);

    // 4. Format response with all required data
    const responseData = invites.map((invite) => {
      // Get up to 5 member avatars for preview
      const memberAvatars = invite.members
        .slice(0, 5)
        .filter((m) => m.userDisplay?.avatar)
        .map((m) => ({
          avatar: m.userDisplay.avatar,
          name: m.userDisplay.name,
        }));

      return {
        id: invite._id,
        workspace: {
          ...invite.workspace,
          logo: invite.workspace.logo
            ? {
                path: invite.workspace.logo.path,
                url: invite.workspace.logo.url,
              }
            : null,
          memberCount: invite.members.length,
          memberAvatars,
        },
        role: invite.role,
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt,
        inviter: invite.inviter
          ? {
              name:
                invite.inviter.name ||
                `${invite.inviter.firstName} ${invite.inviter.lastName}`,
              avatar: invite.inviter.avatar ? invite.inviter.avatar : null,
            }
          : null,
      };
    });

    return sendSuccessResponse(
      res,
      200,
      "USER_INVITES_FETCHED",
      "Pending invites fetched successfully",
      responseData
    );
  } catch (error) {
    console.error("[getPendingInvitesForUser] Error:", error);

    if (error.name === "CastError") {
      return sendErrorResponse(res, 400, "BAD_REQUEST", "Invalid data format");
    }

    return sendErrorResponse(
      res,
      500,
      "SERVER_ERROR",
      "An unexpected error occurred",
      process.env.NODE_ENV === "development" ? error.stack : undefined
    );
  }
};
