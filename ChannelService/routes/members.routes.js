import express from "express";
import {
  addToChannel,
  removeFromChannel,
  getChannelMembers,
  leaveChannel,
} from "../controllers/members.controller.js";

import {
  userAuthMiddlewareForChannel,
  validateWorkspaceAdmin,
} from "../middlewares/authMiddleWare.js";

const router = express.Router();

router.post(
  "/members/:channelId",
  userAuthMiddlewareForChannel,
  validateWorkspaceAdmin,
  addToChannel
);

router.post(
  "/members/:channelId/:userId",
  userAuthMiddlewareForChannel,
  validateWorkspaceAdmin,
  removeFromChannel
);

router.get(
  "/members/:channelId",
  userAuthMiddlewareForChannel,
  getChannelMembers
);

router.post(
  "/leave/:channelId",
  userAuthMiddlewareForChannel,
  leaveChannel
);


export default router;