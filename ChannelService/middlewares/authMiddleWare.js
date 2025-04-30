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

export const userAuthMiddlewareForChannel = async (req, res, next) => {
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

    const role = await getCachedUserRole(userId, workspaceId);

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
