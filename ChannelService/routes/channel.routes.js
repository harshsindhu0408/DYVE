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

// Specific routes should come first
router.get("/me", userAuthMiddlewareForChannel, getMyChannels);

// Then parameterized routes
router.get("/:channelId", userAuthMiddlewareForChannel, getChannelById); // get channel by id
router.get(
  "/workspace/:workspaceId",
  userAuthMiddlewareForChannel,
  getChannelsByWorkspaceId
); // get all channels in a workspace by id
router.get("/user/:userId", userAuthMiddlewareForChannel, getChannelsByUserId); // Get all channels created by a specific user
router.get("/type/:type", userAuthMiddlewareForChannel, getChannelsByType); // Get all channels of a specific type
router.get("/name/:name", userAuthMiddlewareForChannel, getChannelsByName); // Get all channels with a specific name

// Other routes
router.post(
  "/",
  userAuthMiddlewareForChannel,
  validateWorkspaceAdmin,
  createChannel
); //create
router.patch(
  "/:channelId",
  userAuthMiddlewareForChannel,
  validateWorkspaceAdmin,
  updateChannel
); //update
router.get("/", userAuthMiddlewareForChannel, getAllChannels); // get all channels
router.delete(
  "/:channelId",
  userAuthMiddlewareForChannel,
  validateWorkspaceAdmin,
  deleteChannel
); // Delete a channel by ID
router.patch(
  "/archive/:channelId",
  userAuthMiddlewareForChannel,
  validateWorkspaceAdmin,
  archiveChannel
);

export default router;