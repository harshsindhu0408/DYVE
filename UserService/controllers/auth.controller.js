import { User } from "../models/user.model.js";
import { Session } from "../models/session.model.js";
import jwt from "jsonwebtoken";
import {
  sendErrorResponse,
  sendSuccessResponse,
} from "../Utils/responseUtils.js";
import bcrypt from "bcryptjs";
import { comparePassword, hashPassword } from "../helpers/bcrypt.js";
import { generateTokens } from "../helpers/helperFunctions.js";
import { sendEmail } from "../services/email.service.js";
import { config } from "../config/config.js";
import { eventBus } from "../services/rabbit.js";
import {
  generateForgotPasswordEmail,
  generateLoginOTPEmail,
  generatePasswordResetConfirmationEmail,
} from "../emailTemplates/allEmailTemplates.js";
import crypto from "crypto";
import { getGeoLocation } from "../Utils/geoLocation.js";

// Tested
export async function register(req, res) {
  try {
    // 1. Input Validation
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return sendErrorResponse(
        res,
        400,
        "MISSING_REQUIRED_FIELDS",
        "Email, password and name are required fields",
        null
      );
    }

    // 2. Validate Password Strength
    if (password.length < 8) {
      return sendErrorResponse(
        res,
        400,
        "WEAK_PASSWORD",
        "Password must be at least 8 characters long",
        null
      );
    }

    // 3. Check for Existing User (case-insensitive)
    const existingUser = await User.findOne({
      email: { $regex: new RegExp(`^${email}$`, "i") },
    });
    if (existingUser) {
      return sendErrorResponse(
        res,
        409,
        "USER_EXISTS",
        "User with this email already exists",
        null
      );
    }

    // 4. Create User
    const hashedPassword = await hashPassword(password);
    const newUser = new User({
      email: email.toLowerCase().trim(),
      passwordHash: hashedPassword,
      profile: {
        name: name.trim(),
        avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
          name
        )}`,
      },
      status: "active",
    });

    // 5. Save User
    const user = await newUser.save();
    await eventBus.publish("user_events", "user.registered", {
      userId: user._id,
      email: user.email,
    });

    // 7. Response
    return sendSuccessResponse(
      res,
      201,
      "REGISTRATION_SUCCESSFUL",
      "Registered successfully",
      {
        email: newUser.email,
        role: newUser.role,
        status: newUser.status,
      },
      "database"
    );
  } catch (error) {
    console.error(error);
    return sendErrorResponse(
      res,
      500,
      "REGISTRATION_FAILED",
      "Creating account failed",
      process.env.NODE_ENV === "development" ? error.message : undefined
    );
  }
}

// Tested
export async function login(req, res) {
  try {
    // 1. Input Validation
    const { email, password } = req.body;
    if (!email || !password) {
      return sendErrorResponse(
        res,
        400,
        "CREDENTIALS_REQUIRED",
        "Email and password are required",
        null
      );
    }

    // 2. Find User (case-insensitive)
    const user = await User.findOne({
      email: { $regex: new RegExp(`^${email}$`, "i") },
    }).select("+passwordHash"); // Explicitly select passwordHash

    if (!user) {
      return sendErrorResponse(
        res,
        401,
        "USER_DONT_EXISTS",
        "Invvalid user or user does not exist",
        null
      );
    }

    // 3. Check Account Status
    if (user.status !== "active") {
      return sendErrorResponse(
        res,
        403,
        "ACCOUNT_INACTIVE",
        "Your account is not active. Please contact support.",
        null
      );
    }

    const isPasswordCorrect = await comparePassword(
      password,
      user.passwordHash
    );
    if (!isPasswordCorrect) {
      return sendErrorResponse(
        res,
        401,
        "INVALID_CREDENTIALS",
        "Invalid email or password",
        null
      );
    }

    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { $inc: { tokenVersion: 1 } },
      { new: true }
    );
    const { accessToken, refreshToken } = generateTokens(
      updatedUser._id,
      updatedUser.role,
      updatedUser.tokenVersion
    );

    // 6. Create Session
    await Session.deleteMany({ userId: user._id });
    const session = new Session({
      userId: user._id,
      token: refreshToken,
      deviceInfo: req.headers["user-agent"] || "unknown",
      ipAddress: req.ip,
      expiresAt: new Date(Date.now() + config.jwt.refreshExpirationMs),
    });

    await session.save();
    return sendSuccessResponse(
      res,
      200,
      "LOGIN_SUCCESSFUL",
      "Logged in successfully",
      {
        user: {
          _id: user._id,
          email: user.email,
          profile: user.profile,
          role: user.role,
          status: user.status,
        },
        accessToken,
        expiresIn: config.jwt.accessExpiration,
      },
      "database"
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      "LOGIN_FAILED",
      "Login failed due to server error",
      process.env.NODE_ENV === "development" ? error.message : undefined
    );
  }
}

export async function sendForgotPaswordOTP(req, res) {
  try {
    const { email } = req.body;

    // Validate input
    if (!email) {
      return sendErrorResponse(res, 400, "EMAIL_REQUIRED", "Email is required");
    }

    const user = await User.findOne({
      email: { $regex: new RegExp(`^${email}$`, "i") },
    });
    if (!user) {
      // Don't reveal if user doesn't exist (security best practice)
      return sendSuccessResponse(
        res,
        200,
        "OTP_SENT",
        "If this email exists in our system, you'll receive an OTP"
      );
    }

    // Check if user is active
    if (user.status !== "active") {
      return sendErrorResponse(
        res,
        403,
        "ACCOUNT_INACTIVE",
        "Your account is not active. Please contact support."
      );
    }

    // Generate secure OTP (6 digits)
    const otp = Math.floor(100000 + Math.random() * 900000);
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update user with OTP
    user.forgotPasswordOTP = otp;
    user.forgotPasswordOTPExpires = otpExpires;
    await user.save();

    // Send OTP via email (in production, you would queue this)
    await sendEmail(
      email,
      "Password Reset OTP",
      generateForgotPasswordEmail(otp)
    );

    return sendSuccessResponse(res, 200, "OTP_SENT", "OTP sent successfully", {
      email: user.email,
      userId: user._id,
      expiresIn: "10 minutes", // Inform client when OTP expires
    });
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      "FORGOT_PASSWORD_FAILED",
      "Failed to process password reset request",
      process.env.NODE_ENV === "development" ? error.message : undefined
    );
  }
}

export async function verifyForgotPasswordOTP(req, res) {
  try {
    const { email, otp } = req.body;

    // Validate input
    if (!email || !otp) {
      return sendErrorResponse(
        res,
        400,
        "EMAIL_AND_OTP_REQUIRED",
        "Both email and OTP are required"
      );
    }

    // Find user (case-insensitive search)
    const user = await User.findOne({
      email: { $regex: new RegExp(`^${email}$`, "i") },
    });
    if (!user) {
      return sendErrorResponse(
        res,
        400,
        "USER_DOES_NOT_EXIST",
        "User does not exist"
      );
    }

    // Check if OTP matches and is not expired
    if (
      user.forgotPasswordOTP !== parseInt(otp) ||
      new Date() > user.forgotPasswordOTPExpires
    ) {
      return sendErrorResponse(
        res,
        400,
        "INVALID_OTP",
        "Invalid OTP or expired"
      );
    }

    // Generate reset token first before clearing OTP
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpires = new Date(Date.now() + 10 * 60 * 1000);

    // Update all fields in a single operation
    user.forgotPasswordOTP = undefined;
    user.forgotPasswordOTPExpires = undefined;
    user.passwordResetToken = resetToken;
    user.passwordResetTokenExpires = resetTokenExpires;

    await user.save();

    await Session.deleteMany({ userId: user._id });

    return sendSuccessResponse(
      res,
      200,
      "OTP_VERIFIED",
      "OTP verified successfully",
      {
        email: user.email,
        userId: user._id,
        resetToken,
        expiresIn: "10 minutes",
      }
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      "OTP_VERIFICATION_FAILED",
      "Failed to verify OTP",
      process.env.NODE_ENV === "development" ? error.message : undefined
    );
  }
}

export async function setNewPassword(req, res) {
  try {
    const { email, newPassword, confirmPassword, resetToken } = req.body;

    if (!email || !newPassword || !confirmPassword || !resetToken) {
      return sendErrorResponse(
        res,
        400,
        "MISSING_FIELDS",
        "All fields including reset token are required"
      );
    }

    if (newPassword !== confirmPassword) {
      return sendErrorResponse(
        res,
        400,
        "PASSWORD_MISMATCH",
        "New password and confirmation do not match"
      );
    }

    // 2. Password Strength Validation
    if (newPassword.length < 8) {
      return sendErrorResponse(
        res,
        400,
        "WEAK_PASSWORD",
        "Password must be at least 8 characters long"
      );
    }

    // 3. Find User
    const user = await User.findOne({
      email: { $regex: new RegExp(`^${email}$`, "i") },
      passwordResetToken: resetToken,
      passwordResetTokenExpires: { $gt: new Date() },
    });
    if (!user) {
      return sendErrorResponse(
        res,
        400,
        "INVALID_RESET_TOKEN",
        "Invalid or expired reset token"
      );
    }

    // 4. Verify Account Status
    if (user.status !== "active") {
      return sendErrorResponse(
        res,
        403,
        "ACCOUNT_INACTIVE",
        "Your account is not active. Please contact support."
      );
    }

    // 5. Hash New Password
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    // 6. Update User
    user.passwordHash = passwordHash;
    user.forgotPasswordOTP = undefined;
    user.forgotPasswordOTPExpires = undefined;
    user.passwordResetToken = undefined;
    user.passwordResetTokenExpires = undefined;
    await user.save();

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
    const location = await getGeoLocation(ip);

    await sendEmail(
      email,
      "Password Changed Successfully",
      generatePasswordResetConfirmationEmail(location)
    );

    // 8. Invalidate All Sessions (optional but recommended)
    await Session.deleteMany({ userId: user._id });

    return sendSuccessResponse(
      res,
      200,
      "PASSWORD_RESET_SUCCESS",
      "Password reset successfully",
      {
        email: user.email,
        userId: user._id,
      }
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      "PASSWORD_RESET_FAILED",
      "Failed to reset password",
      process.env.NODE_ENV === "development" ? error.message : undefined
    );
  }
}

// Tested
export async function logoutUser(req, res) {
  try {
    const userId = req.user?._id;

    // 2. Validate user ID
    if (!userId) {
      return sendErrorResponse(
        res,
        401,
        "UNAUTHORIZED",
        "Authentication required"
      );
    }

    // 3. Find and validate user existence
    const user = await User.findById(userId);
    if (!user) {
      return sendErrorResponse(
        res,
        404,
        "USER_NOT_FOUND",
        "User does not exist"
      );
    }

    const { deletedCount } = await Session.deleteMany({ userId });
    await User.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } });

    if (deletedCount > 0) {
      return sendSuccessResponse(
        res,
        200,
        "LOGOUT_SUCCESSFUL", // Fixed typo in constant
        "Logged out successfully from all devices",
        { sessionsTerminated: deletedCount }
      );
    }

    // If no sessions were found but user is valid
    return sendSuccessResponse(
      res,
      200,
      "NO_ACTIVE_SESSIONS",
      "No active sessions found",
      { sessionsTerminated: 0 }
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      "LOGOUT_ERROR",
      "Failed to complete logout",
      process.env.NODE_ENV === "development" ? error.message : undefined
    );
  }
}

export async function sendMagicLoginOTP(req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return sendErrorResponse(
        res,
        400,
        "EMAIL_REQUIRED",
        "Email is required for magic login"
      );
    }

    // Normalize email (trim and lowercase)
    const normalizedEmail = email.toLowerCase().trim();

    // Find or create user (case-insensitive)
    let user = await User.findOne({
      email: { $regex: new RegExp(`^${normalizedEmail}$`, "i") },
    });

    const isNewUser = !user;

    // If new user, create a basic account
    if (isNewUser) {
      user = new User({
        email: normalizedEmail,
        profile: {
          name: normalizedEmail.split("@")[0], // Default name from email prefix
          avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
            normalizedEmail.split("@")[0]
          )}`,
        },
        status: "active",
        role: "member",
      });
    } else if (user.status !== "active") {
      // For existing users, check if account is active
      return sendErrorResponse(
        res,
        403,
        "ACCOUNT_INACTIVE",
        "Your account is not active. Please contact support."
      );
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000);
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update user with OTP
    user.loginOTP = otp;
    user.loginOTPExpires = otpExpires;
    await user.save();

    // Send OTP via email
    await sendEmail(
      normalizedEmail,
      "Your Login OTP",
      generateLoginOTPEmail(otp)
    );

    return sendSuccessResponse(res, 200, "OTP_SENT", "OTP sent successfully", {
      email: user.email,
      userId: user._id,
      expiresIn: "10 minutes",
      isNewUser, // Tell client if this is a new user account
    });
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      "OTP_SEND_FAILED",
      "Failed to send login OTP",
      process.env.NODE_ENV === "development" ? error.message : undefined
    );
  }
}

