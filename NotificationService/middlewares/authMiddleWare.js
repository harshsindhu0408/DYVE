import jwt from "jsonwebtoken";
import axios from "axios";
import { config } from "../config/config.js";
import {
  sendErrorResponse,
  sendSuccessResponse,
} from "../Utils/responseUtils.js";
import dotenv from "dotenv";
import { getCachedUserRole } from "../Utils/getUserRoleFromWorkspace.js";
dotenv.config();

export const userAuthMiddlewareForNotifications = async (req, res, next) => {
  try {
    // Check for Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        code: "MISSING_TOKEN",
        message: "Authorization token required in format: Bearer <token>",
      });
    }

    // Extract token
    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        code: "INVALID_TOKEN_FORMAT",
        message: "Token must be provided in format: Bearer <token>",
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.accessSecret);
    } catch (error) {
      console.error("JWT Verification Error:", error);
      return res.status(401).json({
        success: false,
        code:
          error.name === "TokenExpiredError"
            ? "TOKEN_EXPIRED"
            : "INVALID_TOKEN",
        message:
          error.name === "TokenExpiredError"
            ? "Token has expired"
            : "Invalid or malformed token",
      });
    }

    // Check if user exists
    let user;
    try {
      const response = await axios.get(`${config.userBaseUrl}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      user = response.data;
    } catch (err) {
      console.error("Error details:", {
        message: err.message,
        code: err.code,
        config: err.config?.url,
        response: err.response?.data,
      });
    }

    // Check if user exists and is active
    if (!user || !user.data) {
      return res.status(401).json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "User belonging to this token no longer exists",
      });
    }

    if (user.data.tokenVersion !== decoded.tokenVersion) {
      return res.status(401).json({
        success: false,
        code: "INVALID_TOKEN_VERSION",
        message: "Token is no longer valid",
      });
    }

    // Check if user is active
    if (user.data.status !== "active") {
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_DEACTIVATED",
        message: "Account is deactivated",
      });
    }

    // Attach user to request
    req.user = user.data;
    next();
  } catch (error) {
    console.error("Authentication error:", error);

    // Handle specific JWT errors
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        code: "INVALID_TOKEN",
        message: "Invalid or malformed token",
      });
    }

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        code: "TOKEN_EXPIRED",
        message: "Token has expired",
      });
    }

    res.status(500).json({
      success: false,
      code: "AUTH_ERROR",
      message: "Authentication failed",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const validateWorkspaceAdmin = async (req, res, next) => {
  try {
    const { workspaceId } = req.body;
    const userId = req.user._id;

    if (!workspaceId) {
      return sendErrorResponse(
        res,
        400,
        "WORKSPACE_ID_REQUIRED",
        "Workspace ID is required"
      );
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        code: "MISSING_TOKEN",
        message: "Authorization token required in format: Bearer <token>",
      });
    }

    // Extract token
    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        code: "INVALID_TOKEN_FORMAT",
        message: "Token must be provided in format: Bearer <token>",
      });
    }

    const role = await getCachedUserRole(userId, workspaceId, token);

    if (role !== "owner" && role !== "admin") {
      return sendErrorResponse(
        res,
        403,
        "FORBIDDEN",
        "Workspace admin access required"
      );
    }

    next();
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      "VALIDATION_ERROR",
      "Error checking workspace permissions"
    );
  }
};

export const validateWorkspaceUser = async (req, res, next) => {
  try {
    const { workspaceId } = req.body;
    const userId = req.user._id;

    if (!workspaceId) {
      return sendErrorResponse(
        res,
        400,
        "WORKSPACE_ID_REQUIRED",
        "Workspace ID is required"
      );
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        code: "MISSING_TOKEN",
        message: "Authorization token required in format: Bearer <token>",
      });
    }

    // Extract token
    const token = authHeader.split(" ")[1];

    const role = await getCachedUserRole(userId, workspaceId, token);

    if (!role) {
      return sendErrorResponse(
        res,
        403,
        "FORBIDDEN",
        "No workspace role found for user"
      );
    }

    next();
  } catch (error) {
    return sendErrorResponse(
      res,
      500,
      "VALIDATION_ERROR",
      "Error checking workspace permissions"
    );
  }
};

export const socketAuthMiddlewareForNotification = async (socket, next) => {
  try {
    // 1. Get token (from handshake auth or query)
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token ||
      socket.request.headers?.authorization?.split(" ")[1];

    if (!token) {
      console.log("[Socket.IO] No token provided");
      return next(new Error("MISSING_TOKEN: Authorization token required"));
    }

    if (token && token.startsWith("Bearer ")) {
      token = token.split(" ")[1];
    }

    socket.token = token;

    // 2. Verify token (same as HTTP middleware)
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.accessSecret);
    } catch (error) {
      console.error("[Socket.IO] JWT Verification Error:", error);
      return next(
        new Error(
          error.name === "TokenExpiredError"
            ? "TOKEN_EXPIRED: Token has expired"
            : "INVALID_TOKEN: Invalid or malformed token"
        )
      );
    }

    // 3. Verify user with user service (same as HTTP)
    let user;
    try {
      const response = await axios.get(`${config.userBaseUrl}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      user = response.data;
    } catch (err) {
      console.error("[Socket.IO] User service error:", {
        message: err.message,
        url: err.config?.url,
        status: err.response?.status,
      });
      return next(new Error("USER_SERVICE_ERROR: Unable to verify user"));
    }

    // 4. Validate user (same checks as HTTP)
    if (!user?.data) {
      return next(new Error("USER_NOT_FOUND: User no longer exists"));
    }

    if (user.data.tokenVersion !== decoded.tokenVersion) {
      return next(new Error("INVALID_TOKEN_VERSION: Token is no longer valid"));
    }

    if (user.data.status !== "active") {
      return next(new Error("ACCOUNT_DEACTIVATED: Account is deactivated"));
    }

    // 5. Attach user to socket (same as HTTP req.user)
    socket.user = user.data;
    console.log(`[Socket.IO] Authenticated user: ${user.data._id}`);
    next();
  } catch (error) {
    console.error("[Socket.IO] Auth error:", error);
    next(
      new Error(
        error.message.includes(":")
          ? error.message
          : "AUTH_ERROR: Authentication failed"
      )
    );
  }
};
