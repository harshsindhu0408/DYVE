import express from "express";
import {
  createChannel,
  updateChannel,
  getChannelById,
  getChannelsByWorkspaceId,
  getAllChannels,
  getChannelsByUserId,
  getChannelsByType,
  getChannelsByName,
  deleteChannel,
  archiveChannel,
  getMyChannels,
} from "../controllers/channel.controller.js";
import {
  userAuthMiddlewareForChannel,
  validateWorkspaceAdmin,
} from "../middlewares/authMiddleWare.js";

const router = express.Router();

// Specific routes first to avoid conflicts with parameterized routes
router.get("/workspace/:workspaceId", userAuthMiddlewareForChannel, getChannelsByWorkspaceId); // Get all channels in a workspace
router.get("/user/:userId", userAuthMiddlewareForChannel, getChannelsByUserId); // Get all channels created by a user
router.get("/type/:type", userAuthMiddlewareForChannel, getChannelsByType); // Get all channels of a specific type
router.get("/name/:name", userAuthMiddlewareForChannel, getChannelsByName); // Get all channels with a specific name
router.get("/me/:workspaceId", userAuthMiddlewareForChannel, getMyChannels); // Get channels of logged-in user in workspace

// Other routes
router.post("/", userAuthMiddlewareForChannel, validateWorkspaceAdmin, createChannel); // Create channel
router.patch("/:channelId", userAuthMiddlewareForChannel, validateWorkspaceAdmin, updateChannel); // Update channel
router.get("/", userAuthMiddlewareForChannel, getAllChannels); // Get all channels
router.delete("/:channelId", userAuthMiddlewareForChannel, validateWorkspaceAdmin, deleteChannel); // Delete channel by ID
router.patch("/archive/:channelId", userAuthMiddlewareForChannel, validateWorkspaceAdmin, archiveChannel); // Archive a channel

// General route LAST to prevent catching specific paths
router.get("/:channelId", userAuthMiddlewareForChannel, getChannelById); // Get channel by ID

export default router;