export async function verifyMagicLoginOTP(req, res) {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return sendErrorResponse(
        res,
        400,
        "EMAIL_AND_OTP_REQUIRED",
        "Both email and OTP are required"
      );
    }

    // Find user with OTP fields included
    const user = await User.findOne({
      email: { $regex: new RegExp(`^${email}$`, "i") },
    }).select("+loginOTP +loginOTPExpires"); // Explicitly include OTP fields

    if (!user) {
      return sendErrorResponse(res, 400, "USER_NOT_FOUND", "User not found");
    }

    // Check if OTP exists and is valid
    if (!user.loginOTP || !user.loginOTPExpires) {
      return sendErrorResponse(
        res,
        400,
        "OTP_NOT_GENERATED",
        "No OTP generated for this user OTP has been expired"
      );
    }

    if (parseInt(otp) !== user.loginOTP) {
      return sendErrorResponse(res, 400, "INVALID_OTP", "OTP does not match");
    }

    if (new Date() > user.loginOTPExpires) {
      return sendErrorResponse(res, 400, "OTP_EXPIRED", "OTP has expired");
    }

    // Clear OTP fields
    user.loginOTP = undefined;
    user.loginOTPExpires = undefined;
    user.tokenVersion += 1;
    await user.save();

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(
      user._id,
      user.role,
      user.tokenVersion
    );

    // Create new session
    await Session.deleteMany({ userId: user._id });
    const session = new Session({
      userId: user._id,
      token: refreshToken,
      deviceInfo: req.headers["user-agent"] || "unknown",
      ipAddress: req.ip,
      expiresAt: new Date(Date.now() + config.jwt.refreshExpirationMs),
    });

    await session.save();

    return sendSuccessResponse(
      res,
      200,
      "LOGIN_SUCCESSFUL",
      "Logged in successfully",
      {
        user: {
          _id: user._id,
          email: user.email,
          profile: user.profile,
          role: user.role,
          status: user.status,
        },
        accessToken,
        // refreshToken,
        expiresIn: config.jwt.accessExpiration,
      }
    );
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      "LOGIN_FAILED",
      "Failed to verify OTP and login",
      process.env.NODE_ENV === "development" ? error.message : undefined
    );
  }
}
