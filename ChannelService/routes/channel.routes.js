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
} from "../controllers/channel.controller.js";

import { userAuthMiddlewareForWorkspace, validateWorkspaceAdmin } from "../middlewares/authMiddleWare.js";

const router = express.Router();

router.post("/create-channel", userAuthMiddlewareForWorkspace, validateWorkspaceAdmin, createChannel);

router.put("/:channelId", userAuthMiddlewareForWorkspace, validateWorkspaceAdmin, updateChannel);

router.get("/:channelId", userAuthMiddlewareForWorkspace, getChannelById);

router.get("/workspace/:workspaceId", userAuthMiddlewareForWorkspace, getChannelsByWorkspaceId);

router.get("/", userAuthMiddlewareForWorkspace, getAllChannels);

router.get("/user/:userId", getChannelsByUserId);

router.get("/type/:type", userAuthMiddlewareForWorkspace, getChannelsByType);

router.get("/name/:name", userAuthMiddlewareForWorkspace, getChannelsByName);

router.delete("/:channelId", userAuthMiddlewareForWorkspace, validateWorkspaceAdmin, deleteChannel);

export default router;

