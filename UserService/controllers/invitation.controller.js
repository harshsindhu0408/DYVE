import User from "../models/user.model.js";
import jwt from "jsonwebtoken";
import {
  sendSuccessResponse,
  sendErrorResponse,
} from "../Utils/responseUtils.js";
import { config } from "../config/config.js";
import { generateTokens } from "../helpers/helperFunctions.js";
import Session from "../models/session.model.js";
import { sendEmail } from "../services/email.service.js";

/*
 @desc Invite a user
  @route POST /invite
  @body { email, role }
  @access Admin
*/
export async function inviteUser(req, res) {
  try {
    const { email, role = "member" } = req.body;
    const inviterId = req.userId;

    // Validate inviter's role
    const inviter = await User.findById(inviterId);
    if (!["admin", "superAdmin"].includes(inviter.role)) {
      return sendErrorResponse(
        res,
        403,
        "FORBIDDEN",
        "Only admins can invite users"
      );
    }

    // Validate role assignment
    if (role === "superAdmin" && inviter.role !== "superAdmin") {
      return sendErrorResponse(
        res,
        403,
        "FORBIDDEN",
        "Only superAdmins can invite other superAdmins"
      );
    }

    // Check if user already exists
    let user = await User.findOne({ email });
    if (user) {
      return sendErrorResponse(res, 400, "USER_EXISTS", "User already exists");
    }

    // Create invitation token
    const invitationToken = jwt.sign(
      { email, role, inviterId },
      config.jwt.invitationSecret,
      { expiresIn: "7d" }
    );

    // Create user with "invited" status
    user = new User({
      email,
      role,
      status: "invited",
      invitedBy: inviterId,
      invitationToken,
      invitationExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      profile: {
        name: email.split("@")[0], // Default name from email
      },
    });

    await user.save();

    // Send invitation email
    await sendEmail(email, invitationToken, inviter.profile.name);

    return sendSuccessResponse(
      res,
      201,
      "INVITATION_SENT",
      "Invitation sent successfully",
      {
        email: user.email,
        role: user.role,
        status: user.status,
      },
      "database"
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      "INVITATION_FAILED",
      "Invitation failed",
      error.message
    );
  }
}

/*
  @desc Accept an invitation
  @route POST /accept-invitation
  @body { token, password, name }
  @access Public
*/
export async function acceptInvitation(req, res) {
  try {
    const { token, password, name } = req.body;

    // Verify token
    const decoded = jwt.verify(token, config.jwt.invitationSecret);

    // Find invited user
    const user = await User.findOne({
      email: decoded.email,
      invitationToken: token,
      status: "invited",
      invitationExpires: { $gt: new Date() },
    });

    if (!user) {
      return sendErrorResponse(
        res,
        400,
        "INVALID_INVITATION",
        "Invalid or expired invitation"
      );
    }

    // Update user
    user.passwordHash = password;
    user.status = "active";
    user.profile.name = name || user.profile.name;
    user.invitationToken = undefined;
    user.invitationExpires = undefined;
    const encodedEmail = encodeURIComponent(user.email.trim().toLowerCase());
    user.profile.avatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodedEmail}`;

    await user.save();

    // Automatically log the user in (create session)
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Create session
    const session = new Session({
      userId: user._id,
      token: refreshToken,
      deviceInfo: req.headers["user-agent"] || "unknown",
      expiresAt: new Date(Date.now() + config.jwt.refreshExpirationMs),
    });

    await session.save();

    // Set refresh token in HTTP-only cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: config.jwt.refreshExpirationMs,
    });

    return sendSuccessResponse(
      res,
      200,
      "INVITATION_ACCEPTED",
      "Invitation accepted successfully",
      {
        user: {
          _id: user._id,
          email: user.email,
          profile: user.profile,
          role: user.role,
        },
        accessToken,
      },
      "database"
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      400,
      "INVITATION_ACCEPTANCE_FAILED",
      "Invitation acceptance failed",
      error.message
    );
  }
}

/*
  @desc List invitations
  @route GET /invitations
  @access Admin
  @query { status }
*/
export async function listInvitations(req, res) {
  try {
    const { status } = req.query;
    const inviterId = req.userId;

    const isValidStatus = ["invited", "active", "inactive", "revoked"].includes(
      status
    );

    if (!isValidStatus) {
      return sendErrorResponse(
        res,
        400,
        "INVALID_STATUS",
        "Invalid status provided"
      );
    }

    // Validate inviter's role
    const inviter = await User.findById(inviterId);
    if (!["admin", "superAdmin"].includes(inviter.role)) {
      return sendErrorResponse(
        res,
        403,
        "FORBIDDEN",
        "Only admins can view invitations"
      );
    }

    const filter = { invitedBy: inviterId };
    if (status) filter.status = status;

    const invitations = await User.find(filter).select(
      "-passwordHash -invitationToken -invitationExpires"
    );

    return sendSuccessResponse(
      res,
      200,
      "INVITATIONS_FETCHED",
      "Invitations fetched successfully",
      invitations,
      "database",
      invitations.length
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      "FETCH_INVITATIONS_FAILED",
      "Failed to fetch invitations",
      error.message
    );
  }
}

export async function resendInvitation(req, res) {
  // Implementation would:
  // 1. Verify admin privileges
  // 2. Check if user exists and is invited
  // 3. Generate new token
  // 4. Update expiration
  // 5. Resend email

  try {
    const { email } = req.body;
    const inviterId = req.userId;

    // Validate inviter's role
    const inviter = await User.findById(inviterId);
    if (!["admin", "superAdmin"].includes(inviter.role)) {
      return sendErrorResponse(
        res,
        403,
        "FORBIDDEN",
        "Only admins can resend invitations"
      );
    }

    // Check if user exists and is invited
    const user = await User.findOne({
      email,
      status: "invited",
      invitedBy: inviterId,
    });

    if (!user) {
      return sendErrorResponse(
        res,
        400,
        "USER_NOT_FOUND",
        "User not found or not invited"
      );
    }

    // Generate new token
    const newToken = jwt.sign(
      { email, role: user.role, inviterId },
      config.jwt.invitationSecret,
      { expiresIn: "7d" }
    );

    // Update user with new token and expiration
    user.invitationToken = newToken;
    user.invitationExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await user.save();

    // Send invitation email
    await sendEmail(email, newToken, inviter.profile.name);

    return sendSuccessResponse(
      res,
      200,
      "INVITATION_RESENT",
      "Invitation resent successfully",
      null,
      "database"
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      "RESEND_INVITATION_FAILED",
      "Failed to resend invitation",
      error.message
    );
  }
}

export async function revokeInvitation(req, res) {
  // Implementation would:
  // 1. Verify admin privileges
  // 2. Check if user exists and is invited
  // 3. Update status to revoked
  // 4. Optionally delete the user or keep for record
}
