import express from "express";
import { getVisibleDMUsers } from "../controllers/dm.controller.js";
import {
  userAuthMiddlewareForMessage,
  validateWorkspaceAdmin,
  validateWorkspaceUser,
} from "../middlewares/authMiddleWare.js";

const router = express.Router();

router.get("/dm/visible/:workspaceId",userAuthMiddlewareForMessage, validateWorkspaceUser, getVisibleDMUsers);

export default router;
