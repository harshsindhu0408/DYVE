import jwt from "jsonwebtoken";
import {User} from "../models/user.model.js";
import { config } from "../config/config.js";

export const userAuthMiddleware = async (req, res, next) => {
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
    const decoded = jwt.verify(token, config.jwt.accessSecret);
    

    // Check if user exists
    const user = await User.findById(decoded._id).select("-password");
    if (!user) {
      return res.status(401).json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "User belonging to this token no longer exists",
      });
    }

    if (user.tokenVersion !== decoded.tokenVersion) {
      return res.status(401).json({
        success: false,
        code: "INVALID_TOKEN_VERSION",
        message: "Token is no longer valid"
      });
    }

    // Check if user is active
    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_DEACTIVATED",
        message: "Account is deactivated",
      });
    }

    // Attach user to request
    req.user = user;
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
